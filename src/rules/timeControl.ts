/**
 * Time controls. One rating is shared across all of them (small player pool; Chess Uno's
 * card luck already dominates speed differences); quick match only pairs players who
 * picked the same control. Rapid uses the server's configured clock (10 minutes by default).
 */
export type TimeControl = 'bullet' | 'blitz' | 'rapid';
export const TIME_CONTROLS: readonly TimeControl[] = ['bullet', 'blitz', 'rapid'];
export const DEFAULT_TC: TimeControl = 'rapid';
export const TC_MS: Record<TimeControl, number> = { bullet: 3 * 60_000, blitz: 5 * 60_000, rapid: 10 * 60_000 };
export const TC_NAME: Record<TimeControl, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid' };
export const TC_SHORT: Record<TimeControl, string> = { bullet: '3 min', blitz: '5 min', rapid: '10 min' };
export const isTimeControl = (v: unknown): v is TimeControl => typeof v === 'string' && (TIME_CONTROLS as readonly string[]).includes(v);
/** Anything unknown (old clients) means the default. */
export const asTimeControl = (v: unknown): TimeControl => (isTimeControl(v) ? v : DEFAULT_TC);
/** Clock for a control; `rapidMs` lets the server keep its configurable default. */
export const clockFor = (tc: TimeControl, rapidMs = TC_MS.rapid) => (tc === 'rapid' ? rapidMs : TC_MS[tc]);
