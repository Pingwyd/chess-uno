/**
 * Device settings (localStorage). Board mode, piece set and the master sound switch keep their
 * original keys (cu.board, cu.pieceSet, cu.sound) and live in App state; everything else is here.
 */
import { useSyncExternalStore } from 'react';

export type MotionPref = 'system' | 'on' | 'off';

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
}

export const DEFAULT_SETTINGS: Settings = {
  hints: true, confirmMoves: false, sfxVolume: 0.8, musicVolume: 0, vibration: true,
  notify: { turn: true, friends: true, challenges: true, streak: true },
  reducedMotion: 'system', avatar: null,
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
