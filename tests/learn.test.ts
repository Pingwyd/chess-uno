import { describe, expect, it } from 'vitest';
import { UNITS, LESSONS, DAILY_PUZZLES, PATH_SHAPE, allPuzzles, dailyFor, lessonById } from '../src/learn/content';
import { PATH_OUTLINE, OUTLINE_SHAPE } from '../src/learn/outline';
import { applyToken, createPuzzleGame, demoFrames, judge, playSolution, segmentOver, solveAll } from '../src/learn/engine';
import type { Demo, Lesson, Puzzle } from '../src/learn/types';
import {
  BADGES, completeLesson, emptyProgress, equipSkin, isUnlocked, mergeProgress, nextLesson, ownedSkins, passPlacement,
  recordActivity, sanitize, solveDaily, starsFor, streak, XP, addDays, type Progress,
} from '../src/learn/progress';

const puzzles = allPuzzles();
const byId = Object.fromEntries(puzzles.map(({ puzzle }) => [puzzle.id, puzzle])) as Record<string, Puzzle>;
const allLessons: Lesson[] = UNITS.flatMap((u) => [...u.lessons, ...(u.placement ? [u.placement] : [])]);
const demos: { demo: Demo; where: string }[] = allLessons.flatMap((l) =>
  l.steps.flatMap((s) => (s.kind !== 'puzzle' && s.demo ? [{ demo: s.demo, where: l.id }] : [])));

describe('learning content', () => {
  it('has a solid content set', () => {
    expect(UNITS.map((u) => u.id)).toEqual(['basics', 'cards', 'check', 'actions', 'strategy']);
    expect(LESSONS.length).toBeGreaterThanOrEqual(20);
    expect(puzzles.length).toBeGreaterThanOrEqual(40);
    expect(puzzles.filter((p) => p.where !== 'daily').length).toBeGreaterThanOrEqual(40);
    expect(DAILY_PUZZLES.length).toBeGreaterThanOrEqual(7);
    expect(UNITS[0].placement).toBeDefined();
  });

  it('uses unique ids', () => {
    const lessonIds = allLessons.map((l) => l.id);
    expect(new Set(lessonIds).size).toBe(lessonIds.length);
    const puzzleIds = puzzles.map((p) => p.puzzle.id);
    expect(new Set(puzzleIds).size).toBe(puzzleIds.length);
    expect(lessonIds.filter((id) => puzzleIds.includes(id))).toEqual([]);
  });

  it('keeps lessons short and well-formed', () => {
    for (const l of allLessons) {
      expect(l.minutes, l.id).toBeGreaterThanOrEqual(1);
      expect(l.minutes, l.id).toBeLessThanOrEqual(3);
      expect(l.steps.length, l.id).toBeGreaterThan(0);
      expect(l.steps.length, l.id).toBeLessThanOrEqual(8);
      for (const s of l.steps) {
        if (s.kind === 'mcq') {
          expect(s.options.length, s.question).toBeGreaterThanOrEqual(2);
          expect(s.answer, s.question).toBeGreaterThanOrEqual(0);
          expect(s.answer, s.question).toBeLessThan(s.options.length);
          expect(new Set(s.options).size, s.question).toBe(s.options.length);
        }
        if (s.kind === 'puzzle') {
          expect(s.puzzle.hint.length, s.puzzle.id).toBeGreaterThan(10);
          expect(s.puzzle.explain.length, s.puzzle.id).toBeGreaterThan(10);
          expect(s.puzzle.goals.length, s.puzzle.id).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps the lightweight outline in sync with the content', () => {
    expect(OUTLINE_SHAPE).toEqual(PATH_SHAPE);
    expect(PATH_OUTLINE.flatMap((u) => u.lessons.map(([, title]) => title))).toEqual(LESSONS.map((l) => l.title));
  });

  it.each(puzzles.map((p) => [p.puzzle.id, p.puzzle] as const))('puzzle %s: the authored solution meets every goal', (_id, p) => {
    const { verdict, states } = playSolution(p);
    expect(verdict).toMatchObject({ ok: true });
    expect(segmentOver(states[states.length - 1])).toBe(true);
  });

  it.each(puzzles.map((p) => [p.puzzle.id, p.puzzle] as const).filter(([id]) => id !== 'dly-longknight'))(
    'puzzle %s: exhaustive search over every legal line accepts the authored solution', (_id, p) => {
      const { solutions, complete } = solveAll(p, 60_000);
      expect(complete).toBe(true);
      expect(solutions.length).toBeGreaterThan(0);
      expect(solutions.map((s) => s.join(' '))).toContain(p.solution.filter((t) => t !== 'draw').join(' '));
    }, 30_000);

  it.each(demos.map((d, k) => [`${d.where}#${k}`, d.demo] as const))('demo %s plays through the rules engine', (_id, d) => {
    const frames = demoFrames(d);
    expect(frames.length).toBe(d.actions.length + 1);
  });

  it('rejects an early check that ends the turn (c4-ladder: Rc8+)', () => {
    const p = byId['c4-ladder'];
    const start = createPuzzleGame(p);
    const end = applyToken(start, 'c2c8');
    expect(segmentOver(end)).toBe(true);
    expect(judge(p, start, end)).toMatchObject({ ok: false, earlyCheck: true, reason: expect.stringMatching(/check ended your turn/) });
  });

  it('needs the full card: these puzzles have no solution with one move fewer', () => {
    for (const id of ['c4-bishop', 'c2-sprint', 'c2-knight', 'd2-knight', 'd3-sweep', 'd4-both', 'f4-spree', 'c1-two']) {
      const p = byId[id];
      const n = Number(p.cards[p.cards.length - 1]);
      const fewer = { ...p, cards: [...p.cards.slice(0, -1), String(n - 1)] } as Puzzle;
      expect(solveAll(fewer, 60_000).solutions, id).toEqual([]);
    }
  });

  it('accepts alternative solutions, not just the authored line', () => {
    expect(solveAll(byId['c2-knight']).solutions.length).toBeGreaterThan(1);
    expect(solveAll(byId['c4-bishop']).solutions.map((s) => s.join(' '))).toContain('a3f8 f8h6 d1d8');
  });

  it('Skip & Reverse goals: playing the Reverse instead of mating fails', () => {
    const p = byId['e4-dont'];
    const start = createPuzzleGame(p);
    const end = applyToken(start, 'reverse');
    expect(judge(p, start, end).ok).toBe(false);
  });

  it('picks the same daily puzzle for everyone on a given UTC day and rotates through the pool', () => {
    expect(dailyFor('2026-10-09').id).toBe(dailyFor('2026-10-09').id);
    const seen = new Set(Array.from({ length: DAILY_PUZZLES.length }, (_, k) => dailyFor(addDays('2026-10-01', k)).id));
    expect(seen.size).toBe(DAILY_PUZZLES.length);
    expect(dailyFor('2025-12-25')).toBeDefined();
  });

  it('finds placement checks and lessons by id', () => {
    expect(lessonById('b1')?.title).toBeTruthy();
    expect(lessonById(UNITS[0].placement!.id)).toBe(UNITS[0].placement);
  });
});

describe('learning progress', () => {
  const T = '2026-10-09';
  const shape = PATH_SHAPE;
  const doAll = (p: Progress, ids: string[], day = T) => ids.reduce((q, id) => completeLesson(q, shape, id, 3, day, 1).progress, p);

  it('scores stars from mistakes and hints', () => {
    expect(starsFor(0, 0)).toBe(3);
    expect(starsFor(1, 0)).toBe(2);
    expect(starsFor(1, 1)).toBe(2);
    expect(starsFor(2, 1)).toBe(1);
  });

  it('unlocks lessons in order', () => {
    const p = emptyProgress();
    expect(isUnlocked(p, shape, 'b1')).toBe(true);
    expect(isUnlocked(p, shape, 'b2')).toBe(false);
    expect(nextLesson(p, shape)).toBe('b1');
    const q = completeLesson(p, shape, 'b1', 2, T, 1).progress;
    expect(isUnlocked(q, shape, 'b2')).toBe(true);
    expect(nextLesson(q, shape)).toBe('b2');
  });

  it('awards XP for first completions and improvements, keeping the best stars', () => {
    const a = completeLesson(emptyProgress(), shape, 'b1', 2, T, 1);
    expect(a.xpGained).toBe(XP.lesson + 2 * XP.perStar);
    expect(a.newBadges).toContain('first-steps');
    const b = completeLesson(a.progress, shape, 'b1', 3, T, 2);
    expect(b.xpGained).toBe(XP.replay + XP.perStar);
    const c = completeLesson(b.progress, shape, 'b1', 1, T, 3);
    expect(c.xpGained).toBe(XP.replay);
    expect(c.progress.lessons.b1.stars).toBe(3);
  });

  it('placement completes the whole unit and awards its badge', () => {
    const o = passPlacement(emptyProgress(), shape, 'basics', T, 1);
    expect(o.xpGained).toBe(XP.placement);
    expect(shape.units[0].lessons.every((id) => o.progress.lessons[id]?.tested)).toBe(true);
    expect(o.newBadges).toContain('board-ready');
    expect(nextLesson(o.progress, shape)).toBe(shape.units[1].lessons[0]);
    // Replaying a tested-out lesson counts as a first completion.
    expect(completeLesson(o.progress, shape, 'b1', 3, T, 2).xpGained).toBe(XP.lesson + 3 * XP.perStar);
  });

  it('tracks daily streaks with a one-day freeze', () => {
    let p = emptyProgress();
    for (let k = 0; k < 3; k++) p = recordActivity(p, addDays(T, k));
    expect(streak(p, addDays(T, 2))).toBe(3);
    expect(streak(p, addDays(T, 3))).toBe(3); // still alive the next day
    expect(streak(p, addDays(T, 4))).toBe(0);
    // Miss one day: the freeze bridges it.
    p = recordActivity(p, addDays(T, 4));
    expect(p.frozen).toEqual([addDays(T, 3)]);
    expect(p.freezes).toBe(0);
    expect(streak(p, addDays(T, 4))).toBe(4);
    // Miss two more without a freeze: streak resets.
    p = recordActivity(p, addDays(T, 7));
    expect(streak(p, addDays(T, 7))).toBe(1);
  });

  it('refills the freeze at 7-day milestones', () => {
    let p = { ...emptyProgress(), freezes: 0 };
    for (let k = 0; k < 7; k++) p = recordActivity(p, addDays(T, k));
    expect(p.freezes).toBe(1);
  });

  it('solves the daily once per day', () => {
    const a = solveDaily(emptyProgress(), shape, T, 'dly-x', T, 1);
    expect(a.xpGained).toBe(XP.daily);
    const b = solveDaily(a.progress, shape, T, 'dly-x', T, 2);
    expect(b.xpGained).toBe(0);
  });

  it('badges unlock skins; completing the path unlocks ranked', () => {
    let p = doAll(emptyProgress(), shape.units[1].lessons);
    expect(p.badges['card-shark']).toBeTruthy();
    expect(ownedSkins(p).w).toContain('frost');
    expect(equipSkin(p, 'w', 'frost').skins.w).toBe('frost');
    expect(equipSkin(p, 'w', 'gilded').skins.w).toBe('ember'); // not owned yet
    expect(p.rankedUnlocked).toBe(false);
    p = doAll(p, shape.units.flatMap((u) => u.lessons));
    expect(p.rankedUnlocked).toBe(true);
    expect(p.badges.graduate).toBeTruthy();
    expect(ownedSkins(p).w).toContain('gilded');
    for (const b of BADGES) expect(b.name.length).toBeGreaterThan(0);
  });

  it('merges two devices without losing anything', () => {
    const a = { ...doAll(emptyProgress(), ['b1', 'b2'], '2026-10-01'), xp: 50, updatedAt: 10 };
    const b0 = completeLesson(emptyProgress(), shape, 'b1', 1, '2026-10-02', 20).progress;
    const b = { ...completeLesson(b0, shape, 'b3', 2, '2026-10-02', 20).progress, skins: { w: 'frost' as const, b: 'tide' as const }, xp: 40 };
    const m = mergeProgress(a, b);
    expect(m.lessons.b1.stars).toBe(3);
    expect(Object.keys(m.lessons).sort()).toEqual(['b1', 'b2', 'b3']);
    expect(m.days).toEqual(['2026-10-01', '2026-10-02']);
    expect(m.xp).toBe(50);
    expect(m.skins.w).toBe('frost'); // newer copy's setting
    expect(mergeProgress(m, m)).toEqual(m);
  });

  it('sanitizes untrusted data', () => {
    expect(sanitize(null)).toEqual(emptyProgress());
    const s = sanitize({ xp: -5, lessons: { b1: { stars: 9 }, b2: { stars: 2 }, 'bad id!': { stars: 1 } }, days: ['2026-10-01', 'x', '2026-10-01'], skins: { w: 'hacker' }, rankedUnlocked: 'yes' });
    expect(s.xp).toBe(0);
    expect(s.lessons).toEqual({ b2: { stars: 2 } });
    expect(s.days).toEqual(['2026-10-01']);
    expect(s.skins.w).toBe('ember');
    expect(s.rankedUnlocked).toBe(false);
  });
});
