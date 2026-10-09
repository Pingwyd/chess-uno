/// <reference lib="webworker" />
import { botStep, type BotLevel } from './bot';
import type { GameState } from '../rules/game';

self.onmessage = (e: MessageEvent<{ id: number; state: GameState; level: BotLevel }>) => {
  const { id, state, level } = e.data;
  const result = botStep(state, level);
  (self as unknown as Worker).postMessage({ id, result });
};
