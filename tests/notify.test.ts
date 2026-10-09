import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { msUntilReminder, shouldNotify, startStreakReminder, streakAtRisk } from '../src/notify/browser';
import { emptyProgress, type Progress } from '../src/learn/progress';
import { DEFAULT_SETTINGS, type Settings } from '../src/ui/settings/store';

const withDays = (days: string[]): Progress => ({ ...emptyProgress(), days });
class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } }

describe('browser notifications gate', () => {
  it('needs the master switch, the kind, permission and a hidden tab', () => {
    const ok = { enabled: true, kindOn: true, permission: 'granted' as const, hidden: true };
    expect(shouldNotify(ok)).toBe(true);
    expect(shouldNotify({ ...ok, enabled: false })).toBe(false);
    expect(shouldNotify({ ...ok, kindOn: false })).toBe(false);
    expect(shouldNotify({ ...ok, permission: 'default' })).toBe(false);
    expect(shouldNotify({ ...ok, permission: 'denied' })).toBe(false);
    expect(shouldNotify({ ...ok, hidden: false })).toBe(false);
  });
});

describe('streak reminder', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a streak is at risk when it is alive from yesterday and today is not done', () => {
    expect(streakAtRisk(withDays(['2026-10-07', '2026-10-08']), '2026-10-09')).toBe(2);
    expect(streakAtRisk(withDays(['2026-10-08', '2026-10-09']), '2026-10-09')).toBe(0); // done today
    expect(streakAtRisk(withDays(['2026-10-06']), '2026-10-09')).toBe(0); // already broken
    expect(streakAtRisk(withDays([]), '2026-10-09')).toBe(0);
  });

  it('time until the evening reminder', () => {
    expect(msUntilReminder(new Date(2026, 9, 9, 18, 30))).toBe(30 * 60_000);
    expect(msUntilReminder(new Date(2026, 9, 9, 20, 0))).toBe(0);
  });

  it('reminds once on open, again in the evening, never twice a day, and respects the setting', () => {
    let now = new Date(2026, 9, 9, 10, 0);
    const storage = new Mem();
    let progress = withDays(['2026-10-07', '2026-10-08']);
    const seen: string[] = [];
    const settings = { ...DEFAULT_SETTINGS } as Settings;
    const start = () => startStreakReminder({ progress: () => progress, settings: () => settings, inApp: (t) => seen.push(t), now: () => now, storage });
    const stop = start();
    expect(seen).toEqual(['Your 2-day streak ends at midnight. One lesson or the daily puzzle keeps it going.']);
    start()(); // reopened the same day: no second on-open notice
    expect(seen).toHaveLength(1);
    now = new Date(2026, 9, 9, 19, 0);
    vi.advanceTimersByTime(9 * 3_600_000);
    expect(seen).toHaveLength(2); // evening reminder (tab visible: in-app)
    stop();
    start()(); // after the reminder hour: nothing new today
    expect(seen).toHaveLength(2);
    now = new Date(2026, 9, 10, 9, 0);
    progress = withDays(['2026-10-08', '2026-10-09']);
    settings.notify = { ...settings.notify, streak: false };
    start()();
    expect(seen).toHaveLength(2); // switched off
    settings.notify = { ...settings.notify, streak: true };
    start()();
    expect(seen).toHaveLength(3);
  });
});
