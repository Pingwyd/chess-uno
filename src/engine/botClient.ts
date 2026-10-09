/** Runs the bot off the main thread (Web Worker) with a synchronous fallback. */
import type { GameState, GameAction } from '../rules/game';
import type { Move } from '../rules/chess';
import { botStep, type BotLevel } from './bot';

export type BotResult = GameAction | Move[] | null;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (r: BotResult) => void>();

function getWorker(): Worker | null {
  if (worker || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; result: BotResult }>) => {
      pending.get(e.data.id)?.(e.data.result);
      pending.delete(e.data.id);
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function askBot(state: GameState, level: BotLevel): Promise<BotResult> {
  const w = getWorker();
  if (!w) return Promise.resolve(botStep(state, level));
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage({ id, state, level });
  });
}
