import type { GameSummary } from '../../replay/record';

export interface Stats { w: number; l: number; d: number; streak: number; best: number }

/** W/L/D and win streaks from the games saved on this device (bot + online games you played). */
export function localStats(games: GameSummary[]): Stats {
  const mine = games.filter((g) => g.you !== null && g.result).sort((a, b) => a.endedAt - b.endedAt);
  let w = 0, l = 0, d = 0, cur = 0, best = 0;
  for (const g of mine) {
    const r = g.result!;
    if (r.winner === null) { d++; cur = 0; } else if (r.winner === g.you) { w++; cur++; best = Math.max(best, cur); } else { l++; cur = 0; }
  }
  return { w, l, d, streak: cur, best };
}
