/**
 * Browser persistence for learning progress: localStorage always (works offline), plus a
 * best-effort sync with the game server for signed-in (non-guest) accounts.
 */
import { useSyncExternalStore } from 'react';
import { emptyProgress, mergeProgress, sanitize, type Progress } from './progress';
import { SERVER_URL, storedToken } from '../net/online';

const KEY = 'cu.learn';
let current: Progress = load();
const listeners = new Set<() => void>();

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export const getProgress = () => current;

export function setProgress(p: Progress, sync = true) {
  current = p;
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full / private mode */ }
  listeners.forEach((l) => l());
  if (sync) void pushProgress();
}

export function useProgress(): Progress {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getProgress, getProgress);
}

export type SyncState = 'local' | 'synced' | 'offline';
let syncState: SyncState = 'local';
const syncListeners = new Set<() => void>();
const setSync = (s: SyncState) => { syncState = s; syncListeners.forEach((l) => l()); };
export const useSyncState = () =>
  useSyncExternalStore((l) => { syncListeners.add(l); return () => syncListeners.delete(l); }, () => syncState, () => syncState);

async function api(method: 'GET' | 'POST', body?: unknown): Promise<Progress | null> {
  const token = storedToken();
  if (!token) return null;
  const res = await fetch(`${SERVER_URL}/api/learn`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify({ progress: body }),
  });
  if (res.status === 401 || res.status === 403) return null; // guests keep progress on this device
  if (!res.ok) throw new Error(String(res.status));
  const json = (await res.json()) as { progress?: unknown };
  return sanitize(json.progress);
}

/** Pull the server copy (signed-in accounts only) and merge it in. */
export async function pullProgress(): Promise<void> {
  try {
    const remote = await api('GET');
    if (!remote) return setSync('local');
    const merged = mergeProgress(current, remote);
    setProgress(merged, false);
    await api('POST', merged);
    setSync('synced');
  } catch {
    setSync('offline');
  }
}

let pushing: Promise<void> | null = null;
let again = false;
async function pushProgress() {
  if (!storedToken()) return;
  if (pushing) { again = true; return; }
  pushing = (async () => {
    try {
      const saved = await api('POST', current);
      if (saved) { setProgress(mergeProgress(current, saved), false); setSync('synced'); } else setSync('local');
    } catch {
      setSync('offline');
    }
  })();
  await pushing;
  pushing = null;
  if (again) { again = false; void pushProgress(); }
}
