/// <reference lib="webworker" />
import { reviewGame } from './review';
import type { GameRecord } from '../replay/record';

self.onmessage = (e: MessageEvent<{ id: number; record: GameRecord }>) => {
  const { id, record } = e.data;
  try {
    let last = 0;
    const review = reviewGame(record, (done, total) => {
      const now = Date.now();
      if (now - last < 120 && done < total) return;
      last = now;
      (self as unknown as Worker).postMessage({ id, progress: total ? done / total : 1 });
    });
    (self as unknown as Worker).postMessage({ id, review });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
