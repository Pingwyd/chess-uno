import { describe, expect, it } from 'vitest';
import { LOW_LEVEL, MAX_LEVEL, QualityGovernor, baseDpr, minDpr, qualityFor } from '../src/ui/three/quality';

describe('3D quality levels', () => {
  it('keeps DPR crisp: min(device, 2), never below 1.25 on high-DPI or 1 anywhere', () => {
    expect(baseDpr(3)).toBe(2);
    expect(baseDpr(1)).toBe(1);
    expect(baseDpr(0.8)).toBe(1);
    for (let l = 0; l <= MAX_LEVEL; l++) {
      expect(qualityFor(l, 3).dpr).toBeGreaterThanOrEqual(1.25);
      expect(qualityFor(l, 2).dpr).toBeGreaterThanOrEqual(1.25);
      expect(qualityFor(l, 1).dpr).toBeGreaterThanOrEqual(1);
    }
    expect(minDpr(3)).toBe(1.25);
    expect(minDpr(1.5)).toBe(1);
  });

  it('drops effects before resolution, in order', () => {
    const q = (l: number) => qualityFor(l, 3);
    expect(q(0)).toMatchObject({ particles: true, bloom: 1, shadowMap: 2048, reflections: true, dpr: 2 });
    expect(q(1)).toMatchObject({ particles: false, bloom: 1, dpr: 2 });
    expect(q(2)).toMatchObject({ bloom: 0.5, shadowMap: 2048, dpr: 2 });
    expect(q(3)).toMatchObject({ bloom: 0, shadowMap: 2048, dpr: 2 });
    expect(q(4)).toMatchObject({ shadowMap: 1024, reflections: true, dpr: 2 });
    expect(q(5)).toMatchObject({ shadowMap: 0, reflections: true, dpr: 2 });
    expect(q(LOW_LEVEL)).toMatchObject({ particles: false, bloom: 0, shadowMap: 0, reflections: false, dpr: 2 });
    expect(q(MAX_LEVEL).dpr).toBe(1.5);
  });
});

describe('QualityGovernor hysteresis', () => {
  it('steps one level at a time with a cooldown', () => {
    const g = new QualityGovernor();
    expect(g.decline(0)).toBe(true);
    expect(g.decline(500)).toBe(false);
    expect(g.decline(3000)).toBe(true);
    expect(g.level).toBe(2);
  });

  it('climbs slowly and pins the ceiling after a flip-flop', () => {
    const g = new QualityGovernor();
    g.decline(0); g.decline(3000); // level 2
    expect(g.incline(5000)).toBe(false); // too soon
    expect(g.incline(14_000)).toBe(true); // level 1
    expect(g.decline(17_000)).toBe(true); // dropped right after climbing → ceiling 2
    expect(g.level).toBe(2);
    expect(g.incline(60_000)).toBe(false);
    expect(g.level).toBe(2);
  });

  it('never goes past the limits', () => {
    const g = new QualityGovernor(MAX_LEVEL);
    expect(g.decline(1e6)).toBe(false);
    const h = new QualityGovernor(0);
    expect(h.incline(1e6)).toBe(false);
  });
});
