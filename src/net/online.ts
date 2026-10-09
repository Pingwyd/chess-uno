/**
 * Browser side of online play: account API calls, a self-healing WebSocket
 * connection, lobby state, and an OnlineTransport that plugs into the same
 * GameTransport seam as local games. The server is authoritative; the client
 * only renders the snapshots it receives.
 */
import type { GameAction, GameState, PlayerId } from '../rules/game';
import type { TimeControl } from '../rules/timeControl';
import type { GameTransport } from './transport';
import type {
  ChallengeInfo, ChatMessage, ClientMsg, EmoteId, FriendInfo, FriendsList, LiveGame, ProfileInfo, PublicUser, Relation, RoomSnapshot, ServerMsg, UserSearchHit,
} from './protocol';

export const SERVER_URL: string = (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8787';
/** False for the public static build (no game server configured): online features show "coming soon". */
export const HAS_SERVER = !!import.meta.env.DEV || !!import.meta.env.VITE_SERVER_URL;
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

async function call<T = { token?: string; user: PublicUser }>(path: string, body?: unknown, token?: string | null): Promise<T> {
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
  | { kind: 'queued'; rated: boolean; since: number; tc?: TimeControl }
  | { kind: 'waiting'; code: string; invitee?: FriendInfo; since?: number; tc?: TimeControl };

/** Rematch offer state for the finished game on screen. */
export interface RematchState { code: string; by: PlayerId; status: 'offered' | 'declined' | 'cancelled' }

/** A short in-app notice (friend request, challenge declined…). */
export interface Notice {
  id: number;
  text: string;
  /** Lucide icon name (src/ui/icons.tsx). */
  icon: string;
  /** Optional button: open the friends tab. */
  action?: 'friends';
}

export interface OnlineView {
  status: ConnStatus;
  user: PublicUser | null;
  lobby: LobbyState;
  snap: RoomSnapshot | null;
  chat: ChatMessage[];
  error: string | null;
  /** Accounts: friends + pending requests (presence kept live by the socket). */
  friends: FriendsList | null;
  /** Friend challenges waiting for your answer. */
  challenges: ChallengeInfo[];
  /** Games in progress, while subscribed (Live games list). */
  live: LiveGame[] | null;
  notices: Notice[];
  rematch: RematchState | null;
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
  private liveSubs = 0;
  private noticeSeq = 1;
  view: OnlineView = { status: 'idle', user: null, lobby: { kind: 'idle' }, snap: null, chat: [], error: null, friends: null, challenges: [], live: null, notices: [], rematch: null, version: 0 };

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

  async leaderboard(scope: 'all' | 'friends' = 'all'): Promise<PublicUser[]> {
    const res = await call<{ players: PublicUser[] }>(`/api/leaderboard${scope === 'friends' ? '?scope=friends' : ''}`, undefined, storedToken());
    return res.players ?? [];
  }

  // ------------------------------------------------------------ profile & account

  async profile(userId?: string): Promise<ProfileInfo> {
    const res = await call<{ profile: ProfileInfo }>(userId ? `/api/users/${userId}/profile` : '/api/my/profile', undefined, storedToken());
    return res.profile;
  }

  async updateProfile(patch: { name?: string; avatar?: string | null }) {
    const { user } = await call('/api/profile', patch, storedToken());
    this.update({ user });
    return user;
  }

  async changePassword(current: string, next: string) {
    await call<{ ok: true }>('/api/account/password', { current, next }, storedToken());
  }

  async deleteAccount(password: string) {
    await call<{ ok: true }>('/api/account/delete', { password }, storedToken());
    localStorage.removeItem(TOKEN_KEY);
    this.update({ user: null, snap: null, chat: [], lobby: { kind: 'idle' }, friends: null, challenges: [] });
    this.disconnect();
  }

  // ------------------------------------------------------------ friends

  async loadFriends(): Promise<FriendsList | null> {
    if (!this.view.user || this.view.user.guest) { this.update({ friends: null }); return null; }
    try {
      const friends = await call<FriendsList>('/api/friends', undefined, storedToken());
      this.update({ friends });
      return friends;
    } catch {
      return null;
    }
  }

  async searchUsers(q: string): Promise<UserSearchHit[]> {
    const res = await call<{ users: UserSearchHit[] }>(`/api/users/search?q=${encodeURIComponent(q)}`, undefined, storedToken());
    return res.users ?? [];
  }

  async friendAction(action: 'request' | 'accept' | 'decline' | 'cancel' | 'remove', userId: string): Promise<Relation> {
    const res = await call<{ relation: Relation }>(`/api/friends/${action}`, { userId }, storedToken());
    void this.loadFriends();
    return res.relation;
  }

  /** Challenge a friend: the server opens a private room (you wait in it) and pings them. */
  challenge(userId: string, tc?: TimeControl) {
    if (this.view.status !== 'online') { this.flashError('Not connected to the server'); return false; }
    return this.send({ t: 'challenge', userId, tc });
  }

  replyChallenge(id: string, accept: boolean) {
    this.update({ challenges: this.view.challenges.filter((c) => c.id !== id) });
    this.send({ t: 'challengeReply', id, accept });
  }

  // ------------------------------------------------------------ live games

  /** Subscribe to the live-games list (ref-counted); returns the unsubscribe. */
  watchLive(): () => void {
    this.liveSubs++;
    if (this.liveSubs === 1 && this.view.status === 'online') this.send({ t: 'live', on: true });
    return () => {
      this.liveSubs = Math.max(0, this.liveSubs - 1);
      if (!this.liveSubs) {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'live', on: false } satisfies ClientMsg));
        this.update({ live: null });
      }
    };
  }

  // ------------------------------------------------------------ notices

  notify(text: string, icon: string, action?: Notice['action']) {
    const n: Notice = { id: this.noticeSeq++, text, icon, action };
    this.update({ notices: [...this.view.notices, n].slice(-3) });
    setTimeout(() => this.dismiss(n.id), 5000);
  }

  dismiss(id: number) {
    if (this.view.notices.some((n) => n.id === id)) this.update({ notices: this.view.notices.filter((n) => n.id !== id) });
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
    this.update({ user: null, snap: null, chat: [], lobby: { kind: 'idle' }, friends: null, challenges: [] });
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
        void this.loadFriends();
        if (this.liveSubs) this.send({ t: 'live', on: true });
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
        this.update({ lobby: { kind: 'queued', rated: msg.rated, since: Date.now(), tc: msg.tc } });
        return;
      case 'queueCancelled':
      case 'left':
        this.update({ lobby: { kind: 'idle' } });
        return;
      case 'roomCreated':
        this.update({ lobby: { kind: 'waiting', code: msg.code, invitee: msg.invitee, since: Date.now(), tc: msg.tc }, snap: null, chat: [], rematch: null });
        return;
      case 'presence': {
        const f = this.view.friends;
        if (!f || !f.friends.some((x) => x.id === msg.userId)) return;
        this.update({ friends: { ...f, friends: f.friends.map((x) => (x.id === msg.userId ? { ...x, presence: msg.presence } : x)) } });
        return;
      }
      case 'social': {
        void this.loadFriends();
        const name = msg.user.name;
        if (msg.event === 'request') this.notify(`${name} sent you a friend request`, 'handshake', 'friends');
        if (msg.event === 'accepted') this.notify(`${name} is now your friend`, 'party', 'friends');
        return;
      }
      case 'challenge':
        if (!this.view.challenges.some((c) => c.id === msg.challenge.id)) this.update({ challenges: [...this.view.challenges, msg.challenge] });
        return;
      case 'challengeUpdate': {
        const had = this.view.challenges.some((c) => c.id === msg.id);
        if (had) this.update({ challenges: this.view.challenges.filter((c) => c.id !== msg.id) });
        if (msg.status === 'declined' && !had) this.notify(`${msg.by} declined your challenge`, 'hand');
        if (msg.status === 'expired' && !had) this.notify(`${msg.by === this.view.user?.name ? 'No answer' : msg.by} — challenge expired`, 'hourglass');
        if (msg.status === 'expired' && had) this.notify('Challenge expired', 'hourglass');
        if (msg.status === 'cancelled' && had) this.notify(`${msg.by} withdrew the challenge`, 'undo');
        return;
      }
      case 'liveGames':
        if (this.liveSubs) this.update({ live: msg.games });
        return;
      case 'room': {
        const fresh = !this.view.snap || this.view.snap.code !== msg.snap.code;
        if (Math.abs(msg.snap.serverNow - Date.now() - this.offset) > 2000) this.offset = msg.snap.serverNow - Date.now();
        this.update({ snap: msg.snap, lobby: { kind: 'idle' }, ...(fresh ? { chat: [], rematch: null } : {}) });
        return;
      }
      case 'rematch':
        if (this.view.snap?.code === msg.code) this.update({ rematch: { code: msg.code, by: msg.by, status: msg.status } });
        return;
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

  quickMatch(tc?: TimeControl) { this.send({ t: 'queue', tc }); }
  cancelQueue() { this.send({ t: 'cancelQueue' }); }
  createRoom(tc?: TimeControl) { this.send({ t: 'createRoom', tc }); }

  /** Offer a rematch for the finished game on screen (accepts if the opponent already offered). */
  offerRematch() { const s = this.view.snap; if (s) this.send({ t: 'rematch', code: s.code }); }
  /** Decline the opponent's offer, or withdraw your own. */
  declineRematch() { const s = this.view.snap; if (s) this.send({ t: 'rematchDecline', code: s.code }); }

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
    this.update({ snap: null, chat: [], lobby: { kind: 'idle' }, rematch: null });
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
