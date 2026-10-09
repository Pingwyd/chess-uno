import { describe, expect, it, beforeAll } from 'vitest';
import { parseFen, parseSquare, type PromotionPiece } from '../src/rules/chess';
import type { CardKind } from '../src/rules/cards';
import { remainingMs, type GameState } from '../src/rules/game';
import { LocalTransport } from '../src/net/transport';
import { botStep, type BotLevel } from '../src/engine/bot';
import {
  ANALYSIS, THRESHOLDS, accuracyFromLoss, bestTurn, classify, findMateInTurn, newContexts, reviewGame, sanLine, winChance,
} from '../src/engine/review';
import { clocksAt, fromServerLog, reconstruct, recordableConfig, summarize, type GameRecord, type LoggedAction } from '../src/replay/record';

const sq = parseSquare;

/** A crafted record: `/` hands the move to the other player, `draw` draws, anything else is a UCI move. */
function craft(fen: string, deck: CardKind[], script: string[]): GameRecord {
  const config = recordableConfig({ fen, deckOrder: deck, seed: 1, openingCap: false, players: [{ name: 'Ada', kind: 'human' }, { name: 'Bo', kind: 'human' }] });
  let t = 1000;
  let player: 0 | 1 = 0;
  const actions: LoggedAction[] = [];
  for (const u of script) {
    t += 1500;
    if (u === '/') player = player === 0 ? 1 : 0;
    else if (u === 'draw') actions.push({ at: t, action: { type: 'draw', player } });
    else actions.push({ at: t, action: { type: 'move', player, from: sq(u.slice(0, 2)), to: sq(u.slice(2, 4)), promotion: (u[4] as PromotionPiece) || undefined } });
  }
  return { v: 1, id: 'craft', mode: 'pass', config, startedAt: 1000, endedAt: t, actions, result: null };
}

/** Bot vs bot through the real LocalTransport, capturing every live state. */
function playBotGame(seed: number, levels: [BotLevel, BotLevel], maxActions = 400) {
  let t = 1_700_000_000_000;
  let r = seed;
  const rand = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
  const tr = new LocalTransport({ seed, players: [{ name: 'Ada', kind: 'bot' }, { name: 'Bo', kind: 'bot' }] }, () => t);
  const live: GameState[] = [];
  const times: number[] = [];
  tr.subscribe((s) => { live.push(s); times.push(t); });
  for (let i = 0; i < maxActions && tr.getState().phase !== 'over'; i++) {
    const s = tr.getState();
    t += 700 + Math.floor(rand() * 2500);
    const res = botStep(s, levels[s.current], rand);
    if (Array.isArray(res)) {
      const m = res[0];
      if (!m) break;
      expect(tr.send({ type: 'move', player: s.current, from: m.from, to: m.to, promotion: m.promotion })).toBeNull();
    } else if (res) expect(tr.send(res)).toBeNull();
  }
  if (tr.getState().phase !== 'over') { t += 1000; tr.send({ type: 'resign', player: tr.getState().current }); }
  const rec: GameRecord = { v: 1, id: `test-${seed}`, mode: 'bot', config: tr.config, startedAt: tr.startedAt, endedAt: t, actions: tr.log, result: tr.getState().result };
  return { rec, live, times, final: tr.getState() };
}

const strip = (s: GameState) => ({ ...s, events: [] });

describe('classification', () => {
  it('maps win-chance loss to labels at the documented thresholds', () => {
    expect(classify({ loss: 0 })).toBe('best');
    expect(classify({ loss: THRESHOLDS.best })).toBe('best');
    expect(classify({ loss: THRESHOLDS.best + 0.01 })).toBe('good');
    expect(classify({ loss: THRESHOLDS.good })).toBe('good');
    expect(classify({ loss: THRESHOLDS.good + 0.01 })).toBe('inaccuracy');
    expect(classify({ loss: THRESHOLDS.inaccuracy })).toBe('inaccuracy');
    expect(classify({ loss: THRESHOLDS.inaccuracy + 0.01 })).toBe('mistake');
    expect(classify({ loss: THRESHOLDS.mistake })).toBe('mistake');
    expect(classify({ loss: THRESHOLDS.mistake + 0.01 })).toBe('blunder');
    expect(classify({ loss: 80 })).toBe('blunder');
  });
  it('promotes great and brilliant turns and punishes missed mates', () => {
    expect(classify({ loss: 1, gain: 25 })).toBe('great');
    expect(classify({ loss: 1, gain: 5 })).toBe('best');
    expect(classify({ loss: 0, sacrifice: true })).toBe('brilliant');
    expect(classify({ loss: 0, deepMate: true })).toBe('brilliant');
    expect(classify({ loss: 4, sacrifice: true })).toBe('good');
    expect(classify({ loss: 1, missedMate: true })).toBe('inaccuracy');
    expect(classify({ loss: 4, missedMate: true })).toBe('mistake');
    expect(classify({ loss: 40, missedMate: true })).toBe('blunder');
  });
  it('win chance and accuracy curves behave', () => {
    expect(winChance(0)).toBeCloseTo(50, 5);
    expect(winChance(400)).toBeGreaterThan(75);
    expect(winChance(-400)).toBeLessThan(25);
    expect(winChance(100_000)).toBe(100);
    expect(accuracyFromLoss(0)).toBeCloseTo(100, 0);
    expect(accuracyFromLoss(10)).toBeLessThan(accuracyFromLoss(5));
    expect(accuracyFromLoss(100)).toBeGreaterThanOrEqual(0);
  });
});

describe('analysis on crafted positions', () => {
  it('finds a quiet three-move mate (Be7, Bf6, Rd8#)', () => {
    const { pos, turn } = parseFen('6k1/5p1p/6p1/4P3/8/B7/5PPP/3R2K1 w - - 0 1');
    const line = findMateInTurn(pos, turn, 3)!;
    expect(sanLine(pos, turn, line)).toEqual(['Be7', 'Bf6', 'Rd8#']);
    // ...which a 2-card can't do: Rd8+ ends the turn without mate.
    expect(findMateInTurn(pos, turn, 2)).toBeNull();
    const best = bestTurn(pos, turn, 3, newContexts(ANALYSIS));
    expect(best.mate).toBe(true);
  });
  it('finds the rook-ladder mate with a 2-card', () => {
    const { pos, turn } = parseFen('7k/p7/8/8/3P4/3R4/2R5/1K6 w - - 0 1');
    const line = findMateInTurn(pos, turn, 2)!;
    expect(line).toHaveLength(2);
    expect(sanLine(pos, turn, line).at(-1)).toMatch(/#$/);
    expect(findMateInTurn(pos, turn, 1)).toBeNull();
  });
  it('flags an early check that threw away a mate', () => {
    const rec = craft('7k/p7/8/8/3P4/3R4/2R5/1K6 w - - 0 1', ['2', '1'], ['draw', 'c2c8', '/', 'draw', 'h8g7']);
    const r = reviewGame(rec);
    const t = r.turns[0];
    expect(t.card).toBe('2');
    expect(t.actual).toEqual(['Rc8+']);
    expect(t.flags.map((f) => f.type)).toContain('earlyCheck');
    expect(t.text).toMatch(/You checked on move 1 of a 2-card, ending your turn; .* then Rh3# was mate/);
    expect(t.best?.mate).toBe(true);
    expect(['inaccuracy', 'mistake', 'blunder']).toContain(t.label);
  });
  it('the same early check with a 3-card names the full quiet line', () => {
    const rec = craft('6k1/5p1p/6p1/4P3/8/B7/5PPP/3R2K1 w - - 0 1', ['3', '1'], ['draw', 'd1d8']);
    const t = reviewGame(rec).turns[0];
    expect(t.flags.some((f) => f.type === 'earlyCheck')).toBe(true);
    expect(t.text).toContain('You checked on move 1 of a 3-card, ending your turn; Be7, Bf6 then Rd8# was mate.');
    expect(t.best?.san).toEqual(['Be7', 'Bf6', 'Rd8#']);
  });
  it('labels a hung queen a blunder and explains the refutation', () => {
    const rec = craft('r3k3/ppp2ppp/8/8/8/8/PPP2PPP/3QK3 w - - 0 1', ['1', '1'], ['draw', 'd1d7', '/', 'draw', 'e8d7']);
    const r = reviewGame(rec);
    expect(r.turns[0].label).toBe('blunder');
    expect(r.turns[0].flags.some((f) => f.type === 'hangs')).toBe(true);
    expect(r.turns[0].text).toContain('Kxd7');
    expect(r.turns[1].label).toBe('best');
    expect(r.players[0].accuracy!).toBeLessThan(r.players[1].accuracy!);
  });
  it('a played mate counts as best (or brilliant) with no loss', () => {
    const rec = craft('6k1/5p1p/6p1/4P3/8/B7/5PPP/3R2K1 w - - 0 1', ['3', '1'], ['draw', 'a3e7', 'e7f6', 'd1d8']);
    const t = reviewGame(rec).turns[0];
    expect(t.loss).toBe(0);
    expect(['best', 'brilliant']).toContain(t.label);
    expect(t.flags.some((f) => f.type === 'foundMate')).toBe(true);
  });
});

describe('replay reconstruction', () => {
  let game: ReturnType<typeof playBotGame>;
  beforeAll(() => { game = playBotGame(11, ['easy', 'medium']); });

  it('rebuilds every live state from the log, clocks included', () => {
    const rp = reconstruct(game.rec);
    expect(rp.consistent).toBe(true);
    expect(rp.frames).toHaveLength(game.live.length + 1);
    game.live.forEach((s, i) => {
      const f = rp.frames[i + 1];
      expect(strip(f.state)).toEqual(strip(s));
      const prev = i === 0 ? rp.frames[0].state.events.length : game.live[i - 1].events.length;
      expect(f.state.events).toEqual(s.events.slice(prev));
      // Same timestamps, so the clocks shown at each frame are the live ones.
      expect(f.at).toBe(game.times[i]);
      expect(clocksAt(f)).toEqual([remainingMs(s, 0, game.times[i]), remainingMs(s, 1, game.times[i])]);
    });
    expect(strip(rp.final)).toEqual(strip(game.final));
    expect(rp.final.result).toEqual(game.final.result);
  });
  it('turn starts point at the first frame of each turn', () => {
    const rp = reconstruct(game.rec);
    let checked = 0;
    rp.turnStarts.forEach((i, turn) => {
      checked++;
      if (turn === 0) return expect(i).toBe(0);
      expect(rp.frames[i].turn).toBe(turn);
      expect(rp.frames[i - 1].turn).toBeLessThan(turn);
    });
    // Skipped turns have no frames of their own.
    expect(checked).toBe(rp.final.history.filter((t, k) => k === 0 || !t.skipped).length);
  });
  it('survives a JSON round trip and summarises', () => {
    const rec = JSON.parse(JSON.stringify(game.rec)) as GameRecord;
    expect(reconstruct(rec).consistent).toBe(true);
    const sum = summarize(rec);
    expect(sum.turns).toBe(game.final.history.filter((t) => !t.skipped).length || sum.turns);
    expect(sum.result).toEqual(game.final.result);
  });
  it('remaps card ids by kind when the logged id is unknown', () => {
    const base = craft('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['skip', '1', '1', '1'], ['draw', 'e2e4', '/', 'draw', 'e7e5']);
    base.actions.push({ at: 99_000, action: { type: 'playCard', player: 0, cardId: 999 }, kind: 'skip' });
    const rp = reconstruct(base);
    const last = rp.frames.at(-1)!;
    expect(last.kind).toBe('card');
    expect(last.state.events.some((e) => e.type === 'playCard' && e.card.kind === 'skip')).toBe(true);
  });
  it('converts a server log (online games) into a replayable record', () => {
    const rec = fromServerLog({
      v: 2, seed: game.rec.config.seed, clockMs: game.rec.config.clockMs ?? 600_000, graceMs: game.rec.config.graceMs ?? 1000,
      player0Color: 'w', startedAt: game.rec.startedAt, players: game.rec.config.players,
      actions: game.rec.actions.map((a) => ({ at: a.at, seat: 0, action: a.action })), result: game.rec.result,
    } as never, { gameId: 'g1', code: 'ABCDEF', rated: false, names: ['Ada', 'Bo'], createdAt: new Date(game.rec.startedAt).toISOString(), endedAt: null });
    expect(rec.mode).toBe('online');
    expect(rec.id).toBe('online-g1');
    expect(reconstruct(rec).consistent).toBe(true);
  });
  it('reviews a whole game with sane aggregates', () => {
    const r = reviewGame(game.rec);
    const reviewed = r.turns.filter((t) => t.label);
    expect(reviewed.length).toBeGreaterThan(5);
    for (const p of r.players) {
      expect(p.accuracy).not.toBeNull();
      expect(p.accuracy!).toBeGreaterThanOrEqual(0);
      expect(p.accuracy!).toBeLessThanOrEqual(100);
    }
    expect(r.graph.length).toBe(r.turns.length + 1);
    expect(r.keyMoments.length).toBeLessThanOrEqual(5);
  }, 60_000);
});

describe('recent games store', () => {
  beforeAll(() => {
    const m = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; },
    };
  });
  it('keeps the newest 40, dedupes re-saves, and round-trips records', async () => {
    const { saveGame, listGames, loadGame, deleteGame, saveReview, loadReview } = await import('../src/replay/store');
    const { rec } = playBotGame(5, ['easy', 'easy'], 60);
    for (let i = 0; i < 42; i++) await saveGame({ ...rec, id: `g${i}`, endedAt: rec.endedAt + i });
    const list = listGames();
    expect(list).toHaveLength(40);
    expect(list[0].id).toBe('g41');
    expect(await loadGame('g0')).toBeUndefined();
    expect((await loadGame('g41'))?.actions.length).toBe(rec.actions.length);
    await saveGame({ ...rec, id: 'g10' });
    expect(listGames()[0].id).toBe('g10');
    expect(listGames()).toHaveLength(40);
    await saveReview('g10', { version: 1 } as never);
    expect(await loadReview('g10')).toEqual({ version: 1 });
    await deleteGame('g10');
    expect(listGames().some((g) => g.id === 'g10')).toBe(false);
    expect(await loadReview('g10')).toBeUndefined();
  });
});
