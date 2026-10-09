/**
 * Which side's verdicts the review shows. Pure logic (no React) so it is unit-tested:
 * the viewer's own moves by default (Pass & Play and spectated games default to Both),
 * a mistake walker for Next / Previous mistake, and the session-persisted choice.
 */
import type { PlayerId } from '../rules/game';
import type { GameReview, Label, TurnReview } from '../engine/review';
import type { GameRecord } from './record';

/** Relative choice as shown in the switch: Me / Opponent / Both (Pass & Play: player 1 / player 2 / Both). */
export type ReviewSide = 'me' | 'opp' | 'both';

export const MISTAKE_LABELS: readonly Label[] = ['inaccuracy', 'mistake', 'blunder'];

/** The device owner's seat: bot games 0, online games your seat, otherwise (Pass & Play, spectating) null. */
export function viewerSeat(rec: Pick<GameRecord, 'mode' | 'online'>): PlayerId | null {
  if (rec.mode === 'bot') return 0;
  if (rec.mode === 'online') return rec.online?.you ?? null;
  return null;
}

/** "Me" is the viewer's seat; with no viewer (Pass & Play) "me" means player 1 (seat 0) and "opp" player 2. */
export function sidePlayers(side: ReviewSide, viewer: PlayerId | null): PlayerId[] {
  if (side === 'both') return [0, 1];
  const me: PlayerId = viewer ?? 0;
  return [side === 'me' ? me : me === 0 ? 1 : 0];
}

export const defaultSide = (viewer: PlayerId | null): ReviewSide => (viewer === null ? 'both' : 'me');

export const shows = (side: ReviewSide, viewer: PlayerId | null, player: PlayerId) => sidePlayers(side, viewer).includes(player);

/** A turn worth jumping to: an inaccuracy, mistake or blunder, or a missed win (mate in the turn not taken). */
export const isMistake = (t: TurnReview) =>
  (t.label !== null && MISTAKE_LABELS.includes(t.label)) || t.flags.some((f) => f.type === 'missedMate');

/** The selected side's mistakes, in game order. */
export function mistakes(review: GameReview, side: ReviewSide, viewer: PlayerId | null): TurnReview[] {
  return review.turns.filter((t) => shows(side, viewer, t.player) && isMistake(t));
}

/** Key moments (turn indexes) for the selected side. */
export function keyMomentsFor(review: GameReview, side: ReviewSide, viewer: PlayerId | null): number[] {
  return review.keyMoments.filter((k) => review.turns[k] && shows(side, viewer, review.turns[k].player));
}

/**
 * The next (dir 1) or previous (dir -1) mistake relative to frame `fi`. A mistake "sits" at its
 * last frame (the position after the turn, where its verdict shows). Returns null at either end.
 */
export function stepMistake(list: TurnReview[], fi: number, dir: 1 | -1): TurnReview | null {
  if (dir > 0) return list.find((t) => t.frameEnd > fi) ?? null;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].frameEnd < fi) return list[i];
  return null;
}

const KEY = (viewer: PlayerId | null) => (viewer === null ? 'cu.reviewSide.pass' : 'cu.reviewSide');

/** The choice made earlier this session (sessionStorage), else the default. */
export function loadSide(viewer: PlayerId | null): ReviewSide {
  try {
    const v = sessionStorage.getItem(KEY(viewer));
    if (v === 'me' || v === 'opp' || v === 'both') return v;
  } catch { /* no storage */ }
  return defaultSide(viewer);
}

export function saveSide(viewer: PlayerId | null, side: ReviewSide) {
  try { sessionStorage.setItem(KEY(viewer), side); } catch { /* no storage */ }
}
