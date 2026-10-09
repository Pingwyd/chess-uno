/**
 * Connection hub: authenticates sockets, routes messages, runs matchmaking,
 * owns the room registry, and persists results + ratings.
 */
import { randomInt, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type WebSocket from 'ws';
import type { Kysely } from 'kysely';
import type { ChallengeInfo, ClientMsg, FriendInfo, LiveGame, Presence, ServerMsg, SocialEvent } from '../../src/net/protocol';
import { normalizeCode } from '../../src/net/protocol';
import type { Database, UsersTable } from './db';
import type { ServerConfig } from './config';
import { Auth, toPublicUser } from './auth';
import { Room, type Client, type RoomHost } from './room';
import { updateElo } from './rating';
import { Social, friendInfo } from './social';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HELLO_TIMEOUT_MS = 10_000;
const FINISHED_ROOM_TTL_MS = 10 * 60_000;
export const CHALLENGE_TTL_MS = 60_000;
const LIVE_THROTTLE_MS = 1000;

interface QueueEntry { client: Client; rated: boolean; rating: number; since: number }
interface Challenge { info: ChallengeInfo; timer: NodeJS.Timeout }

export class Hub {
  readonly rooms = new Map<string, Room>();
  private userRoom = new Map<string, string>();
  private userClient = new Map<string, Client>();
  queue: QueueEntry[] = [];
  private matchTimer: NodeJS.Timeout;
  private roomHost: RoomHost;
  readonly social: Social;
  /** Open friend challenges by id. */
  readonly challenges = new Map<string, Challenge>();
  private liveTimer: NodeJS.Timeout | null = null;
  private liveDirty = false;

  constructor(private db: Kysely<Database>, private auth: Auth, private cfg: ServerConfig, private now: () => number = Date.now) {
    this.social = new Social(db);
    this.matchTimer = setInterval(() => this.tryMatch(), 1000);
    this.roomHost = {
      now: this.now,
      clockMs: cfg.clockMs,
      disconnectGraceMs: cfg.disconnectGraceMs,
      onStart: async (room) => {
        await this.persistStart(room);
        for (const s of room.seats) if (s) void this.presenceChanged(s.user.id);
        this.markLive();
      },
      onFinish: async (room) => {
        const out = await this.persistFinish(room);
        for (const s of room.seats) if (s) void this.presenceChanged(s.user.id);
        this.markLive();
        return out;
      },
      onClosed: (room) => this.dropRoom(room),
      onChange: () => this.markLive(),
    };
  }

  close() {
    clearInterval(this.matchTimer);
    if (this.liveTimer) clearTimeout(this.liveTimer);
    for (const c of this.challenges.values()) clearTimeout(c.timer);
    this.challenges.clear();
    for (const r of this.rooms.values()) r.close();
  }

  isOnline(userId: string) { return this.userClient.has(userId); }
  inGame(userId: string) { return this.activeRoomOf(userId)?.status === 'playing'; }

  /** Sign a user's socket out (deleted account). */
  dropUser(userId: string) {
    const c = this.userClient.get(userId);
    if (!c) return;
    this.removeFromQueue(c);
    const room = this.activeRoomOf(userId);
    if (room?.status === 'waiting') room.close();
    c.send({ t: 'error', code: 'auth', message: 'Your account was deleted' });
    try { c.ws.close(4003, 'deleted'); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------ connections

  handleConnection(ws: WebSocket, _req: IncomingMessage) {
    let client: Client | null = null;
    const helloTimer = setTimeout(() => { if (!client) ws.close(4001, 'hello timeout'); }, HELLO_TIMEOUT_MS);
    const send = (msg: ServerMsg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };

    ws.on('message', async (raw) => {
      let msg: ClientMsg;
      try {
        const text = raw.toString();
        if (text.length > 8192) return;
        msg = JSON.parse(text);
      } catch {
        return;
      }
      if (!client) {
        if (msg.t !== 'hello') { send({ t: 'error', code: 'auth', message: 'Say hello first' }); return; }
        const user = await this.auth.verify(msg.token);
        if (!user) { send({ t: 'error', code: 'auth', message: 'Invalid or expired session' }); ws.close(4003, 'auth'); return; }
        clearTimeout(helloTimer);
        client = { ws, user, send, spectating: null, chatTimes: [] };
        this.onHello(client);
        return;
      }
      try {
        await this.onMessage(client, msg);
      } catch (e) {
        send({ t: 'error', code: 'server', message: e instanceof Error ? e.message : 'Server error' });
      }
    });

    ws.on('close', () => {
      clearTimeout(helloTimer);
      if (client) this.onClose(client);
    });
  }

  private onHello(client: Client) {
    void this.loadFriends(client);
    const old = this.userClient.get(client.user.id);
    if (old && old !== client) {
      old.send({ t: 'error', code: 'replaced', message: 'You connected from another tab' });
      this.removeFromQueue(old);
      try { old.ws.close(4000, 'replaced'); } catch { /* ignore */ }
    }
    this.userClient.set(client.user.id, client);
    const code = this.userRoom.get(client.user.id) ?? null;
    client.send({ t: 'welcome', user: toPublicUser(client.user), activeRoom: code });
    if (code) this.rooms.get(code)?.attach(client);
    // Challenges that arrived while this player was on another tab / reconnecting.
    for (const c of this.challenges.values()) if (c.info.to.id === client.user.id) client.send({ t: 'challenge', challenge: c.info });
    if (!old) void this.presenceChanged(client.user.id);
  }

  private onClose(client: Client) {
    if (this.userClient.get(client.user.id) === client) {
      this.userClient.delete(client.user.id);
      void this.presenceChanged(client.user.id);
    }
    this.removeFromQueue(client);
    if (client.spectating) this.rooms.get(client.spectating)?.detach(client);
    const code = this.userRoom.get(client.user.id);
    if (code) this.rooms.get(code)?.detach(client);
  }

  private activeRoomOf(userId: string): Room | null {
    const code = this.userRoom.get(userId);
    const room = code ? this.rooms.get(code) : undefined;
    return room && room.status !== 'over' ? room : null;
  }

  private async onMessage(client: Client, msg: ClientMsg) {
    const uid = client.user.id;
    switch (msg.t) {
      case 'ping':
        client.send({ t: 'pong', at: msg.at, serverNow: this.now() });
        return;
      case 'queue': {
        if (this.activeRoomOf(uid)) return client.send({ t: 'error', code: 'busy', message: 'You are already in a game' });
        this.leaveSpectating(client);
        this.removeFromQueue(client);
        // Guests can play casual games only; ranked needs an account (design doc §11.1).
        const fresh = await this.refreshUser(client);
        const rated = !fresh.is_guest;
        this.queue.push({ client, rated, rating: fresh.rating, since: this.now() });
        client.send({ t: 'queued', rated });
        this.tryMatch();
        return;
      }
      case 'cancelQueue':
        this.removeFromQueue(client);
        client.send({ t: 'queueCancelled' });
        return;
      case 'createRoom': {
        if (this.activeRoomOf(uid)) return client.send({ t: 'error', code: 'busy', message: 'You are already in a game' });
        this.removeFromQueue(client);
        this.leaveSpectating(client);
        await this.refreshUser(client);
        const room = new Room(this.newCode(), false, this.roomHost, true);
        room.addPlayer(client);
        this.rooms.set(room.code, room);
        this.userRoom.set(uid, room.code);
        client.send({ t: 'roomCreated', code: room.code });
        return;
      }
      case 'joinRoom': {
        const room = this.rooms.get(normalizeCode(msg.code ?? ''));
        if (!room) return client.send({ t: 'error', code: 'notFound', message: 'No game with that code' });
        if (room.seatOf(uid) !== null) { room.attach(client); return; }
        if (room.status !== 'waiting') return client.send({ t: 'error', code: 'full', message: 'That game already has two players — you can watch it instead' });
        if (this.activeRoomOf(uid)) return client.send({ t: 'error', code: 'busy', message: 'You are already in a game' });
        this.removeFromQueue(client);
        this.leaveSpectating(client);
        await this.refreshUser(client);
        room.addPlayer(client);
        this.userRoom.set(uid, room.code);
        await room.start();
        return;
      }
      case 'spectate': {
        const room = this.rooms.get(normalizeCode(msg.code ?? ''));
        if (!room || room.status === 'waiting') return client.send({ t: 'error', code: 'notFound', message: 'That game has not started yet' });
        if (room.seatOf(uid) !== null) { room.attach(client); return; }
        this.leaveSpectating(client);
        room.addSpectator(client);
        return;
      }
      case 'leave': {
        this.removeFromQueue(client);
        this.leaveSpectating(client);
        const room = this.activeRoomOf(uid);
        if (room?.status === 'waiting') room.close();
        else if (!room) this.userRoom.delete(uid);
        client.send({ t: 'left' });
        return;
      }
      case 'challenge':
        return this.challenge(client, msg.userId);
      case 'challengeReply':
        return this.replyChallenge(client, msg.id, !!msg.accept);
      case 'live':
        client.liveOn = !!msg.on;
        if (client.liveOn) client.send({ t: 'liveGames', games: this.liveGames(client) });
        return;
      case 'action':
      case 'chat': {
        const room = this.activeRoomOf(uid) ?? this.rooms.get(this.userRoom.get(uid) ?? '') ?? (client.spectating ? this.rooms.get(client.spectating) : undefined);
        if (!room) return client.send({ t: 'error', code: 'noRoom', message: 'You are not in a game' });
        room.handle(client, msg);
        return;
      }
      default:
        client.send({ t: 'error', code: 'unknown', message: 'Unknown message' });
    }
  }

  private leaveSpectating(client: Client) {
    if (!client.spectating) return;
    this.rooms.get(client.spectating)?.detach(client);
    client.spectating = null;
  }

  private async refreshUser(client: Client): Promise<UsersTable> {
    const u = await this.db.selectFrom('users').selectAll().where('id', '=', client.user.id).executeTakeFirst();
    if (u) client.user = u;
    return client.user;
  }

  // ------------------------------------------------------------ matchmaking

  private removeFromQueue(client: Client) {
    this.queue = this.queue.filter((q) => q.client.user.id !== client.user.id);
  }

  /** Pair players of the same queue (rated/casual) whose rating gap fits a window that widens while waiting. */
  tryMatch() {
    const now = this.now();
    const window = (q: QueueEntry) => this.cfg.matchWindow + this.cfg.matchWidenPerSec * ((now - q.since) / 1000);
    const used = new Set<QueueEntry>();
    const sorted = [...this.queue].sort((a, b) => a.since - b.since);
    for (const a of sorted) {
      if (used.has(a)) continue;
      let best: QueueEntry | null = null;
      for (const b of sorted) {
        if (b === a || used.has(b) || b.rated !== a.rated) continue;
        const diff = Math.abs(a.rating - b.rating);
        if (diff > Math.max(window(a), window(b))) continue;
        if (!best || diff < Math.abs(a.rating - best.rating)) best = b;
      }
      if (best) {
        used.add(a);
        used.add(best);
        void this.startMatch(a, best);
      }
    }
    if (used.size) this.queue = this.queue.filter((q) => !used.has(q));
  }

  private async startMatch(a: QueueEntry, b: QueueEntry) {
    const room = new Room(this.newCode(), a.rated && b.rated, this.roomHost);
    room.addPlayer(a.client);
    room.addPlayer(b.client);
    this.rooms.set(room.code, room);
    this.userRoom.set(a.client.user.id, room.code);
    this.userRoom.set(b.client.user.id, room.code);
    await room.start();
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  // ------------------------------------------------------------ persistence

  private async persistStart(room: Room) {
    const [a, b] = room.seats;
    await this.db.insertInto('games').values({
      id: room.gameId, code: room.code, rated: room.rated ? 1 : 0, status: 'active',
      player0_id: a!.user.id, player1_id: b!.user.id, player0_color: room.player0Color, seed: room.seed,
      winner: null, reason: null, rating0_before: null, rating0_after: null, rating1_before: null, rating1_after: null,
      log: null, created_at: new Date().toISOString(), ended_at: null,
    }).execute();
  }

  private async persistFinish(room: Room) {
    const result = room.state!.result!;
    const ids = [room.seats[0]!.user.id, room.seats[1]!.user.id];
    const users = await Promise.all(ids.map((id) => this.db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirstOrThrow()));
    let ratingChange: [number, number] | null = null;
    let ratingAfter: [number, number] | null = null;
    const score: 0 | 0.5 | 1 = result.winner === null ? 0.5 : result.winner === 0 ? 1 : 0;
    if (room.rated) {
      ratingAfter = updateElo(
        { rating: users[0].rating, ratedGames: users[0].rated_games },
        { rating: users[1].rating, ratedGames: users[1].rated_games },
        score,
      );
      ratingChange = [ratingAfter[0] - users[0].rating, ratingAfter[1] - users[1].rating];
    }
    await this.db.transaction().execute(async (trx) => {
      for (const seat of [0, 1] as const) {
        const u = users[seat];
        const myScore = seat === 0 ? score : 1 - score;
        await trx.updateTable('users').set({
          wins: u.wins + (myScore === 1 ? 1 : 0),
          losses: u.losses + (myScore === 0 ? 1 : 0),
          draws: u.draws + (myScore === 0.5 ? 1 : 0),
          ...(ratingAfter ? { rating: ratingAfter[seat], rated_games: u.rated_games + 1 } : {}),
        }).where('id', '=', u.id).execute();
      }
      await trx.updateTable('games').set({
        status: 'finished',
        winner: result.winner,
        reason: room.endNote ?? result.reason,
        rating0_before: room.rated ? users[0].rating : null,
        rating1_before: room.rated ? users[1].rating : null,
        rating0_after: ratingAfter?.[0] ?? null,
        rating1_after: ratingAfter?.[1] ?? null,
        log: JSON.stringify(room.exportLog()),
        ended_at: new Date().toISOString(),
      }).where('id', '=', room.gameId).execute();
    });
    // Players are free to queue again; keep the room around a while for spectators/rejoin views.
    for (const id of ids) if (this.userRoom.get(id) === room.code) this.userRoom.delete(id);
    setTimeout(() => { if (this.rooms.get(room.code) === room) this.rooms.delete(room.code); }, FINISHED_ROOM_TTL_MS).unref();
    return { ratingChange, ratingAfter };
  }

  private dropRoom(room: Room) {
    this.rooms.delete(room.code);
    for (const s of room.seats) if (s && this.userRoom.get(s.user.id) === room.code) this.userRoom.delete(s.user.id);
    // A waiting room that closes (challenger left / disconnected) withdraws its challenge.
    for (const c of this.challenges.values()) {
      if (c.info.code !== room.code) continue;
      this.endChallenge(c.info.id);
      this.userClient.get(c.info.to.id)?.send({ t: 'challengeUpdate', id: c.info.id, status: 'cancelled', by: c.info.from.name });
    }
    for (const s of room.seats) if (s) void this.presenceChanged(s.user.id);
    this.markLive();
  }

  // ------------------------------------------------------------ friends & presence

  private async loadFriends(client: Client) {
    client.friendIds = client.user.is_guest ? new Set() : new Set(await this.social.friendIds(client.user.id));
  }

  presenceOf(userId: string): Presence {
    const room = this.activeRoomOf(userId);
    if (room?.status === 'playing') return { status: 'playing', code: room.code, rated: room.rated };
    return { status: this.userClient.has(userId) ? 'online' : 'offline' };
  }

  /** Tell a user's online friends where they are now. */
  async presenceChanged(userId: string) {
    const ids = await this.social.friendIds(userId).catch(() => [] as string[]);
    if (!ids.length) return;
    const presence = this.presenceOf(userId);
    for (const id of ids) this.userClient.get(id)?.send({ t: 'presence', userId, presence });
  }

  /** After a friendship change: push the event to the other player and refresh both cached friend sets. */
  async socialEvent(to: string, event: SocialEvent, from: UsersTable) {
    for (const id of [to, from.id]) {
      const c = this.userClient.get(id);
      if (c) await this.loadFriends(c);
    }
    const target = this.userClient.get(to);
    target?.send({ t: 'social', event, user: friendInfo(from) });
    if (event === 'accepted') {
      // Both sides immediately learn each other's presence.
      target?.send({ t: 'presence', userId: from.id, presence: this.presenceOf(from.id) });
      this.userClient.get(from.id)?.send({ t: 'presence', userId: to, presence: this.presenceOf(to) });
    }
    this.markLive();
  }

  // ------------------------------------------------------------ challenges

  private async challenge(client: Client, targetId: string) {
    const me = await this.refreshUser(client);
    const fail = (message: string) => client.send({ t: 'error', code: 'challenge', message });
    if (me.is_guest) return fail('Create a free account to challenge friends');
    if (typeof targetId !== 'string' || targetId === me.id) return fail('Pick a friend to challenge');
    if (this.activeRoomOf(me.id)) return fail('You are already in a game');
    if (await this.social.relation(me.id, targetId) !== 'friends') return fail('You can only challenge friends');
    const target = this.userClient.get(targetId);
    if (!target) return fail('Your friend is offline');
    if (this.activeRoomOf(targetId)) return fail('Your friend is in a game right now');
    for (const c of this.challenges.values()) if (c.info.from.id === me.id) return fail('You already have a challenge waiting');
    this.removeFromQueue(client);
    this.leaveSpectating(client);
    const room = new Room(this.newCode(), false, this.roomHost, true);
    room.invitee = friendInfo(target.user);
    room.addPlayer(client);
    this.rooms.set(room.code, room);
    this.userRoom.set(me.id, room.code);
    const info: ChallengeInfo = {
      id: randomUUID(), from: friendInfo(me), to: friendInfo(target.user), code: room.code, expiresAt: this.now() + CHALLENGE_TTL_MS,
    };
    const timer = setTimeout(() => this.lapseChallenge(info.id, 'expired'), CHALLENGE_TTL_MS);
    timer.unref?.();
    this.challenges.set(info.id, { info, timer });
    client.send({ t: 'roomCreated', code: room.code, invitee: info.to });
    target.send({ t: 'challenge', challenge: info });
  }

  private endChallenge(id: string) {
    const c = this.challenges.get(id);
    if (!c) return null;
    clearTimeout(c.timer);
    this.challenges.delete(id);
    return c.info;
  }

  /** Declined or expired: close the waiting room and tell both players. */
  private lapseChallenge(id: string, status: 'declined' | 'expired') {
    const info = this.endChallenge(id);
    if (!info) return;
    const by = status === 'declined' ? info.to.name : info.from.name;
    this.userClient.get(info.from.id)?.send({ t: 'challengeUpdate', id, status, by });
    this.userClient.get(info.to.id)?.send({ t: 'challengeUpdate', id, status, by });
    const room = this.rooms.get(info.code);
    if (room?.status === 'waiting') {
      room.close();
      this.userClient.get(info.from.id)?.send({ t: 'left' });
    }
  }

  private async replyChallenge(client: Client, id: string, accept: boolean) {
    const c = this.challenges.get(id);
    if (!c || c.info.to.id !== client.user.id) return client.send({ t: 'error', code: 'challenge', message: 'That challenge is no longer open' });
    if (!accept) return this.lapseChallenge(id, 'declined');
    const room = this.rooms.get(c.info.code);
    if (!room || room.status !== 'waiting') {
      this.endChallenge(id);
      return client.send({ t: 'error', code: 'challenge', message: 'That challenge is no longer open' });
    }
    if (this.activeRoomOf(client.user.id)) return client.send({ t: 'error', code: 'busy', message: 'Finish your current game first' });
    this.endChallenge(id);
    this.userClient.get(c.info.from.id)?.send({ t: 'challengeUpdate', id, status: 'accepted', by: client.user.name });
    this.removeFromQueue(client);
    this.leaveSpectating(client);
    await this.refreshUser(client);
    room.addPlayer(client);
    this.userRoom.set(client.user.id, room.code);
    await room.start();
  }

  // ------------------------------------------------------------ live games

  /**
   * Games in progress, top-rated first. Quick Match games are public; private rooms (invite links,
   * friend challenges) are only listed for friends of a player.
   */
  liveGames(viewer: { user: { id: string }; friendIds?: Set<string> } | null): LiveGame[] {
    const friends = viewer?.friendIds ?? new Set<string>();
    const out: LiveGame[] = [];
    for (const room of this.rooms.values()) {
      if (room.status !== 'playing' || !room.state) continue;
      const [a, b] = room.seats;
      if (!a || !b) continue;
      const friend = friends.has(a.user.id) || friends.has(b.user.id);
      const mine = viewer && (a.user.id === viewer.user.id || b.user.id === viewer.user.id);
      if (room.isPrivate && !friend && !mine) continue;
      const players: [FriendInfo, FriendInfo] = [friendInfo(a.user), friendInfo(b.user)];
      out.push({
        code: room.code, rated: room.rated, private: room.isPrivate, players, friend,
        spectators: room.spectators.size, turn: room.state.turnNumber, startedAt: room.startedAt,
      });
    }
    const score = (g: LiveGame) => (g.players[0].rating + g.players[1].rating) / 2;
    return out.sort((x, y) => score(y) - score(x) || y.startedAt - x.startedAt).slice(0, 50);
  }

  /** Coalesce live-list changes and push them to subscribers at most once a second. */
  private markLive() {
    this.liveDirty = true;
    if (this.liveTimer) return;
    this.liveTimer = setTimeout(() => {
      this.liveTimer = null;
      if (!this.liveDirty) return;
      this.liveDirty = false;
      for (const c of this.userClient.values()) if (c.liveOn) c.send({ t: 'liveGames', games: this.liveGames(c) });
    }, LIVE_THROTTLE_MS);
    this.liveTimer.unref?.();
  }
}
