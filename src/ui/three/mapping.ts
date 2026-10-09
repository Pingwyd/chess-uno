/**
 * Pure helpers for the 3D board: square <-> world coordinates, camera angles,
 * piece facing, and stable piece identities across positions (so pieces can
 * glide instead of popping). No three.js imports, so this is unit-tested.
 */
import { colorOfPiece, fileOf, rankOf, type Color } from '../../rules/chess';

/** World units per square. The board spans x,z in [-4, 4]. */
export const SQUARE = 1;

/** Centre of a square on the board plane. White's back rank is at +z (nearest the default camera). */
export function squareToWorld(sq: number): [number, number] {
  return [(fileOf(sq) - 3.5) * SQUARE, (3.5 - rankOf(sq)) * SQUARE];
}

/** Inverse of squareToWorld; returns -1 off the board. */
export function worldToSquare(x: number, z: number): number {
  const file = Math.floor(x / SQUARE + 4);
  const rank = Math.floor(4 - z / SQUARE);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return -1;
  return rank * 8 + file;
}

/** Camera azimuth (radians around +y, 0 = looking from +z) that puts `color` nearest the viewer. */
export const homeAzimuth = (color: Color) => (color === 'w' ? 0 : Math.PI);

/**
 * Next cumulative azimuth when the home side changes, always spinning the same way
 * (like the 2D board's Reverse spin) and never more than one half-turn.
 */
export function spinTowards(current: number, target: number): number {
  const TAU = Math.PI * 2;
  const delta = (((target - current) % TAU) + TAU) % TAU; // [0, 2π)
  if (delta < 1e-6) return current;
  return delta <= Math.PI + 1e-6 ? current + delta : current + delta - TAU;
}

/**
 * Y-rotation for a piece so its face looks at the player it should charm:
 * everyone faces the bottom player, except the top player's own pieces in
 * Pass & Play (they face their owner across the table).
 */
export function pieceYaw(piece: string, bottomColor: Color, faceTop: boolean): number {
  const facingBottom = !faceTop || colorOfPiece(piece) === bottomColor;
  const towardWhite = 0; // +z
  const towardBlack = Math.PI;
  const viewer = facingBottom ? bottomColor : (bottomColor === 'w' ? 'b' : 'w');
  return viewer === 'w' ? towardWhite : towardBlack;
}

export interface CameraPreset {
  /** Polar angle from straight up (radians). */
  polar: number;
  distance: number;
  minPolar: number;
  maxPolar: number;
  minDistance: number;
  maxDistance: number;
}

/** Camera framing per mode and viewport shape (portrait screens need to back off). */
export function cameraPreset(mode: 'pass' | 'play', aspect: number): CameraPreset {
  const portrait = aspect < 0.95;
  if (mode === 'pass') {
    // Nearly top-down so both players across the table can read the board.
    return { polar: 0.34, distance: portrait ? 17.5 : 16.5, minPolar: 0, maxPolar: 0.7, minDistance: 10, maxDistance: 24 };
  }
  return {
    polar: portrait ? 0.6 : 0.68,
    distance: portrait ? 17.8 : 16.2,
    minPolar: 0.12,
    maxPolar: 1.2,
    minDistance: 8,
    maxDistance: 24,
  };
}

export interface TrackedPiece {
  id: number;
  piece: string;
  sq: number;
}

export interface TrackResult {
  pieces: TrackedPiece[];
  /** Pieces that left the board since the previous position (captures). */
  captured: TrackedPiece[];
  nextId: number;
}

const dist = (a: number, b: number) => Math.hypot(fileOf(a) - fileOf(b), rankOf(a) - rankOf(b));

/**
 * Give every piece a stable id across positions so the renderer can animate it.
 * Unchanged squares keep their id; moved pieces are matched to vacated squares
 * (using the last move as a hint, then same piece by distance, then same colour,
 * which covers promotion); whatever vanished was captured.
 */
export function trackPieces(prev: TrackedPiece[], board: string[], nextId: number, hint?: { from: number; to: number } | null): TrackResult {
  const prevAt = new Map(prev.map((p) => [p.sq, p]));
  const pieces: TrackedPiece[] = [];
  const vanished: TrackedPiece[] = [];
  const appeared: number[] = [];
  for (const p of prev) if (board[p.sq] !== p.piece) vanished.push(p);
  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece) continue;
    const old = prevAt.get(sq);
    if (old && old.piece === piece) pieces.push(old);
    else appeared.push(sq);
  }
  const take = (pred: (v: TrackedPiece) => boolean, sq: number): TrackedPiece | null => {
    let best = -1;
    for (let i = 0; i < vanished.length; i++) {
      if (!pred(vanished[i])) continue;
      if (best < 0 || dist(vanished[i].sq, sq) < dist(vanished[best].sq, sq)) best = i;
    }
    return best < 0 ? null : vanished.splice(best, 1)[0];
  };
  const place = (sq: number, from: TrackedPiece | null) => {
    pieces.push({ id: from ? from.id : nextId++, piece: board[sq], sq });
  };
  let rest = appeared;
  if (hint) {
    const i = rest.indexOf(hint.to);
    const src = vanished.find((v) => v.sq === hint.from);
    if (i >= 0 && src && colorOfPiece(src.piece) === colorOfPiece(board[hint.to])) {
      vanished.splice(vanished.indexOf(src), 1);
      place(hint.to, src);
      rest = rest.filter((s) => s !== hint.to);
    }
  }
  const pending: number[] = [];
  for (const sq of rest) {
    const m = take((v) => v.piece === board[sq], sq);
    if (m) place(sq, m);
    else pending.push(sq);
  }
  for (const sq of pending) place(sq, take((v) => colorOfPiece(v.piece) === colorOfPiece(board[sq]) && v.piece.toLowerCase() === 'p', sq));
  pieces.sort((a, b) => a.id - b.id);
  return { pieces, captured: vanished, nextId };
}

/** Detect WebGL support once (false in very old browsers, blocked GPUs, or tests). */
export function webglAvailable(): boolean {
  try {
    if (typeof document === 'undefined') return false;
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
