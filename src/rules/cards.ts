/** Chess Uno card deck (design doc §2.2–2.3). Pure + deterministic given a seed. */

export type NumberKind = '1' | '2' | '3';
export type ActionKind = 'skip' | 'reverse';
export type CardKind = NumberKind | ActionKind;

export interface Card {
  /** Stable id so the UI can animate individual cards. */
  id: number;
  kind: CardKind;
}

/** Proposed 52-card mix: 18×1, 15×2, 9×3, 6×Skip, 4×Reverse. */
export const DECK_COMPOSITION: Record<CardKind, number> = { '1': 18, '2': 15, '3': 9, skip: 6, reverse: 4 };

export const isActionKind = (k: CardKind): k is ActionKind => k === 'skip' || k === 'reverse';
export const isNumberKind = (k: CardKind): k is NumberKind => k === '1' || k === '2' || k === '3';

export function buildDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;
  for (const kind of Object.keys(DECK_COMPOSITION) as CardKind[]) {
    for (let i = 0; i < DECK_COMPOSITION[kind]; i++) cards.push({ id: id++, kind });
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
