import { describe, expect, it } from 'vitest';
import { asTimeControl, clockFor, isTimeControl, TC_MS, TIME_CONTROLS } from '../src/rules/timeControl';
import { rematchSetup, type GameSetup } from '../src/ui/useGame';
import { createGame } from '../src/rules/game';

describe('time controls', () => {
  it('3 / 5 / 10 minutes; unknown values mean rapid; rapid follows the server clock', () => {
    expect(TIME_CONTROLS.map((t) => TC_MS[t] / 60_000)).toEqual([3, 5, 10]);
    expect(isTimeControl('blitz')).toBe(true);
    expect(isTimeControl('hyper')).toBe(false);
    expect(asTimeControl(undefined)).toBe('rapid');
    expect(asTimeControl('bullet')).toBe('bullet');
    expect(clockFor('rapid', 420_000)).toBe(420_000);
    expect(clockFor('blitz', 420_000)).toBe(300_000);
  });
  it('a game created with the blitz clock starts both players at 5:00', () => {
    const g = createGame({ seed: 1, clockMs: clockFor('blitz'), players: [{ name: 'A', kind: 'human' }, { name: 'B', kind: 'human' }] }, 0);
    expect(g.clocks).toEqual([300_000, 300_000]);
  });
});

describe('local rematch', () => {
  it('vs bot: same level and clock, your colour flips, fresh deck', () => {
    const s: GameSetup = { mode: 'bot', botLevel: 'hard', humanColor: 'w', seed: 7, tc: 'blitz' };
    const r = rematchSetup(s);
    expect(r).toEqual({ mode: 'bot', botLevel: 'hard', humanColor: 'b', seed: undefined, tc: 'blitz' });
    expect(rematchSetup(r).humanColor).toBe('w');
  });
  it('Pass & Play: the players swap seats (seat 0 plays white)', () => {
    const r = rematchSetup({ mode: 'pass', botLevel: 'medium', humanColor: 'w', names: ['Tolu', 'Ada'] });
    expect(r.names).toEqual(['Ada', 'Tolu']);
    expect(rematchSetup({ mode: 'pass', botLevel: 'medium', humanColor: 'w' }).names).toEqual(['Player 2', 'Player 1']);
  });
});
