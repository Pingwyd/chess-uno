import WebSocket from 'ws';
import { createApp, type App } from '../src/app';
import type { ClientMsg, ServerMsg, RoomSnapshot } from '../../src/net/protocol';

export async function startApp(over: Parameters<typeof createApp>[0] = {}) {
  const app = await createApp({ databaseUrl: ':memory:', jwtSecret: 'test-secret', clockMs: 600_000, disconnectGraceMs: 60_000, ...over });
  const port = await app.listen(0);
  return { app, port, base: `http://localhost:${port}` };
}

export async function api(base: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}

export class TestClient {
  ws!: WebSocket;
  msgs: ServerMsg[] = [];
  private waiters: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];
  snap: RoomSnapshot | null = null;

  constructor(private port: number, public token: string) {}

  static async guest(base: string, port: number) {
    const { json } = await api(base, '/api/guest', {});
    const c = new TestClient(port, json.token);
    await c.connect();
    return c;
  }

  async connect() {
    this.ws = new WebSocket(`ws://localhost:${this.port}/ws`);
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString()) as ServerMsg;
      if (m.t === 'room') this.snap = m.snap;
      this.msgs.push(m);
      this.waiters = this.waiters.filter((w) => (w.pred(m) ? (w.resolve(m), false) : true));
    });
    await new Promise<void>((r, j) => { this.ws.once('open', () => r()); this.ws.once('error', j); });
    const welcome = this.waitFor((m) => m.t === 'welcome' || m.t === 'error');
    this.send({ t: 'hello', token: this.token });
    return welcome;
  }

  send(m: ClientMsg) { this.ws.send(JSON.stringify(m)); }

  /** Resolve with the first message (already received or future) after `fromIndex` matching pred. */
  waitFor<T extends ServerMsg = ServerMsg>(pred: (m: ServerMsg) => boolean, timeoutMs = 8000, fromIndex = this.msgs.length): Promise<T> {
    const existing = this.msgs.slice(fromIndex).find(pred);
    if (existing) return Promise.resolve(existing as T);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('waitFor timeout; last msgs: ' + JSON.stringify(this.msgs.slice(-3)))), timeoutMs);
      this.waiters.push({ pred, resolve: (m) => { clearTimeout(t); resolve(m as T); } });
    });
  }

  waitSnap(pred: (s: RoomSnapshot) => boolean, timeoutMs = 8000) {
    if (this.snap && pred(this.snap)) return Promise.resolve(this.snap);
    return this.waitFor<{ t: 'room'; snap: RoomSnapshot }>((m) => m.t === 'room' && pred(m.snap), timeoutMs).then((m) => m.snap);
  }

  close() { this.ws.close(); return new Promise((r) => setTimeout(r, 50)); }
}

export async function privateGame(base: string, port: number) {
  const a = await TestClient.guest(base, port);
  const b = await TestClient.guest(base, port);
  a.send({ t: 'createRoom' });
  const created = await a.waitFor<{ t: 'roomCreated'; code: string }>((m) => m.t === 'roomCreated');
  b.send({ t: 'joinRoom', code: created.code });
  const sa = await a.waitSnap(() => true);
  await b.waitSnap(() => true);
  return { a, b, code: created.code, snap: sa };
}

export type { App };
