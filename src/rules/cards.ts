/** Chess Uno card deck (design doc §2.2–2.3). Pure + deterministic given a seed. */

export type NumberKind = '1' | '2' | '3';
export type ActionKind = 'skip' | 'reverse';
export type CardKind = NumberKind | ActionKind;

export interface Card {
  /** Stable id so the UI can animate individual cards. */
  id: number;
  kind: CardKind;
}

/**
 * Rules versions. v1 = the original MVP deck (18×1, 15×2, 9×3) with unlimited Reverses.
 * v2 (current, from playtesting: v1 felt too swingy) = fewer 3s and one Reverse per player per game.
 * Saved games record their version so old replays rebuild exactly.
 */
export type RulesVersion = 1 | 2;
export const RULES_VERSION: RulesVersion = 2;

export const DECKS: Record<RulesVersion, Record<CardKind, number>> = {
  1: { '1': 18, '2': 15, '3': 9, skip: 6, reverse: 4 },
  /** 52 cards: 19×1, 18×2, 5×3, 6×Skip, 4×Reverse — still 42 number cards, average 1.67 moves (was 1.79). */
  2: { '1': 19, '2': 18, '3': 5, skip: 6, reverse: 4 },
};

/** The current deck (rules v2). */
export const DECK_COMPOSITION: Record<CardKind, number> = DECKS[RULES_VERSION];

/** Probability of each number card among the number cards (what a draw ends on). */
export function numberOdds(rules: RulesVersion = RULES_VERSION): Record<NumberKind, number> {
  const d = DECKS[rules];
  const n = d['1'] + d['2'] + d['3'];
  return { '1': d['1'] / n, '2': d['2'] / n, '3': d['3'] / n };
}

/** Average moves per number card. */
export function expectedMoves(rules: RulesVersion = RULES_VERSION): number {
  const o = numberOdds(rules);
  return o['1'] + 2 * o['2'] + 3 * o['3'];
}

/** Reverse cards each player may play per game (null = unlimited). */
export const REVERSE_LIMIT: Record<RulesVersion, number | null> = { 1: null, 2: 1 };

export const isActionKind = (k: CardKind): k is ActionKind => k === 'skip' || k === 'reverse';
export const isNumberKind = (k: CardKind): k is NumberKind => k === '1' || k === '2' || k === '3';

export function buildDeck(rules: RulesVersion = RULES_VERSION): Card[] {
  const cards: Card[] = [];
  const comp = DECKS[rules];
  let id = 0;
  for (const kind of Object.keys(comp) as CardKind[]) {
    for (let i = 0; i < comp[kind]; i++) cards.push({ id: id++, kind });
  }
  return cards;
}

/** mulberry32 step: returns [float in [0,1), next state]. */
export function rngNext(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

/** Fisher–Yates shuffle driven by the seeded RNG. Returns [shuffled copy, new rng state]. */
export function shuffle<T>(items: readonly T[], rng: number): [T[], number] {
  const out = items.slice();
  let state = rng;
  for (let i = out.length - 1; i > 0; i--) {
    const [r, next] = rngNext(state);
    state = next;
    const j = Math.floor(r * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return [out, state];
}

export const CARD_LABEL: Record<CardKind, string> = { '1': '1', '2': '2', '3': '3', skip: 'Skip', reverse: 'Reverse' };
