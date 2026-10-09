import { describe, expect, it } from 'vitest';
import { planTurn, botStep, decideStart, type BotLevel } from '../src/engine/bot';
import { applyAction, createGame, type GameState, type GameAction } from '../src/rules/game';
import { parseSquare, squareName, type Move } from '../src/rules/chess';
import { type CardKind } from '../src/rules/cards';

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const drawFor = (s: GameState) => applyAction(s, { type: 'draw', player: s.current }, 0);
const uci = (m: Move) => squareName(m.from) + squareName(m.to);

describe('bot', () => {
  it('finds quiet-quiet-mate with a 3 card (check ends the turn, so it delays the check)', () => {
    // White: Ra1, Kg1; Black: Kg8 behind pawns. A check first would end the turn.
    let s = createGame({ fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', deckOrder: ['3'] });
    s = drawFor(s);
    const plan = planTurn(s, 'hard', seeded(1));
    expect(uci(plan[plan.length - 1])).toBe('a1a8');
    expect(plan.length).toBeGreaterThanOrEqual(1);
  });
  it('mates in one when available at every level', () => {
    for (const level of ['easy', 'medium', 'hard'] as BotLevel[]) {
      let s = createGame({ fen: 'rnbqkbnr/ppppp2p/5p2/6p1/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3', deckOrder: ['1'], openingCap: false });
      s = drawFor(s);
      expect(uci(planTurn(s, level, seeded(3))[0])).toBe('d1h5');
    }
  });
  it('medium/hard take a free queen', () => {
    for (const level of ['medium', 'hard'] as BotLevel[]) {
      let s = createGame({ fen: '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', deckOrder: ['1'], openingCap: false });
      s = drawFor(s);
      const plan = planTurn(s, level, seeded(5));
      expect(uci(plan[0])).toBe('d1d5');
    }
  });
  it('plans a full multi-move sequence that the rules accept', () => {
    let s = createGame({ deckOrder: ['1', '3'], seed: 1 });
    s = applyAction(drawFor(s), { type: 'move', player: 0, from: parseSquare('e2'), to: parseSquare('e4') }, 0);
    s = drawFor(s);
    const plan = planTurn(s, 'hard', seeded(9));
    expect(plan.length).toBeGreaterThanOrEqual(1);
    for (const m of plan) {
      if (s.current !== 1) break;
      s = applyAction(s, { type: 'move', player: 1, from: m.from, to: m.to, promotion: m.promotion }, 0);
    }
    expect(s.current).toBe(0);
  });
  it('plays Reverse when clearly losing (hard)', () => {
    let s = createGame({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/8/4K3 w kq - 0 1', deckOrder: ['reverse', ...Array(20).fill('1')] as CardKind[], openingCap: false });
    s = { ...s, turnsCompleted: [5, 5] };
    s = drawFor(s); // reverse to hand, then a 1
    s = applyAction(s, { type: 'move', player: 0, from: parseSquare('e1'), to: parseSquare('d1') }, 0);
    s = drawFor(s);
    s = applyAction(s, { type: 'move', player: 1, from: parseSquare('g8'), to: parseSquare('f6') }, 0);
    const a = decideStart(s, 'hard', seeded(1));
    expect(a.type).toBe('playCard');
  });
  for (const level of ['easy', 'medium', 'hard'] as BotLevel[]) {
    it(`self-play smoke test (${level}) completes legal turns quickly`, () => {
      let s = createGame({ seed: 11 });
      const rand = seeded(17);
      const t0 = performance.now();
      let maxTurnMs = 0;
      for (let i = 0; i < 60 && s.phase !== 'over'; i++) {
        const t = performance.now();
        const r = botStep(s, level, rand)!;
        maxTurnMs = Math.max(maxTurnMs, performance.now() - t);
        if (Array.isArray(r)) {
          const p = s.current;
          for (const m of r) {
            if (s.current !== p || s.phase !== 'moving') break;
            s = applyAction(s, { type: 'move', player: p, from: m.from, to: m.to, promotion: m.promotion }, 0);
          }
        } else s = applyAction(s, r as GameAction, 0);
      }
      expect(s.turnNumber).toBeGreaterThan(5);
      expect(maxTurnMs).toBeLessThan(level === 'hard' ? 6000 : 2000);
      console.log(level, 'turns', s.turnNumber, 'phase', s.phase, s.result, 'max ms', maxTurnMs.toFixed(0), 'total', (performance.now() - t0).toFixed(0));
    });
  }
});
