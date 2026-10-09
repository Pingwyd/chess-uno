import type { Lesson, Puzzle, Unit } from '../types';
import { unit1 } from './unit1';
import { unit2 } from './unit2';
import { unit3 } from './unit3';
import { unit4 } from './unit4';
import { unit5 } from './unit5';
import { DAILY_PUZZLES } from './daily';

export const UNITS: Unit[] = [unit1, unit2, unit3, unit4, unit5];
export { DAILY_PUZZLES };

/** Every lesson in path order. */
export const LESSONS: Lesson[] = UNITS.flatMap((u) => u.lessons);

export const lessonById = (id: string): Lesson | undefined =>
  LESSONS.find((l) => l.id === id) ?? UNITS.find((u) => u.placement?.id === id)?.placement;
export const unitOfLesson = (id: string): Unit | undefined =>
  UNITS.find((u) => u.lessons.some((l) => l.id === id) || u.placement?.id === id);

/** All puzzles with where they live (lessons, placement checks and the daily pool). */
export function allPuzzles(): { puzzle: Puzzle; where: string }[] {
  const out: { puzzle: Puzzle; where: string }[] = [];
  for (const u of UNITS) {
    for (const l of [...u.lessons, ...(u.placement ? [u.placement] : [])]) {
      for (const s of l.steps) if (s.kind === 'puzzle') out.push({ puzzle: s.puzzle, where: l.id });
    }
  }
  for (const p of DAILY_PUZZLES) out.push({ puzzle: p, where: 'daily' });
  return out;
}

/** Unit/lesson ids in order — the shape progress.ts works with. */
export const PATH_SHAPE = { units: UNITS.map((u) => ({ id: u.id, lessons: u.lessons.map((l) => l.id) })) };

/** The puzzle of the day for a UTC date (same for everyone). */
export function dailyFor(utc: string): Puzzle {
  const [y, m, d] = utc.split('-').map(Number);
  const n = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86_400_000);
  return DAILY_PUZZLES[((n % DAILY_PUZZLES.length) + DAILY_PUZZLES.length) % DAILY_PUZZLES.length];
}
