/** Runs the review bot off the server's event loop (see review.ts). */
import { parentPort } from 'node:worker_threads';
import { reviewGame } from '../../src/engine/review';
import type { GameRecord } from '../../src/replay/record';

parentPort!.on('message', (msg: { id: number; record: GameRecord }) => {
  try {
    parentPort!.postMessage({ id: msg.id, review: reviewGame(msg.record) });
  } catch (e) {
    parentPort!.postMessage({ id: msg.id, error: e instanceof Error ? e.message : String(e) });
  }
});
