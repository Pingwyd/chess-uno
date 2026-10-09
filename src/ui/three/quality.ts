/**
 * Adaptive rendering quality for the 3D board. Resolution is the last thing to go: a weak GPU
 * first loses particles, then bloom (half-res, then off), then real-time shadows (smaller map,
 * then baked contact shadows), then environment reflections, and only then a modest DPR step.
 * DPR never drops below 1.25 on high-DPI screens (1 elsewhere), so the board never turns into
 * a blurry upscale.
 */

export type { GraphicsPref } from '../settings/store';

export interface Quality {
  level: number;
  particles: boolean;
  /** 0 = bloom/composer off, 0.5 = half-res bloom, 1 = full. */
  bloom: 0 | 0.5 | 1;
  /** Shadow-map size; 0 = baked contact shadows only. */
  shadowMap: 0 | 1024 | 2048;
  /** PMREM studio reflections on the metal/obsidian materials. */
  reflections: boolean;
  dpr: number;
}

/** Highest level: everything optional off and one DPR step. */
export const MAX_LEVEL = 7;
/** What "Low" pins: all effects off, full resolution kept. */
export const LOW_LEVEL = 6;

export const baseDpr = (deviceDpr: number) => Math.max(1, Math.min(deviceDpr || 1, 2));
export const minDpr = (deviceDpr: number) => Math.min(baseDpr(deviceDpr), (deviceDpr || 1) >= 2 ? 1.25 : 1);

export function qualityFor(level: number, deviceDpr: number): Quality {
  const l = Math.max(0, Math.min(MAX_LEVEL, Math.round(level)));
  const base = baseDpr(deviceDpr);
  return {
    level: l,
    particles: l < 1,
    bloom: l < 2 ? 1 : l < 3 ? 0.5 : 0,
    shadowMap: l < 4 ? 2048 : l < 5 ? 1024 : 0,
    reflections: l < 6,
    dpr: l < 7 ? base : Math.max(minDpr(deviceDpr), Math.round((base - 0.5) * 100) / 100),
  };
}

export interface GovernorOptions {
  /** Minimum time between two level changes. */
  cooldownMs?: number;
  /** Time at the current level before quality may go back up. */
  climbAfterMs?: number;
  /** A decline this soon after a climb pins the ceiling (no more flip-flopping). */
  flipWindowMs?: number;
}

/**
 * Hysteresis around fps signals (e.g. drei's PerformanceMonitor onDecline/onIncline): one step
 * at a time, a cooldown between steps, slower to climb than to drop, and a climb that is
 * immediately followed by a drop locks the better level out for the rest of the session.
 */
export class QualityGovernor {
  level: number;
  /** Best level we may climb back to. */
  ceiling = 0;
  private changedAt = -Infinity;
  private climbedAt = -Infinity;
  private readonly o: Required<GovernorOptions>;

  constructor(start = 0, opts: GovernorOptions = {}) {
    this.level = start;
    this.o = { cooldownMs: 2500, climbAfterMs: 10_000, flipWindowMs: 15_000, ...opts };
  }

  decline(now: number): boolean {
    if (this.level >= MAX_LEVEL || now - this.changedAt < this.o.cooldownMs) return false;
    if (now - this.climbedAt < this.o.flipWindowMs) this.ceiling = Math.max(this.ceiling, this.level + 1);
    this.level++;
    this.changedAt = now;
    return true;
  }

  incline(now: number): boolean {
    if (this.level <= this.ceiling || now - this.changedAt < this.o.climbAfterMs) return false;
    this.level--;
    this.changedAt = now;
    this.climbedAt = now;
    return true;
  }
}
