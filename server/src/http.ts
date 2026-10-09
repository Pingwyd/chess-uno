/** Minimal JSON REST API: guest/signup/login/me, leaderboard, finished game logs. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Kysely } from 'kysely';
import type { Database } from './db';
import { Auth, AuthError, toPublicUser } from './auth';
import type { ServerConfig } from './config';
import { mergeProgress, sanitize } from '../../src/learn/progress';
import { recordFor, type ReviewService } from './review';

const MAX_BODY = 16 * 1024;

function readJson(req: IncomingMessage, max = MAX_BODY): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) { reject(new AuthError(413, 'Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new AuthError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const bearer = (req: IncomingMessage) => {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
};

// Simple per-IP limiter for auth endpoints (brute-force protection).
function limited(authHits: Map<string, number[]>, req: IncomingMessage, max = 20, windowMs = 60_000): boolean {
  const ip = req.socket.remoteAddress ?? '?';
  const now = Date.now();
  const hits = (authHits.get(ip) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  authHits.set(ip, hits);
  return hits.length > max;
}

export function createHttpHandler(db: Kysely<Database>, auth: Auth, cfg: ServerConfig, reviews?: ReviewService) {
  const authHits = new Map<string, number[]>();
  return async (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    const allowed = cfg.corsOrigin === '*' ? '*' : cfg.corsOrigin.split(',').map((s) => s.trim()).includes(origin ?? '') ? origin! : '';
    if (allowed) res.setHeader('Access-Control-Allow-Origin', allowed);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Vary', 'Origin');
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url ?? '/', 'http://x');
    try {
      if (req.method === 'GET' && url.pathname === '/health') return send(200, { ok: true });
      if (req.method === 'POST' && url.pathname === '/api/guest') {
        if (limited(authHits, req, 30)) return send(429, { error: 'Too many requests' });
        const user = await auth.createGuest();
        return send(200, { token: await auth.sign(user.id), user: toPublicUser(user) });
      }
      if (req.method === 'POST' && url.pathname === '/api/signup') {
        if (limited(authHits, req)) return send(429, { error: 'Too many requests' });
        const body = await readJson(req);
        const current = await auth.verify(bearer(req));
        const user = await auth.signup(String(body.email ?? ''), String(body.password ?? ''), body.name ? String(body.name) : undefined, current);
        return send(200, { token: await auth.sign(user.id), user: toPublicUser(user) });
      }
      if (req.method === 'POST' && url.pathname === '/api/login') {
        if (limited(authHits, req)) return send(429, { error: 'Too many requests' });
        const body = await readJson(req);
        const user = await auth.login(String(body.email ?? ''), String(body.password ?? ''));
        return send(200, { token: await auth.sign(user.id), user: toPublicUser(user) });
      }
      if (req.method === 'GET' && url.pathname === '/api/me') {
        const user = await auth.verify(bearer(req));
        if (!user) return send(401, { error: 'Not signed in' });
        return send(200, { user: toPublicUser(user) });
      }
      if (url.pathname === '/api/learn' && (req.method === 'GET' || req.method === 'POST')) {
        // Learning-path progress sync. Guests keep progress on their device only.
        const user = await auth.verify(bearer(req));
        if (!user) return send(401, { error: 'Not signed in' });
        if (user.is_guest) return send(403, { error: 'Sign up to sync learning progress' });
        const row = await db.selectFrom('learn_progress').selectAll().where('user_id', '=', user.id).executeTakeFirst();
        const stored = row ? sanitize(JSON.parse(row.data)) : null;
        if (req.method === 'GET') return send(200, { progress: stored });
        const body = await readJson(req, 64 * 1024);
        const incoming = sanitize(body.progress);
        // Merge rather than overwrite, so two devices never lose each other's progress.
        const merged = stored ? mergeProgress(stored, incoming) : incoming;
        const data = JSON.stringify(merged);
        const updated_at = new Date().toISOString();
        if (row) await db.updateTable('learn_progress').set({ data, updated_at }).where('user_id', '=', user.id).execute();
        else await db.insertInto('learn_progress').values({ user_id: user.id, data, updated_at }).execute();
        return send(200, { progress: merged });
      }
      if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
        const rows = await db.selectFrom('users').selectAll().where('is_guest', '=', 0).where('rated_games', '>', 0)
          .orderBy('rating', 'desc').limit(50).execute();
        return send(200, { players: rows.map((u) => ({ ...toPublicUser(u), email: undefined })) });
      }
      if (req.method === 'GET' && url.pathname === '/api/my/games') {
        // Your recent finished online games (newest first).
        const user = await auth.verify(bearer(req));
        if (!user) return send(401, { error: 'Not signed in' });
        const rows = await db.selectFrom('games').selectAll().where('status', '=', 'finished')
          .where((eb) => eb.or([eb('player0_id', '=', user.id), eb('player1_id', '=', user.id)]))
          .orderBy('ended_at', 'desc').limit(30).execute();
        const ids = [...new Set(rows.flatMap((g) => [g.player0_id, g.player1_id]))];
        const users = ids.length ? await db.selectFrom('users').select(['id', 'name']).where('id', 'in', ids).execute() : [];
        const name = (id: string) => users.find((u) => u.id === id)?.name ?? 'Player';
        return send(200, {
          games: rows.map((g) => {
            const seat = g.player0_id === user.id ? 0 : 1;
            const log = g.log ? JSON.parse(g.log) as { history?: unknown[] } : null;
            return {
              gameId: g.id, rated: !!g.rated, seat, players: [name(g.player0_id), name(g.player1_id)],
              colors: g.player0_color === 'w' ? ['w', 'b'] : ['b', 'w'],
              winner: g.winner, reason: g.reason, endedAt: g.ended_at ? new Date(g.ended_at as never).getTime() : 0, turns: log?.history?.length ?? 0,
            };
          }),
        });
      }
      const replayMatch = url.pathname.match(/^\/api\/games\/([0-9a-f-]{36})\/(replay|review)$/);
      if (req.method === 'GET' && replayMatch) {
        // Shareable replays: anyone with the (unguessable) game id can watch a finished game. No chat, no emails.
        const g = await db.selectFrom('games').selectAll().where('id', '=', replayMatch[1]).executeTakeFirst();
        if (!g || g.status !== 'finished') return send(404, { error: 'Game not found' });
        if (replayMatch[2] === 'replay') {
          const record = await recordFor(db, g);
          return record ? send(200, { record }) : send(404, { error: 'No log for this game' });
        }
        if (!reviews) return send(404, { error: 'Server analysis is disabled' });
        const review = await reviews.get(g);
        return review ? send(200, { review }) : send(404, { error: 'No log for this game' });
      }
      const gameMatch = url.pathname.match(/^\/api\/games\/([0-9a-f-]{36})$/);
      if (req.method === 'GET' && gameMatch) {
        const g = await db.selectFrom('games').selectAll().where('id', '=', gameMatch[1]).executeTakeFirst();
        if (!g || g.status !== 'finished') return send(404, { error: 'Game not found' });
        return send(200, { game: { ...g, log: g.log ? JSON.parse(g.log) : null } });
      }
      send(404, { error: 'Not found' });
    } catch (e) {
      if (e instanceof AuthError) return send(e.status, { error: e.message });
      console.error(e);
      send(500, { error: 'Server error' });
    }
  };
}
