/**
 * Server-side review bot for finished online games: replay records built from the
 * stored action log, analysis computed in a worker thread and cached in
 * `game_reviews` so each game is analysed once.
 */
import { Worker } from 'node:worker_threads';
import type { Kysely } from 'kysely';
import type { Database, GamesTable } from './db';
import { fromServerLog, type GameRecord, type ServerLog } from '../../src/replay/record';
import { REVIEW_VERSION, reviewGame, type GameReview } from '../../src/engine/review';

export async function recordFor(db: Kysely<Database>, g: GamesTable): Promise<GameRecord | null> {
  if (!g.log) return null;
  const log = JSON.parse(g.log) as ServerLog;
  const users = await db.selectFrom('users').select(['id', 'name']).where('id', 'in', [g.player0_id, g.player1_id]).execute();
  const name = (id: string) => users.find((u) => u.id === id)?.name ?? 'Player';
  return fromServerLog(log, {
    gameId: g.id, code: g.code, rated: !!g.rated, names: [name(g.player0_id), name(g.player1_id)],
    createdAt: g.created_at, endedAt: g.ended_at,
    ratings: [g.rating0_before, g.rating1_before],
    ratingChange: g.rating0_after !== null && g.rating0_before !== null && g.rating1_after !== null && g.rating1_before !== null
      ? [g.rating0_after - g.rating0_before, g.rating1_after - g.rating1_before] : null,
  });
}

export class ReviewService {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve: (r: GameReview) => void; reject: (e: Error) => void }>();
  private inflight = new Map<string, Promise<GameReview>>();

  constructor(private db: Kysely<Database>, private useWorker = true) {}

  async get(g: GamesTable): Promise<GameReview | null> {
    const cached = await this.db.selectFrom('game_reviews').selectAll().where('game_id', '=', g.id).executeTakeFirst();
    if (cached && cached.version === REVIEW_VERSION) return JSON.parse(cached.data) as GameReview;
    const record = await recordFor(this.db, g);
    if (!record) return null;
    let job = this.inflight.get(g.id);
    if (!job) {
      job = this.analyse(record).finally(() => this.inflight.delete(g.id));
      this.inflight.set(g.id, job);
    }
    const review = await job;
    const row = { game_id: g.id, version: REVIEW_VERSION, data: JSON.stringify(review), created_at: new Date().toISOString() };
    try {
      await this.db.deleteFrom('game_reviews').where('game_id', '=', g.id).execute();
      await this.db.insertInto('game_reviews').values(row).execute();
    } catch { /* a concurrent request stored it first */ }
    return review;
  }

  private analyse(record: GameRecord): Promise<GameReview> {
    const w = this.getWorker();
    if (!w) return Promise.resolve(reviewGame(record));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      w.postMessage({ id, record });
    });
  }

  private getWorker(): Worker | null {
    if (!this.useWorker) return null;
    if (this.worker) return this.worker;
    try {
      const w = new Worker(new URL('./review.worker.mjs', import.meta.url));
      w.on('message', (m: { id: number; review?: GameReview; error?: string }) => {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (!p) return;
        if (m.review) p.resolve(m.review);
        else p.reject(new Error(m.error ?? 'Review failed'));
      });
      w.on('error', (e: Error) => {
        for (const p of this.pending.values()) p.reject(e);
        this.pending.clear();
        this.worker = null;
        this.useWorker = false; // fall back to analysing inline
      });
      w.unref();
      this.worker = w;
      return w;
    } catch {
      this.useWorker = false;
      return null;
    }
  }

  close() {
    void this.worker?.terminate();
    this.worker = null;
  }
}
