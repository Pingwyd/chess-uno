/**
 * Browser side of online play: account API calls, a self-healing WebSocket
 * connection, lobby state, and an OnlineTransport that plugs into the same
 * GameTransport seam as local games. The server is authoritative; the client
 * only renders the snapshots it receives.
 */
import type { GameAction, GameState } from '../rules/game';
import type { GameTransport } from './transport';
import type { ChatMessage, ClientMsg, EmoteId, PublicUser, RoomSnapshot, ServerMsg } from './protocol';

export const SERVER_URL: string = (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8787';
const WS_URL = SERVER_URL.replace(/^http/, 'ws') + '/ws';
const TOKEN_KEY = 'cu.token';

export interface MyOnlineGame {
  gameId: string;
  rated: boolean;
  seat: 0 | 1;
  players: [string, string];
  colors: ['w' | 'b', 'w' | 'b'];
  winner: 0 | 1 | null;
  reason: string;
  endedAt: number;
  turns: number;
}

// ---------------------------------------------------------------- REST

async function call(path: string, body?: unknown, token?: string | null): Promise<{ token?: string; user: PublicUser }> {
  let res: Response;
  try {
    res = await fetch(SERVER_URL + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`Can't reach the game server (${SERVER_URL})`);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

export const storedToken = () => localStorage.getItem(TOKEN_KEY);

// ---------------------------------------------------------------- client

export type ConnStatus = 'idle' | 'connecting' | 'online' | 'offline';
export type LobbyState =
  | { kind: 'idle' }
  | { kind: 'queued'; rated: boolean; since: number }
  | { kind: 'waiting'; code: string };

export interface OnlineView {
  status: ConnStatus;
  user: PublicUser | null;
  lobby: LobbyState;
  snap: RoomSnapshot | null;
  chat: ChatMessage[];
  error: string | null;
  /** Bumps on every change (for React subscriptions). */
  version: number;
}

type Pending = { t: 'joinRoom' | 'spectate'; code: string } | null;

export class OnlineClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private errorTimer: ReturnType<typeof setTimeout> | null = null;
  private wantOpen = false;
  private pendingAfterHello: Pending = null;
  /** serverNow - Date.now(), smoothed. */
  offset = 0;
  view: OnlineView = { status: 'idle', user: null, lobby: { kind: 'idle' }, snap: null, chat: [], error: null, version: 0 };

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private update(patch: Partial<OnlineView>) {
    this.view = { ...this.view, ...patch, version: this.view.version + 1 };
    this.listeners.forEach((l) => l());
  }

  now() {
    return Date.now() + this.offset;
  }

  flashError(message: string) {
    this.update({ error: message });
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.errorTimer = setTimeout(() => this.update({ error: null }), 3500);
  }

  // ------------------------------------------------------------ accounts

  /** Make sure we have a session: reuse the stored token, else create a guest. */
  async ensureSession(): Promise<PublicUser> {
    const token = storedToken();
    if (token) {
      try {
        const { user } = await call('/api/me', undefined, token);
        this.update({ user });
        return user;
      } catch (e) {
        if (!(e instanceof Error) || !/Not signed in/.test(e.message)) throw e;
      }
    }
    const { token: t, user } = await call('/api/guest', {});
    localStorage.setItem(TOKEN_KEY, t!);
    this.update({ user });
    return user;
  }

  /** Re-read the account (rating changes after a game). */
  async refreshMe() {
    const token = storedToken();
    if (!token) return;
    try {
      const { user } = await call('/api/me', undefined, token);
      this.update({ user });
    } catch { /* ignore */ }
  }

  /** Your finished online games, newest first (server-side history). */
  async myGames(): Promise<MyOnlineGame[]> {
    const res = (await call('/api/my/games', undefined, storedToken())) as unknown as { games: MyOnlineGame[] };
    return res.games ?? [];
  }

  async leaderboard(): Promise<PublicUser[]> {
    const res = (await call('/api/leaderboard')) as unknown as { players: PublicUser[] };
    return res.players ?? [];
  }

  async signup(email: string, password: string, name: string) {
    const res = await call('/api/signup', { email, password, name: name || undefined }, storedToken());
    await this.adoptSession(res.token!, res.user);
  }

  async login(email: string, password: string) {
    const res = await call('/api/login', { email, password });
    await this.adoptSession(res.token!, res.user);
  }

  async logout() {
    localStorage.removeItem(TOKEN_KEY);
    this.update({ user: null, snap: null, chat: [], lobby: { kind: 'idle' } });
    this.disconnect();
    await this.ensureSession();
    this.connect();
  }

  private async adoptSession(token: string, user: PublicUser) {
    localStorage.setItem(TOKEN_KEY, token);
    this.update({ user });
    // Reconnect so the socket is bound to the new identity.
    this.disconnect();
    this.connect();
  }

  // ------------------------------------------------------------ socket

  connect() {
    this.wantOpen = true;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    const token = storedToken();
    if (!token) return;
    this.update({ status: 'connecting' });
    const ws = new WebSocket(WS_URL);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify({ t: 'hello', token } satisfies ClientMsg));
    };
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      this.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.update({ status: 'offline' });
      if (this.wantOpen) {
        const delay = Math.min(10_000, 500 * 2 ** this.retry++);
        this.retryTimer = setTimeout(() => this.connect(), delay);
      }
    };
  }

  disconnect() {
    this.wantOpen = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.update({ status: 'idle' });
  }

  send(msg: ClientMsg): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.flashError('Reconnecting to the server…');
      return false;
    }
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private onMessage(msg: ServerMsg) {
    switch (msg.t) {
      case 'welcome': {
        this.update({ status: 'online', user: msg.user });
        this.ping();
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => this.ping(), 10_000);
        const p = this.pendingAfterHello;
        this.pendingAfterHello = null;
        if (p) this.send(p);
        else if (this.view.snap && this.view.snap.you === null && this.view.snap.state.phase !== 'over') {
          this.send({ t: 'spectate', code: this.view.snap.code }); // resume spectating after a reconnect
        }
        return;
      }
      case 'pong': {
        const rtt = Date.now() - msg.at;
        const sample = msg.serverNow + rtt / 2 - Date.now();
        this.offset = this.offset === 0 ? sample : this.offset * 0.7 + sample * 0.3;
        return;
      }
      case 'queued':
        this.update({ lobby: { kind: 'queued', rated: msg.rated, since: Date.now() } });
        return;
      case 'queueCancelled':
      case 'left':
        this.update({ lobby: { kind: 'idle' } });
        return;
      case 'roomCreated':
        this.update({ lobby: { kind: 'waiting', code: msg.code }, snap: null, chat: [] });
        return;
      case 'room': {
        const fresh = !this.view.snap || this.view.snap.code !== msg.snap.code;
        if (Math.abs(msg.snap.serverNow - Date.now() - this.offset) > 2000) this.offset = msg.snap.serverNow - Date.now();
        this.update({ snap: msg.snap, lobby: { kind: 'idle' }, ...(fresh ? { chat: [] } : {}) });
        return;
      }
      case 'chatHistory':
        this.update({ chat: msg.msgs });
        return;
      case 'chat':
        this.update({ chat: [...this.view.chat, msg.msg].slice(-100) });
        return;
      case 'actionRejected':
        this.flashError(msg.message);
        return;
      case 'error':
        if (msg.code === 'auth') {
          localStorage.removeItem(TOKEN_KEY);
          this.wantOpen = false;
        }
        if (msg.code === 'replaced') this.wantOpen = false;
        this.flashError(msg.message);
        return;
    }
  }

  private ping() {
    this.send({ t: 'ping', at: Date.now() });
  }

  // ------------------------------------------------------------ lobby actions

  quickMatch() { this.send({ t: 'queue' }); }
  cancelQueue() { this.send({ t: 'cancelQueue' }); }
  createRoom() { this.send({ t: 'createRoom' }); }

  joinRoom(code: string) {
    if (this.view.status !== 'online') { this.pendingAfterHello = { t: 'joinRoom', code }; this.connect(); return; }
    this.send({ t: 'joinRoom', code });
  }

  spectate(code: string) {
    if (this.view.status !== 'online') { this.pendingAfterHello = { t: 'spectate', code }; this.connect(); return; }
    this.send({ t: 'spectate', code });
  }

  /** Leave the waiting room / queue / finished game view and return to the lobby. */
  leave() {
    this.send({ t: 'leave' });
    this.update({ snap: null, chat: [], lobby: { kind: 'idle' } });
  }

  sendChat(text: string) { if (text.trim()) this.send({ t: 'chat', text }); }
  sendEmote(emote: EmoteId) { this.send({ t: 'chat', emote }); }
}

let singleton: OnlineClient | null = null;
export const getOnlineClient = () => (singleton ??= new OnlineClient());

/** GameTransport backed by the authoritative server. */
export class OnlineTransport implements GameTransport {
  constructor(private client: OnlineClient) {}

  getState(): GameState {
    return this.client.view.snap!.state;
  }

  send(action: GameAction): string | null {
    return this.client.send({ t: 'action', action }) ? null : 'Not connected';
  }

  subscribe(listener: (s: GameState) => void) {
    let last = this.client.view.snap?.state;
    return this.client.subscribe(() => {
      const s = this.client.view.snap?.state;
      if (s && s !== last) { last = s; listener(s); }
    });
  }

  now() {
    return this.client.now();
  }
}
