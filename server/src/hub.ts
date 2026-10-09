/**
 * Connection hub: authenticates sockets, routes messages, runs matchmaking,
 * owns the room registry, and persists results + ratings.
 */
import { randomInt } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type WebSocket from 'ws';
import type { Kysely } from 'kysely';
import type { ClientMsg, ServerMsg } from '../../src/net/protocol';
import { normalizeCode } from '../../src/net/protocol';
import type { Database, UsersTable } from './db';
import type { ServerConfig } from './config';
import { Auth, toPublicUser } from './auth';
import { Room, type Client, type RoomHost } from './room';
import { updateElo } from './rating';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HELLO_TIMEOUT_MS = 10_000;
const FINISHED_ROOM_TTL_MS = 10 * 60_000;

interface QueueEntry { client: Client; rated: boolean; rating: number; since: number }

export class Hub {
  readonly rooms = new Map<string, Room>();
  private userRoom = new Map<string, string>();
  private userClient = new Map<string, Client>();
  queue: QueueEntry[] = [];
  private matchTimer: NodeJS.Timeout;
  private roomHost: RoomHost;

  constructor(private db: Kysely<Database>, private auth: Auth, private cfg: ServerConfig, private now: () => number = Date.now) {
    this.matchTimer = setInterval(() => this.tryMatch(), 1000);
    this.roomHost = {
      now: this.now,
      clockMs: cfg.clockMs,
      disconnectGraceMs: cfg.disconnectGraceMs,
      onStart: (room) => this.persistStart(room),
      onFinish: (room) => this.persistFinish(room),
      onClosed: (room) => this.dropRoom(room),
    };
  }

  close() {
    clearInterval(this.matchTimer);
    for (const r of this.rooms.values()) r.close();
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
  }

  private onClose(client: Client) {
    if (this.userClient.get(client.user.id) === client) this.userClient.delete(client.user.id);
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
        const room = new Room(this.newCode(), false, this.roomHost);
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
  }
}
