/** Elo (design doc §7): start 1200, K=32 for the first 20 rated games, then 20. */
export const START_RATING = 1200;

export function kFactor(ratedGames: number): number {
  return ratedGames < 20 ? 32 : 20;
}

export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

/** New ratings after a game. `score` is seat 0's result: 1 win, 0.5 draw, 0 loss. */
export function updateElo(
  a: { rating: number; ratedGames: number },
  b: { rating: number; ratedGames: number },
  score: 0 | 0.5 | 1,
): [number, number] {
  const ea = expectedScore(a.rating, b.rating);
  const eb = 1 - ea;
  const na = Math.round(a.rating + kFactor(a.ratedGames) * (score - ea));
  const nb = Math.round(b.rating + kFactor(b.ratedGames) * (1 - score - eb));
  return [na, nb];
}
