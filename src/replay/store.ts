/**
 * Recent games on this device: a small index in localStorage (for lists) and the
 * full records + cached reviews in IndexedDB (falls back to localStorage).
 */
import { useSyncExternalStore } from 'react';
import { summarize, type GameRecord, type GameSummary } from './record';
import type { GameReview } from '../engine/review';
import type { GameState } from '../rules/game';

const INDEX_KEY = 'cu.games';
const MAX_GAMES = 40;
const DB_NAME = 'chess-uno';
const STORES = ['records', 'reviews'] as const;
type StoreName = (typeof STORES)[number];

// ---------------------------------------------------------------- IndexedDB (tiny promise wrapper)

let dbPromise: Promise<IDBDatabase | null> | null = null;
function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) {
    const v = localStorage.getItem(`cu.${store}.${key}`);
    return v ? (JSON.parse(v) as T) : undefined;
  }
  return new Promise((resolve) => {
    const req = db.transaction(store).objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => resolve(undefined);
  });
}

async function idbPut(store: StoreName, key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (!db) {
    try { localStorage.setItem(`cu.${store}.${key}`, JSON.stringify(value)); } catch { /* storage full */ }
    return;
  }
  return new Promise((resolve) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function idbDelete(store: StoreName, key: string): Promise<void> {
  const db = await openDb();
  if (!db) { localStorage.removeItem(`cu.${store}.${key}`); return; }
  return new Promise((resolve) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ---------------------------------------------------------------- index

const listeners = new Set<() => void>();
let cache: GameSummary[] | null = null;

export function listGames(): GameSummary[] {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]');
    cache = Array.isArray(raw) ? (raw as GameSummary[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function writeIndex(list: GameSummary[]) {
  cache = list;
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export const useRecentGames = () => useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, listGames, listGames);

/** Save a finished game (newest first; the oldest beyond 40 are dropped). */
export async function saveGame(rec: GameRecord, final?: GameState): Promise<GameSummary> {
  const summary = summarize(rec, final);
  await idbPut('records', rec.id, rec);
  const list = [summary, ...listGames().filter((g) => g.id !== rec.id)];
  const dropped = list.slice(MAX_GAMES);
  writeIndex(list.slice(0, MAX_GAMES));
  for (const g of dropped) { void idbDelete('records', g.id); void idbDelete('reviews', g.id); }
  return summary;
}

export const loadGame = (id: string) => idbGet<GameRecord>('records', id);
export const loadReview = (id: string) => idbGet<GameReview>('reviews', id);
export const saveReview = (id: string, review: GameReview) => idbPut('reviews', id, review);

export async function deleteGame(id: string) {
  writeIndex(listGames().filter((g) => g.id !== id));
  await idbDelete('records', id);
  await idbDelete('reviews', id);
}
