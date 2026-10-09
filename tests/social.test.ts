import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AVATARS, isAvatar } from '../src/net/protocol';
import { localStats } from '../src/ui/settings/stats';
import type { GameSummary } from '../src/replay/record';

const game = (i: number, you: 0 | 1 | null, winner: 0 | 1 | null): GameSummary => ({
  id: `g${i}`, mode: 'bot', players: ['You', 'Bot'], colors: ['w', 'b'], you, turns: 10, endedAt: 1000 + i,
  result: { winner, reason: winner === null ? 'stalemate' : 'checkmate' } as GameSummary['result'],
});

describe('local profile stats', () => {
  it('counts wins/losses/draws from your seat and tracks streaks in time order', () => {
    // Deliberately out of order: endedAt decides the sequence W W L W W W D W W.
    const seq: [0 | 1, 0 | 1 | null][] = [[0, 0], [1, 1], [0, 1], [0, 0], [1, 1], [0, 0], [0, null], [0, 0], [1, 1]];
    const games = seq.map(([you, w], i) => game(i, you, w)).reverse();
    expect(localStats(games)).toEqual({ w: 7, l: 1, d: 1, streak: 2, best: 3 });
  });
  it('ignores pass & play / spectated games and unfinished ones', () => {
    const g = [game(1, null, 0), { ...game(2, 0, 0), result: null }];
    expect(localStats(g)).toEqual({ w: 0, l: 0, d: 0, streak: 0, best: 0 });
  });
});

describe('avatars', () => {
  it('accepts only the fixed set', () => {
    expect(AVATARS).toHaveLength(16);
    expect(new Set(AVATARS).size).toBe(AVATARS.length);
    for (const a of AVATARS) expect(isAvatar(a)).toBe(true);
    for (const v of ['', 'x', '<img>', null, 3, '♞♞']) expect(isAvatar(v)).toBe(false);
  });
});

describe('settings store', () => {
  const mem = new Map<string, string>();
  beforeAll(() => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: () => null, get length() { return mem.size; },
    };
  });

  it('merges stored values over defaults (including nested notify) and survives bad JSON', async () => {
    mem.set('cu.settings', JSON.stringify({ sfxVolume: 0.3, notify: { streak: false } }));
    vi.resetModules();
    const s = await import('../src/ui/settings/store');
    expect(s.getSettings().sfxVolume).toBe(0.3);
    expect(s.getSettings().hints).toBe(true);
    expect(s.getSettings().notify).toEqual({ ...s.DEFAULT_SETTINGS.notify, streak: false });

    mem.set('cu.settings', '{oops');
    vi.resetModules();
    const s2 = await import('../src/ui/settings/store');
    expect(s2.getSettings()).toEqual(s2.DEFAULT_SETTINGS);
  });

  it('persists patches, notifies subscribers and resolves reduced motion', async () => {
    mem.clear();
    vi.resetModules();
    const s = await import('../src/ui/settings/store');
    let calls = 0;
    const off = s.subscribeSettings(() => calls++);
    s.setSettings({ confirmMoves: true, reducedMotion: 'on' });
    expect(calls).toBe(1);
    expect(JSON.parse(mem.get('cu.settings')!).confirmMoves).toBe(true);
    expect(s.reducedMotion()).toBe(true);
    s.setSettings({ reducedMotion: 'off' });
    expect(s.reducedMotion()).toBe(false);
    // "system" follows the OS preference (no matchMedia in node → false).
    expect(s.reducedMotion({ ...s.getSettings(), reducedMotion: 'system' })).toBe(false);
    off();
    s.setSettings({ hints: false });
    expect(calls).toBe(2);
  });
});
