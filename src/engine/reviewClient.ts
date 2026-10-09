/** Runs the review bot in a Web Worker (works offline), with server analysis for online games when reachable. */
import type { GameRecord } from '../replay/record';
import { REVIEW_VERSION, reviewGame, type GameReview } from './review';
import { SERVER_URL } from '../net/online';

let seq = 0;

export function reviewInWorker(record: GameRecord, onProgress?: (p: number) => void): { promise: Promise<GameReview>; cancel: () => void } {
  let worker: Worker | null = null;
  try {
    worker = typeof Worker === 'undefined' ? null : new Worker(new URL('./review.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  if (!worker) {
    // No worker support: analyse on the main thread after a paint.
    return { promise: new Promise((r) => setTimeout(() => r(reviewGame(record, (d, t) => onProgress?.(t ? d / t : 1))), 50)), cancel: () => {} };
  }
  const id = ++seq;
  const w = worker;
  const promise = new Promise<GameReview>((resolve, reject) => {
    w.onmessage = (e: MessageEvent<{ id: number; progress?: number; review?: GameReview; error?: string }>) => {
      if (e.data.id !== id) return;
      if (e.data.progress !== undefined) { onProgress?.(e.data.progress); return; }
      w.terminate();
      if (e.data.review) resolve(e.data.review);
      else reject(new Error(e.data.error ?? 'Analysis failed'));
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'Analysis failed')); };
    w.postMessage({ id, record });
  });
  return { promise, cancel: () => w.terminate() };
}

/** Cached server analysis of a finished online game (null when unavailable). */
export async function fetchServerReview(gameId: string, timeoutMs = 25_000): Promise<GameReview | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${SERVER_URL}/api/games/${gameId}/review`, { signal: ctl.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { review?: GameReview };
    return json.review && json.review.version === REVIEW_VERSION ? json.review : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export { fetchServerRecord } from '../replay/remote';
