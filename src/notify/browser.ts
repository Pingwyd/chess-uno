/**
 * Browser (system) notifications while the app runs in a tab: "your turn" in online games,
 * friend challenges / requests / rematch offers, and a daily streak reminder. They only fire
 * when the tab is hidden (in-app notices cover the visible case) and when the player switched
 * them on in Settings, which is also where the permission prompt happens.
 *
 * A tiny service worker (public/sw.js) shows them where `new Notification()` isn't allowed
 * (Android Chrome) and focuses the app on click. Real server push (tab closed) is in BACKLOG.md.
 */
import { localDay, streak, type Progress } from '../learn/progress';
import type { Settings } from '../ui/settings/store';

export type NotifyKind = keyof Settings['notify'];
export type Permission = 'granted' | 'denied' | 'default' | 'unsupported';

export function notifySupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function permission(): Permission {
  return notifySupported() ? (Notification.permission as Permission) : 'unsupported';
}

/** Pure gate: everything has to line up for a system notification. */
export function shouldNotify(o: { enabled: boolean; kindOn: boolean; permission: Permission; hidden: boolean }): boolean {
  return o.enabled && o.kindOn && o.permission === 'granted' && o.hidden;
}

/** Ask for permission (must run from a click). Registers the service worker when granted. */
export async function requestPermission(): Promise<Permission> {
  if (!notifySupported()) return 'unsupported';
  let p = Notification.permission as Permission;
  if (p === 'default') p = (await Notification.requestPermission()) as Permission;
  if (p === 'granted') void registerServiceWorker();
  return p;
}

let swReg: Promise<ServiceWorkerRegistration | null> | null = null;
/** Registers ./sw.js once (relative, so it works under the GitHub Pages sub-path). */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (swReg) return swReg;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !window.isSecureContext) return (swReg = Promise.resolve(null));
  swReg = navigator.serviceWorker.register('./sw.js').catch(() => null);
  return swReg;
}

export interface SystemNotice { kind: NotifyKind; title: string; body: string; tag: string }

/** Show a system notification if the settings, permission and tab visibility allow it. */
export async function systemNotify(n: SystemNotice, settings: Settings): Promise<boolean> {
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  if (!shouldNotify({ enabled: settings.browserNotify, kindOn: settings.notify[n.kind], permission: permission(), hidden })) return false;
  const opts: NotificationOptions = { body: n.body, tag: n.tag, icon: './favicon.svg', badge: './favicon.svg' };
  const reg = await registerServiceWorker();
  try {
    if (reg) { await reg.showNotification(n.title, opts); return true; }
    const note = new Notification(n.title, opts);
    note.onclick = () => { window.focus(); note.close(); };
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- streak reminder

const REMIND_KEY = 'cu.streakReminded';
/** Local hour after which the evening reminder fires if you haven't practised yet. */
export const REMIND_HOUR = 19;

/** Streak still alive from yesterday but nothing done today: the days at stake, else 0. */
export function streakAtRisk(p: Progress, today: string): number {
  if (p.days.includes(today)) return 0;
  return streak(p, today);
}

export const streakText = (n: number) => `Your ${n}-day streak ends at midnight. One lesson or the daily puzzle keeps it going.`;

/** Milliseconds until today's reminder hour (0 if it has passed). */
export function msUntilReminder(now: Date, hour = REMIND_HOUR): number {
  const at = new Date(now);
  at.setHours(hour, 0, 0, 0);
  return Math.max(0, at.getTime() - now.getTime());
}

/**
 * Daily streak reminder, at most once a day: on app open (in-app notice) and again at the
 * reminder hour if the app is still open (system notification when the tab is hidden).
 * Returns a cleanup function.
 */
export function startStreakReminder(deps: {
  progress: () => Progress;
  settings: () => Settings;
  inApp: (text: string) => void;
  now?: () => Date;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}): () => void {
  const now = deps.now ?? (() => new Date());
  const store = deps.storage ?? localStorage;
  const check = (evening: boolean) => {
    const s = deps.settings();
    if (!s.notify.streak) return;
    const today = localDay(now());
    const at = streakAtRisk(deps.progress(), today);
    if (!at) return;
    const key = `${today}${evening ? ':evening' : ''}`;
    if ((store.getItem(REMIND_KEY) ?? '').split(',').includes(key)) return;
    store.setItem(REMIND_KEY, [today, ...(evening ? [key] : [])].join(','));
    if (evening && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      void systemNotify({ kind: 'streak', title: 'Keep your streak', body: streakText(at), tag: 'streak' }, s);
    } else {
      deps.inApp(streakText(at));
    }
  };
  check(false);
  // Opened after the reminder hour: the on-open notice was the reminder.
  const wait = msUntilReminder(now());
  if (!wait) return () => {};
  const t = setTimeout(() => check(true), wait);
  return () => clearTimeout(t);
}
