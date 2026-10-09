/**
 * Device settings (localStorage). Board mode, piece set and the master sound switch keep their
 * original keys (cu.board, cu.pieceSet, cu.sound) and live in App state; everything else is here.
 */
import { useSyncExternalStore } from 'react';
import { DEFAULT_TC, type TimeControl } from '../../rules/timeControl';

export type MotionPref = 'system' | 'on' | 'off';
export type GraphicsPref = 'auto' | 'high' | 'low';
export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  /** Show legal-move dots/rings for the selected piece. */
  hints: boolean;
  /** Tap a move, then confirm it (avoids mis-taps on phones). */
  confirmMoves: boolean;
  /** 0–1. */
  sfxVolume: number;
  /** 0–1; 0 = music off. */
  musicVolume: number;
  vibration: boolean;
  /** Placeholders until push notifications ship (see BACKLOG.md). */
  notify: { turn: boolean; friends: boolean; challenges: boolean; streak: boolean };
  reducedMotion: MotionPref;
  /** Avatar chosen on this device (synced to the account when signed in). */
  avatar: string | null;
  /** 3D board rendering: adaptive, always full effects, or effects off (resolution stays crisp). */
  graphics: GraphicsPref;
  /** Paper (light, default), ink (dark), or follow the OS. */
  theme: ThemePref;
  /** Clock for new games (vs bot, Pass & Play, quick match, invites and challenges). */
  timeControl: TimeControl;
  /** System notifications when the tab is hidden (permission asked when switched on). */
  browserNotify: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  hints: true, confirmMoves: false, sfxVolume: 0.8, musicVolume: 0, vibration: true,
  notify: { turn: true, friends: true, challenges: true, streak: true },
  reducedMotion: 'system', avatar: null, graphics: 'auto', theme: 'light',
  timeControl: DEFAULT_TC, browserNotify: false,
};

const KEY = 'cu.settings';
const listeners = new Set<() => void>();

function read(): Settings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (!raw) return DEFAULT_SETTINGS;
    const v = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...v, notify: { ...DEFAULT_SETTINGS.notify, ...(v.notify ?? {}) } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let current = read();

export const getSettings = () => current;

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage full / private mode */ }
  listeners.forEach((l) => l());
}

export const subscribeSettings = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const useSettings = () => useSyncExternalStore(subscribeSettings, getSettings, getSettings);

const systemReduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** The effective reduced-motion flag (setting, or the OS preference when set to "system"). */
export const reducedMotion = (s: Settings = current) => (s.reducedMotion === 'system' ? systemReduced() : s.reducedMotion === 'on');
export const useReducedMotion = () => reducedMotion(useSettings());

const systemDark = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
/** The effective colour theme. */
export const resolvedTheme = (s: Settings = current): 'light' | 'dark' => (s.theme === 'system' ? (systemDark() ? 'dark' : 'light') : s.theme);

/** Puts the theme on <html data-theme> (and the browser chrome colour); follows the OS when set to "system". */
export function applyTheme(s: Settings = current) {
  if (typeof document === 'undefined') return;
  const t = resolvedTheme(s);
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0e0e0e' : '#f3f2ee');
}
if (typeof window !== 'undefined') {
  applyTheme();
  subscribeSettings(() => applyTheme());
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
}
