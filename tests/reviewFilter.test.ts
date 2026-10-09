import { describe, expect, it, beforeEach } from 'vitest';
import type { GameReview, Label, TurnReview } from '../src/engine/review';
import type { PlayerId } from '../src/rules/game';
import {
  defaultSide, isMistake, keyMomentsFor, loadSide, mistakes, saveSide, shows, sidePlayers, stepMistake, viewerSeat,
} from '../src/replay/reviewFilter';

const turn = (i: number, player: PlayerId, label: Label | null, missed = false): TurnReview => ({
  turn: i, player, color: player === 0 ? 'w' : 'b', played: [], label, frameStart: i * 10, frameEnd: i * 10 + 5,
  actual: [], best: null, scoreBest: null, scoreActual: null, loss: 0, accuracy: null, evalAfter: 0, winAfter: 50,
  flags: missed ? [{ type: 'missedMate', text: '' }] : [], text: '', luck: null,
});

const review = (turns: TurnReview[], keyMoments: number[]): GameReview => ({
  version: 1, turns, keyMoments, graph: [], expectedCard: 1.67, ms: 0,
  players: [0, 1].map(() => ({ accuracy: 80, counts: {} as GameReview['players'][0]['counts'], avgCard: null, numberCards: 0, actionCards: 0, luck: 0 })) as GameReview['players'],
});

// Turns: 0 me good, 1 opp blunder, 2 me inaccuracy, 3 opp best, 4 me "good" but missed a mate, 5 opp mistake, 6 me blunder
const R = review([
  turn(0, 0, 'good'), turn(1, 1, 'blunder'), turn(2, 0, 'inaccuracy'), turn(3, 1, 'best'),
  turn(4, 0, 'good', true), turn(5, 1, 'mistake'), turn(6, 0, 'blunder'),
], [1, 2, 5, 6]);

class MemStorage { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } }

describe('review side filter', () => {
  beforeEach(() => { (globalThis as { sessionStorage?: unknown }).sessionStorage = new MemStorage(); });

  it('finds the viewer seat and defaults to their own moves (Both without a viewer)', () => {
    expect(viewerSeat({ mode: 'bot' })).toBe(0);
    expect(viewerSeat({ mode: 'online', online: { gameId: 'g', code: 'C', rated: true, you: 1 } })).toBe(1);
    expect(viewerSeat({ mode: 'online', online: { gameId: 'g', code: 'C', rated: true, you: null } })).toBeNull();
    expect(viewerSeat({ mode: 'pass' })).toBeNull();
    expect(defaultSide(1)).toBe('me');
    expect(defaultSide(null)).toBe('both');
  });

  it('maps Me / Opponent / Both to seats', () => {
    expect(sidePlayers('me', 1)).toEqual([1]);
    expect(sidePlayers('opp', 1)).toEqual([0]);
    expect(sidePlayers('both', 1)).toEqual([0, 1]);
    // Pass & Play: "me" is player 1, "opp" player 2.
    expect(sidePlayers('me', null)).toEqual([0]);
    expect(sidePlayers('opp', null)).toEqual([1]);
    expect(shows('opp', 0, 1)).toBe(true);
    expect(shows('opp', 0, 0)).toBe(false);
  });

  it('counts inaccuracies, mistakes, blunders and missed wins as mistakes', () => {
    expect(R.turns.filter(isMistake).map((t) => t.turn)).toEqual([1, 2, 4, 5, 6]);
    expect(mistakes(R, 'me', 0).map((t) => t.turn)).toEqual([2, 4, 6]);
    expect(mistakes(R, 'opp', 0).map((t) => t.turn)).toEqual([1, 5]);
    expect(mistakes(R, 'me', 1).map((t) => t.turn)).toEqual([1, 5]);
    expect(mistakes(R, 'both', 0).map((t) => t.turn)).toEqual([1, 2, 4, 5, 6]);
  });

  it('filters key moments by side', () => {
    expect(keyMomentsFor(R, 'me', 0)).toEqual([2, 6]);
    expect(keyMomentsFor(R, 'opp', 0)).toEqual([1, 5]);
    expect(keyMomentsFor(R, 'both', null)).toEqual([1, 2, 5, 6]);
  });

  it('steps through only the selected side’s mistakes', () => {
    const mine = mistakes(R, 'me', 0); // frameEnd 25, 45, 65
    expect(stepMistake(mine, 0, 1)?.turn).toBe(2);
    expect(stepMistake(mine, 25, 1)?.turn).toBe(4);
    expect(stepMistake(mine, 30, 1)?.turn).toBe(4);
    expect(stepMistake(mine, 65, 1)).toBeNull();
    expect(stepMistake(mine, 65, -1)?.turn).toBe(4);
    expect(stepMistake(mine, 45, -1)?.turn).toBe(2);
    expect(stepMistake(mine, 25, -1)).toBeNull();
    expect(stepMistake([], 10, 1)).toBeNull();
  });

  it('persists the choice for the session, separately for Pass & Play', () => {
    expect(loadSide(0)).toBe('me');
    saveSide(0, 'both');
    expect(loadSide(1)).toBe('both');
    expect(loadSide(null)).toBe('both');
    saveSide(null, 'opp');
    expect(loadSide(null)).toBe('opp');
    expect(loadSide(0)).toBe('both');
  });
});
