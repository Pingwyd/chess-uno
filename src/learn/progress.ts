/**
 * Learning-path progress: XP, stars, streaks, daily puzzles, badges and cosmetic rewards.
 * Pure functions over a plain JSON object — stored in localStorage, and (for signed-in accounts)
 * merged with the copy on the server, which uses the same `mergeProgress`.
 */

export type WhiteSkin = 'ember' | 'frost' | 'gilded';
export type BlackSkin = 'tide' | 'rose' | 'aurora';

export interface LessonRecord {
  stars: 1 | 2 | 3;
  /** Completed by passing the unit's placement check rather than playing the lesson. */
  tested?: boolean;
}

export interface Progress {
  v: 1;
  xp: number;
  lessons: Record<string, LessonRecord>;
  /** Local dates (YYYY-MM-DD) with any learning activity, ascending. */
  days: string[];
  /** Missed days bridged by a streak freeze. */
  frozen: string[];
  /** Streak freezes in stock (0 or 1). */
  freezes: number;
  /** UTC date → daily puzzle id solved that day. */
  daily: Record<string, string>;
  /** Badge id → local date earned. */
  badges: Record<string, string>;
  skins: { w: WhiteSkin; b: BlackSkin };
  rankedUnlocked: boolean;
  updatedAt: number;
}

export const emptyProgress = (): Progress => ({
  v: 1, xp: 0, lessons: {}, days: [], frozen: [], freezes: 1, daily: {}, badges: {},
  skins: { w: 'ember', b: 'tide' }, rankedUnlocked: false, updatedAt: 0,
});

// ---------------------------------------------------------------- dates

const pad = (n: number) => String(n).padStart(2, '0');
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const utcDay = (d = new Date()) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
/** Shift a YYYY-MM-DD date by whole days (calendar arithmetic, zone-independent). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
const MAX_DAYS = 400;

// ---------------------------------------------------------------- path structure (ids only, so the server can use this file)

export interface PathShape {
  /** Units in order, each a list of lesson ids in order. */
  units: { id: string; lessons: string[] }[];
}

export const pathOrder = (shape: PathShape) => shape.units.flatMap((u) => u.lessons);
export const isDone = (p: Progress, id: string) => !!p.lessons[id];

/** A lesson is open when every lesson before it on the path is done. */
export function isUnlocked(p: Progress, shape: PathShape, id: string): boolean {
  const order = pathOrder(shape);
  const i = order.indexOf(id);
  return i <= 0 || isDone(p, order[i - 1]);
}

export const nextLesson = (p: Progress, shape: PathShape): string | null => pathOrder(shape).find((id) => !isDone(p, id)) ?? null;
export const unitDone = (p: Progress, unit: { lessons: string[] }) => unit.lessons.every((id) => isDone(p, id));
export const pathDone = (p: Progress, shape: PathShape) => pathOrder(shape).every((id) => isDone(p, id));

// ---------------------------------------------------------------- scoring

/** Stars from accuracy: no mistakes or hints → 3, up to 2 → 2, otherwise 1. */
export const starsFor = (mistakes: number, hints: number): 1 | 2 | 3 => {
  const slips = mistakes + hints;
  return slips === 0 ? 3 : slips <= 2 ? 2 : 1;
};

export const XP = { lesson: 10, perStar: 5, replay: 5, daily: 20, placement: 30 } as const;

// ---------------------------------------------------------------- streaks

/** Days in the current streak, counting frozen days; alive if active today or yesterday. */
export function streak(p: Progress, today: string): number {
  const active = new Set([...p.days, ...p.frozen]);
  let day = active.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (active.has(day)) {
    if (p.days.includes(day)) n++;
    day = addDays(day, -1);
  }
  return n;
}

/** Mark today active; a single missed day is bridged by a freeze if one is in stock. */
export function recordActivity(p: Progress, today: string): Progress {
  if (p.days.includes(today)) return p;
  const next = { ...p, days: [...p.days], frozen: [...p.frozen] };
  const yesterday = addDays(today, -1);
  const before = addDays(today, -2);
  const active = new Set([...p.days, ...p.frozen]);
  if (!active.has(yesterday) && active.has(before) && next.freezes > 0) {
    next.frozen.push(yesterday);
    next.freezes--;
  }
  next.days.push(today);
  next.days = next.days.sort().slice(-MAX_DAYS);
  next.frozen = next.frozen.sort().slice(-MAX_DAYS);
  // Every 7-day milestone refills the freeze.
  if (next.freezes < 1 && streak(next, today) % 7 === 0) next.freezes = 1;
  return next;
}

// ---------------------------------------------------------------- badges & rewards

export interface Badge {
  id: string;
  name: string;
  desc: string;
  /** Lucide icon name (see src/ui/icons.tsx). */
  icon: string;
  /** Cosmetic unlocked by the badge. */
  reward?: { side: 'w'; skin: WhiteSkin } | { side: 'b'; skin: BlackSkin };
  earned: (p: Progress, ctx: { shape: PathShape; today: string }) => boolean;
}

const unitById = (shape: PathShape, id: string) => shape.units.find((u) => u.id === id) ?? { lessons: ['__missing__'] };

export const BADGES: Badge[] = [
  { id: 'first-steps', name: 'First Steps', icon: 'footprints', desc: 'Finish your first lesson.', earned: (p) => Object.keys(p.lessons).length > 0 },
  { id: 'board-ready', name: 'Board Ready', icon: 'pawn', desc: 'Complete Chess basics (or test out).', earned: (p, c) => unitDone(p, unitById(c.shape, 'basics')) },
  { id: 'card-shark', name: 'Card Shark', icon: 'spade', desc: 'Complete The cards.', reward: { side: 'w', skin: 'frost' }, earned: (p, c) => unitDone(p, unitById(c.shape, 'cards')) },
  { id: 'patient-hunter', name: 'Patient Hunter', icon: 'hourglass', desc: 'Complete Check ends your turn.', reward: { side: 'b', skin: 'rose' }, earned: (p, c) => unitDone(p, unitById(c.shape, 'check')) },
  { id: 'turntable', name: 'Turntable', icon: 'reverse', desc: 'Complete Skip & Reverse.', earned: (p, c) => unitDone(p, unitById(c.shape, 'actions')) },
  { id: 'graduate', name: 'Graduate', icon: 'graduation-cap', desc: 'Finish the whole path. Ranked play unlocked!', reward: { side: 'w', skin: 'gilded' }, earned: (p, c) => pathDone(p, c.shape) },
  { id: 'perfectionist', name: 'Perfectionist', icon: 'star', desc: 'Earn 3 stars on 5 lessons.', earned: (p) => Object.values(p.lessons).filter((l) => l.stars === 3 && !l.tested).length >= 5 },
  { id: 'on-fire', name: 'On Fire', icon: 'flame', desc: 'Reach a 3-day streak.', earned: (p, c) => streak(p, c.today) >= 3 },
  { id: 'unstoppable', name: 'Unstoppable', icon: 'rocket', desc: 'Reach a 7-day streak.', reward: { side: 'b', skin: 'aurora' }, earned: (p, c) => streak(p, c.today) >= 7 },
  { id: 'daily-devotee', name: 'Daily Devotee', icon: 'calendar-check', desc: 'Solve 3 daily puzzles.', earned: (p) => Object.keys(p.daily).length >= 3 },
  { id: 'scholar', name: 'Scholar', icon: 'scroll', desc: 'Earn 500 XP.', earned: (p) => p.xp >= 500 },
];

export const SKIN_NAMES: Record<WhiteSkin | BlackSkin, string> = {
  ember: 'Ember', frost: 'Frost Ember', gilded: 'Gilded Ember', tide: 'Tide', rose: 'Rose Tide', aurora: 'Aurora Tide',
};

export function ownedSkins(p: Progress): { w: WhiteSkin[]; b: BlackSkin[] } {
  const w: WhiteSkin[] = ['ember'];
  const b: BlackSkin[] = ['tide'];
  for (const badge of BADGES) {
    if (!p.badges[badge.id] || !badge.reward) continue;
    if (badge.reward.side === 'w') w.push(badge.reward.skin);
    else b.push(badge.reward.skin);
  }
  return { w, b };
}

/** Award any newly earned badges (and the ranked unlock). Returns the ids that are new. */
export function awardBadges(p: Progress, shape: PathShape, today: string): { progress: Progress; fresh: string[] } {
  const fresh = BADGES.filter((b) => !p.badges[b.id] && b.earned(p, { shape, today })).map((b) => b.id);
  const rankedUnlocked = p.rankedUnlocked || pathDone(p, shape);
  if (!fresh.length && rankedUnlocked === p.rankedUnlocked) return { progress: p, fresh };
  const badges = { ...p.badges };
  for (const id of fresh) badges[id] = today;
  return { progress: { ...p, badges, rankedUnlocked }, fresh };
}

// ---------------------------------------------------------------- events

export interface Outcome {
  progress: Progress;
  xpGained: number;
  newBadges: string[];
  /** Streak after this activity. */
  streak: number;
}

const finish = (p: Progress, shape: PathShape, today: string, xpGained: number, now: number): Outcome => {
  const withXp = recordActivity({ ...p, xp: p.xp + xpGained, updatedAt: now }, today);
  const { progress, fresh } = awardBadges(withXp, shape, today);
  return { progress, xpGained, newBadges: fresh, streak: streak(progress, today) };
};

/** A lesson was finished with the given stars. First completion: 10 + 5/star; replays: 5 + 5 per extra star. */
export function completeLesson(p: Progress, shape: PathShape, id: string, stars: 1 | 2 | 3, today: string, now = Date.now()): Outcome {
  const prev = p.lessons[id];
  const gained = prev && !prev.tested ? XP.replay + XP.perStar * Math.max(0, stars - prev.stars) : XP.lesson + XP.perStar * stars;
  const best = prev && !prev.tested ? (Math.max(prev.stars, stars) as 1 | 2 | 3) : stars;
  return finish({ ...p, lessons: { ...p.lessons, [id]: { stars: best } } }, shape, today, gained, now);
}

/** Passing a placement check completes every lesson of that unit (1 star, replayable for more). */
export function passPlacement(p: Progress, shape: PathShape, unitId: string, today: string, now = Date.now()): Outcome {
  const lessons = { ...p.lessons };
  for (const id of unitById(shape, unitId).lessons) if (!lessons[id]) lessons[id] = { stars: 1, tested: true };
  return finish({ ...p, lessons }, shape, today, XP.placement, now);
}

/** Solving today's daily puzzle (once per UTC day). */
export function solveDaily(p: Progress, shape: PathShape, utc: string, puzzleId: string, today: string, now = Date.now()): Outcome {
  if (p.daily[utc]) return { progress: p, xpGained: 0, newBadges: [], streak: streak(p, today) };
  return finish({ ...p, daily: { ...p.daily, [utc]: puzzleId } }, shape, today, XP.daily, now);
}

export function equipSkin(p: Progress, side: 'w' | 'b', skin: WhiteSkin | BlackSkin): Progress {
  const owned = ownedSkins(p);
  if (!(owned[side] as string[]).includes(skin)) return p;
  return { ...p, skins: { ...p.skins, [side]: skin }, updatedAt: Date.now() };
}

// ---------------------------------------------------------------- merge & validation

const STAR = (n: unknown): n is 1 | 2 | 3 => n === 1 || n === 2 || n === 3;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Coerce untrusted JSON (localStorage, network) into a valid Progress. */
export function sanitize(raw: unknown): Progress {
  const base = emptyProgress();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const lessons: Record<string, LessonRecord> = {};
  if (r.lessons && typeof r.lessons === 'object') {
    for (const [id, v] of Object.entries(r.lessons as Record<string, unknown>).slice(0, 200)) {
      const rec = v as Partial<LessonRecord> | null;
      if (/^[\w-]{1,32}$/.test(id) && rec && STAR(rec.stars)) lessons[id] = rec.tested ? { stars: rec.stars, tested: true } : { stars: rec.stars };
    }
  }
  const days = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((d): d is string => typeof d === 'string' && DAY.test(d)))].sort().slice(-MAX_DAYS) : []);
  const dict = (v: unknown, valid: RegExp) => {
    const out: Record<string, string> = {};
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, MAX_DAYS)) if (/^[\w-]{1,32}$/.test(k) && typeof x === 'string' && valid.test(x)) out[k] = x;
    }
    return out;
  };
  const skins = (r.skins ?? {}) as { w?: string; b?: string };
  return {
    v: 1,
    xp: typeof r.xp === 'number' && Number.isFinite(r.xp) ? Math.max(0, Math.min(1e7, Math.floor(r.xp))) : 0,
    lessons,
    days: days(r.days),
    frozen: days(r.frozen),
    freezes: r.freezes === 0 ? 0 : 1,
    daily: dict(r.daily, /^[\w-]{1,32}$/),
    badges: dict(r.badges, DAY),
    skins: {
      w: (['ember', 'frost', 'gilded'] as const).find((s) => s === skins.w) ?? 'ember',
      b: (['tide', 'rose', 'aurora'] as const).find((s) => s === skins.b) ?? 'tide',
    },
    rankedUnlocked: r.rankedUnlocked === true,
    updatedAt: typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : 0,
  };
}

/**
 * Combine two copies (e.g. this device and the server). Nothing earned is ever lost: lessons keep
 * their best stars, days/badges/dailies are unions, XP takes the larger total, and settings
 * (equipped skins) follow the most recently updated copy.
 */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const lessons: Record<string, LessonRecord> = { ...a.lessons };
  for (const [id, rec] of Object.entries(b.lessons)) {
    const cur = lessons[id];
    if (!cur) { lessons[id] = rec; continue; }
    const played = [cur, rec].filter((x) => !x.tested);
    lessons[id] = played.length ? { stars: Math.max(...played.map((x) => x.stars)) as 1 | 2 | 3 } : cur;
  }
  const newer = b.updatedAt > a.updatedAt ? b : a;
  const badges = { ...b.badges, ...a.badges };
  for (const [id, d] of Object.entries(b.badges)) if (a.badges[id] && d < a.badges[id]) badges[id] = d;
  return {
    v: 1,
    xp: Math.max(a.xp, b.xp),
    lessons,
    days: [...new Set([...a.days, ...b.days])].sort().slice(-MAX_DAYS),
    frozen: [...new Set([...a.frozen, ...b.frozen])].sort().slice(-MAX_DAYS),
    freezes: newer.freezes,
    daily: { ...b.daily, ...a.daily },
    badges,
    skins: newer.skins,
    rankedUnlocked: a.rankedUnlocked || b.rankedUnlocked,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}
