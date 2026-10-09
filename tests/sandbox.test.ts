import { describe, expect, it } from 'vitest';
import { LocalTransport } from '../src/net/transport';
import { botStep } from '../src/engine/bot';
import { reconstruct, type GameRecord } from '../src/replay/record';
import { SANDBOX_CLOCK_MS, SandboxTransport, sandboxStart } from '../src/replay/sandbox';
import type { GameState, PlayerId } from '../src/rules/game';

/** A short recorded bot game to branch from. */
function recorded(seed: number) {
  let t = 1_700_000_000_000;
  let r = seed;
  const rand = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
  const tr = new LocalTransport({ seed, players: [{ name: 'Ada', kind: 'bot' }, { name: 'Bo', kind: 'bot' }] }, () => t);
  for (let i = 0; i < 120 && tr.getState().phase !== 'over'; i++) {
    const s = tr.getState();
    t += 900;
    const res = botStep(s, 'easy', rand);
    if (Array.isArray(res)) { const m = res[0]; if (!m) break; tr.send({ type: 'move', player: s.current, from: m.from, to: m.to, promotion: m.promotion }); }
    else if (res) tr.send(res);
  }
  const rec: GameRecord = { v: 1, id: 't', mode: 'bot', config: tr.config, startedAt: tr.startedAt, endedAt: t, actions: tr.log, result: tr.getState().result };
  return reconstruct(rec);
}

/** Play the side to move until the turn passes to the other seat. */
function playTurn(tr: SandboxTransport) {
  const who = tr.getState().current;
  for (let i = 0; i < 20 && tr.getState().current === who && tr.getState().phase !== 'over'; i++) {
    const s = tr.getState();
    const res = botStep(s, 'easy', () => 0.3);
    if (Array.isArray(res)) { const m = res[0]; if (!m) return; expect(tr.send({ type: 'move', player: s.current, from: m.from, to: m.to, promotion: m.promotion })).toBeNull(); }
    else if (res) expect(tr.send(res)).toBeNull();
    else return;
  }
}

describe('try it yourself sandbox', () => {
  const rep = recorded(11);
  const fi = rep.frames.findIndex((f, i) => i > 8 && f.state.phase === 'moving' && f.state.current === 1);
  const from = rep.frames[fi].state;

  it('re-seats the position: you vs the engine, same hand and deck, clocks off, no result', () => {
    const s = sandboxStart(from, 1, 'Rook Bot', 5);
    expect(s.players.map((p) => p.kind)).toEqual(['bot', 'human']);
    expect(s.players[1].name).toBe('You');
    expect(s.hands).toEqual(from.hands);
    expect(s.card).toEqual(from.card); // same card in play
    expect(s.drawPile).toEqual(from.drawPile);
    expect(s.pos).toEqual(from.pos);
    expect(s.clocks).toEqual([SANDBOX_CLOCK_MS, SANDBOX_CLOCK_MS]);
    expect(s.paused).toBe(false);
    expect(from.players.map((p) => p.kind)).toEqual(['bot', 'bot']); // replay state untouched
  });

  it('undo takes back your turn plus the engine reply; reset returns to the reviewed position', () => {
    let t = 1000;
    const start = sandboxStart(from, 1 as PlayerId, 'Rook Bot', t);
    const tr = new SandboxTransport(start, 1, () => (t += 500));
    expect(tr.canUndo()).toBe(false);
    playTurn(tr); // you
    playTurn(tr); // engine
    const afterOne: GameState = tr.getState();
    expect(afterOne.turnNumber).toBeGreaterThan(start.turnNumber);
    playTurn(tr); // you again
    playTurn(tr); // engine
    expect(tr.canUndo()).toBe(true);
    expect(tr.undo()).toBe(true);
    expect(tr.getState().pos).toEqual(afterOne.pos);
    expect(tr.getState().turnNumber).toBe(afterOne.turnNumber);
    expect(tr.undo()).toBe(true);
    expect(tr.getState().pos).toEqual(start.pos);
    expect(tr.canUndo()).toBe(false);
    playTurn(tr);
    expect(tr.getState().pos).not.toEqual(start.pos);
    tr.reset();
    expect(tr.getState().pos).toEqual(start.pos);
    expect(tr.getState().hands).toEqual(start.hands);
    expect(tr.canUndo()).toBe(false);
    expect(tr.send({ type: 'pause' })).toBeNull();
    expect(tr.getState().paused).toBe(false);
  });
});
