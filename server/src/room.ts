/**
 * One online game. The server is authoritative: it owns the seeded deck,
 * validates every action with the shared rules reducer, runs both clocks and
 * decides when the game is over.
 */
import { randomInt, randomUUID } from 'node:crypto';
import type WebSocket from 'ws';
import {
  applyAction, createGame, remainingMs, type GameAction, type GameState, type PlayerId,
} from '../../src/rules/game';
import {
  CHAT_MAX_LENGTH, EMOTES, type ChatMessage, type ClientMsg, type RoomResultInfo, type RoomSnapshot, type SeatInfo, type ServerMsg,
} from '../../src/net/protocol';
import type { UsersTable } from './db';
import { redactState } from './redact';

export interface Client {
  ws: WebSocket;
  user: UsersTable;
  send(msg: ServerMsg): void;
  /** Code of the room this client is spectating. */
  spectating: string | null;
  chatTimes: number[];
}

interface Seat {
  user: UsersTable;
  client: Client | null;
  graceUntil: number | null;
  graceTimer: NodeJS.Timeout | null;
}

export interface RoomHost {
  now(): number;
  clockMs: number;
  disconnectGraceMs: number;
  onStart(room: Room): Promise<void> | void;
  onFinish(room: Room): Promise<{ ratingChange: [number, number] | null; ratingAfter: [number, number] | null }>;
  onClosed(room: Room): void;
}

const PLAYER_ACTIONS = new Set(['draw', 'playCard', 'resolveOverflow', 'move', 'resign']);
const CHAT_WINDOW_MS = 10_000;
const CHAT_MAX_PER_WINDOW = 5;

export interface LoggedAction { at: number; seat: PlayerId; action: GameAction }

export class Room {
  readonly gameId = randomUUID();
  readonly seed = randomInt(2 ** 31 - 1);
  readonly player0Color: 'w' | 'b' = randomInt(2) === 0 ? 'w' : 'b';
  status: 'waiting' | 'playing' | 'over' = 'waiting';
  seats: [Seat | null, Seat | null] = [null, null];
  state: GameState | null = null;
  readonly spectators = new Set<Client>();
  readonly actions: LoggedAction[] = [];
  readonly chat: ChatMessage[] = [];
  result: RoomResultInfo | null = null;
  endNote: 'abandoned' | undefined;
  private chatSeq = 1;
  private clockTimer: NodeJS.Timeout | null = null;
  /** Authoritative state at the start of each turn (for delayed spectating). */
  private turnStarts: GameState[] = [];
  private lastTurnNumber = -1;

  constructor(readonly code: string, readonly rated: boolean, private host: RoomHost) {}

  seatOf(userId: string): PlayerId | null {
    if (this.seats[0]?.user.id === userId) return 0;
    if (this.seats[1]?.user.id === userId) return 1;
    return null;
  }

  addPlayer(client: Client): PlayerId {
    const seat: PlayerId = this.seats[0] ? 1 : 0;
    this.seats[seat] = { user: client.user, client, graceUntil: null, graceTimer: null };
    return seat;
  }

  async start() {
    const [a, b] = this.seats as [Seat, Seat];
    const now = this.host.now();
    this.state = createGame({
      seed: this.seed,
      clockMs: this.host.clockMs,
      player0Color: this.player0Color,
      players: [{ name: a.user.name, kind: 'human' }, { name: b.user.name, kind: 'human' }],
    }, now);
    this.status = 'playing';
    this.recordTurnStart();
    await this.host.onStart(this);
    this.scheduleClock();
    this.broadcast();
    this.sendChatHistory();
  }

  /** (Re)attach a seated player's socket — used for reconnects. */
  attach(client: Client) {
    const seat = this.seatOf(client.user.id);
    if (seat === null) return;
    const s = this.seats[seat]!;
    if (s.client && s.client !== client) {
      s.client.send({ t: 'error', code: 'replaced', message: 'You connected from another tab' });
      try { s.client.ws.close(); } catch { /* ignore */ }
    }
    s.client = client;
    s.graceUntil = null;
    if (s.graceTimer) clearTimeout(s.graceTimer);
    s.graceTimer = null;
    if (this.status === 'waiting') client.send({ t: 'roomCreated', code: this.code });
    else {
      this.broadcast();
      client.send({ t: 'chatHistory', msgs: this.chat });
    }
  }

  detach(client: Client) {
    if (this.spectators.delete(client)) { this.broadcast(); return; }
    const seat = this.seatOf(client.user.id);
    if (seat === null) return;
    const s = this.seats[seat]!;
    if (s.client !== client) return;
    s.client = null;
    if (this.status === 'over') return;
    s.graceUntil = this.host.now() + this.host.disconnectGraceMs;
    s.graceTimer = setTimeout(() => this.onGraceExpired(seat), this.host.disconnectGraceMs);
    this.broadcast();
  }

  private onGraceExpired(seat: PlayerId) {
    const s = this.seats[seat];
    if (!s || s.client) return;
    if (this.status === 'waiting') { this.close(); return; }
    if (this.status !== 'playing' || !this.state) return;
    this.apply(seat, { type: 'resign', player: seat }, 'abandoned');
  }

  addSpectator(client: Client) {
    this.spectators.add(client);
    client.spectating = this.code;
    if (this.state) {
      client.send({ t: 'room', snap: this.snapshot(null) });
      client.send({ t: 'chatHistory', msgs: this.chat });
    }
    this.broadcast();
  }

  handle(client: Client, msg: ClientMsg) {
    if (msg.t === 'action') {
      const seat = this.seatOf(client.user.id);
      if (seat === null || this.status !== 'playing') {
        client.send({ t: 'actionRejected', message: 'You are not playing in this game' });
        return;
      }
      const action = msg.action as GameAction;
      if (!action || typeof action !== 'object' || !PLAYER_ACTIONS.has(action.type)) {
        client.send({ t: 'actionRejected', message: 'Unsupported action' });
        return;
      }
      const err = this.apply(seat, { ...action, player: seat } as GameAction);
      if (err) client.send({ t: 'actionRejected', message: err });
    } else if (msg.t === 'chat') {
      this.handleChat(client, msg);
    }
  }

  /** Apply an action for a seat. Returns an error message if rejected. */
  apply(seat: PlayerId, action: GameAction, note?: 'abandoned'): string | null {
    if (!this.state || this.status !== 'playing') return 'Game is not running';
    const now = this.host.now();
    let next: GameState;
    try {
      next = applyAction(this.state, action, now);
    } catch (e) {
      return e instanceof Error ? e.message : 'Rejected';
    }
    this.actions.push({ at: now, seat, action });
    this.setState(next, note);
    return null;
  }

  private setState(next: GameState, note?: 'abandoned') {
    this.state = next;
    this.recordTurnStart();
    if (next.phase === 'over') {
      void this.finish(note);
      return;
    }
    this.scheduleClock();
    this.broadcast();
  }

  private recordTurnStart() {
    if (!this.state || this.state.turnNumber === this.lastTurnNumber) return;
    this.lastTurnNumber = this.state.turnNumber;
    this.turnStarts.push(this.state);
    if (this.turnStarts.length > 3) this.turnStarts.shift();
  }

  private scheduleClock() {
    if (this.clockTimer) clearTimeout(this.clockTimer);
    this.clockTimer = null;
    if (!this.state || this.state.phase === 'over') return;
    const rem = remainingMs(this.state, this.state.current, this.host.now());
    const waitMs = Math.max(5, rem + 15 + Math.max(0, (this.state.clockSince ?? 0) - this.host.now()));
    this.clockTimer = setTimeout(() => {
      if (!this.state || this.status !== 'playing') return;
      const next = applyAction(this.state, { type: 'tick' }, this.host.now());
      if (next !== this.state) this.setState(next);
      else this.scheduleClock();
    }, waitMs);
  }

  private async finish(note?: 'abandoned') {
    this.status = 'over';
    if (this.clockTimer) clearTimeout(this.clockTimer);
    for (const s of this.seats) if (s?.graceTimer) clearTimeout(s.graceTimer);
    this.endNote = note;
    const ratings = await this.host.onFinish(this);
    this.result = { ...ratings, seed: this.seed, ...(note ? { note } : {}) };
    this.broadcast();
  }

  close() {
    if (this.clockTimer) clearTimeout(this.clockTimer);
    for (const s of this.seats) if (s?.graceTimer) clearTimeout(s.graceTimer);
    this.status = 'over';
    this.host.onClosed(this);
  }

  private handleChat(client: Client, msg: Extract<ClientMsg, { t: 'chat' }>) {
    const seat = this.seatOf(client.user.id);
    if (seat === null) {
      client.send({ t: 'error', code: 'chat', message: 'Spectators can read chat but not post' });
      return;
    }
    const now = this.host.now();
    client.chatTimes = client.chatTimes.filter((t) => now - t < CHAT_WINDOW_MS);
    if (client.chatTimes.length >= CHAT_MAX_PER_WINDOW) {
      client.send({ t: 'error', code: 'rate', message: 'Slow down — too many messages' });
      return;
    }
    let out: ChatMessage;
    if (msg.emote) {
      if (!(msg.emote in EMOTES)) return;
      out = { id: this.chatSeq++, userId: client.user.id, name: client.user.name, seat, emote: msg.emote, at: now };
    } else {
      // eslint-disable-next-line no-control-regex
      const text = String(msg.text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, CHAT_MAX_LENGTH);
      if (!text) return;
      out = { id: this.chatSeq++, userId: client.user.id, name: client.user.name, seat, text, at: now };
    }
    client.chatTimes.push(now);
    this.chat.push(out);
    if (this.chat.length > 100) this.chat.shift();
    for (const c of this.audience()) c.send({ t: 'chat', msg: out });
  }

  private sendChatHistory() {
    for (const c of this.audience()) c.send({ t: 'chatHistory', msgs: this.chat });
  }

  private audience(): Client[] {
    const out: Client[] = [];
    for (const s of this.seats) if (s?.client) out.push(s.client);
    for (const c of this.spectators) out.push(c);
    return out;
  }

  private seatInfo(s: Seat): SeatInfo {
    return {
      userId: s.user.id, name: s.user.name, rating: s.user.rating, guest: !!s.user.is_guest,
      connected: !!s.client, graceUntil: s.graceUntil,
    };
  }

  snapshot(viewer: PlayerId | null): RoomSnapshot {
    const delayed = viewer === null && this.rated && this.status === 'playing';
    let base = this.state!;
    if (delayed) {
      // Ranked spectating runs one turn behind (design doc §10).
      const prev = this.turnStarts.length >= 2 ? this.turnStarts[this.turnStarts.length - 2] : this.turnStarts[0];
      base = { ...prev, clockSince: null };
    }
    const { state, hiddenCardIds } = redactState(base, viewer);
    return {
      code: this.code,
      gameId: this.gameId,
      rated: this.rated,
      you: viewer,
      delayed,
      seats: [this.seatInfo(this.seats[0]!), this.seatInfo(this.seats[1]!)],
      state,
      hiddenCardIds,
      spectators: this.spectators.size,
      serverNow: this.host.now(),
      result: this.result,
    };
  }

  broadcast() {
    if (!this.state) return;
    for (const p of [0, 1] as PlayerId[]) {
      const c = this.seats[p]?.client;
      if (c) c.send({ t: 'room', snap: this.snapshot(p) });
    }
    if (this.spectators.size) {
      const snap = this.snapshot(null);
      for (const c of this.spectators) c.send({ t: 'room', snap });
    }
  }

  /** Full log for persistence / future replay & review. */
  exportLog() {
    return {
      version: 1,
      seed: this.seed,
      player0Color: this.player0Color,
      clockMs: this.host.clockMs,
      actions: this.actions,
      history: this.state?.history ?? [],
      result: this.state?.result ?? null,
      chat: this.chat,
    };
  }
}
