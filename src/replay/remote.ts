/** Fetching finished online games from the server (kept free of the review engine so it stays in the main chunk cheaply). */
import type { GameRecord } from './record';
import { SERVER_URL } from '../net/online';

/** Replay record of a finished online game from the server (shareable links). */
export async function fetchServerRecord(gameId: string): Promise<GameRecord | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/games/${gameId}/replay`);
    if (!res.ok) return null;
    return ((await res.json()) as { record?: GameRecord }).record ?? null;
  } catch {
    return null;
  }
}
