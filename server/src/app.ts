import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import type { Kysely } from 'kysely';
import { createDb, type Database } from './db';
import { Auth } from './auth';
import { Hub } from './hub';
import { createHttpHandler } from './http';
import { loadConfig, type ServerConfig } from './config';
import { ReviewService } from './review';

export interface App {
  server: Server;
  hub: Hub;
  db: Kysely<Database>;
  auth: Auth;
  config: ServerConfig;
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
}

export async function createApp(overrides: Partial<ServerConfig> = {}): Promise<App> {
  const config = { ...loadConfig(), ...overrides };
  const db = await createDb(config.databaseUrl);
  const auth = new Auth(db, config.jwtSecret);
  const hub = new Hub(db, auth, config);
  const reviews = new ReviewService(db);
  const server = createServer(createHttpHandler(db, auth, config, reviews));
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
  wss.on('connection', (ws, req) => hub.handleConnection(ws, req));

  // Heartbeat: drop dead sockets so disconnect grace starts promptly.
  const alive = new WeakMap<object, boolean>();
  wss.on('connection', (ws) => { alive.set(ws, true); ws.on('pong', () => alive.set(ws, true)); });
  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) { ws.terminate(); continue; }
      alive.set(ws, false);
      ws.ping();
    }
  }, 15_000);

  return {
    server, hub, db, auth, config,
    listen: (port = config.port) => new Promise((resolve) => server.listen(port, () => resolve((server.address() as AddressInfo).port))),
    async close() {
      clearInterval(beat);
      reviews.close();
      hub.close();
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => server.close(() => r()));
      await db.destroy();
    },
  };
}
