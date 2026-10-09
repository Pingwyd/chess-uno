import { describe, expect, it } from 'vitest';
import { parseFen, parseSquare as sq } from '../src/rules/chess';
import { cameraPreset, homeAzimuth, pieceYaw, spinTowards, squareToWorld, trackPieces, worldToSquare, type TrackedPiece } from '../src/ui/three/mapping';

const board = (fen: string) => parseFen(fen.includes(' ') ? fen : `${fen} w - - 0 1`).pos.board;
const initial = (b: string[]) => trackPieces([], b, 1);
const at = (ps: TrackedPiece[], name: string) => ps.find((p) => p.sq === sq(name));

describe('3D board mapping', () => {
  it('maps squares to world coordinates and back', () => {
    expect(squareToWorld(sq('a1'))).toEqual([-3.5, 3.5]);
    expect(squareToWorld(sq('h8'))).toEqual([3.5, -3.5]);
    expect(squareToWorld(sq('e4'))).toEqual([0.5, 0.5]);
    for (let s = 0; s < 64; s++) {
      const [x, z] = squareToWorld(s);
      expect(worldToSquare(x, z)).toBe(s);
      expect(worldToSquare(x + 0.49, z - 0.49)).toBe(s);
    }
    expect(worldToSquare(4.2, 0)).toBe(-1);
    expect(worldToSquare(0, -4.01)).toBe(-1);
  });

  it('home azimuth and Reverse spin always turn the same way by a half turn', () => {
    expect(homeAzimuth('w')).toBe(0);
    expect(homeAzimuth('b')).toBeCloseTo(Math.PI);
    let a = homeAzimuth('w');
    a = spinTowards(a, homeAzimuth('b'));
    expect(a).toBeCloseTo(Math.PI);
    a = spinTowards(a, homeAzimuth('w'));
    expect(a).toBeCloseTo(2 * Math.PI); // keeps going, does not unwind
    expect(spinTowards(a, homeAzimuth('w'))).toBe(a);
    expect(spinTowards(0.2, 0)).toBeCloseTo(0); // small corrections go the short way
  });

  it('pieces face the bottom player, except the top player\'s own pieces in Pass & Play', () => {
    expect(pieceYaw('P', 'w', false)).toBe(0);
    expect(pieceYaw('p', 'w', false)).toBe(0);
    expect(pieceYaw('p', 'b', false)).toBeCloseTo(Math.PI);
    expect(pieceYaw('p', 'w', true)).toBeCloseTo(Math.PI);
    expect(pieceYaw('P', 'w', true)).toBe(0);
  });

  it('camera presets: Pass & Play is near top-down; portrait backs off', () => {
    const pass = cameraPreset('pass', 0.5);
    const play = cameraPreset('play', 1.6);
    expect(pass.polar).toBeLessThan(0.4);
    expect(play.polar).toBeGreaterThan(0.5);
    expect(cameraPreset('play', 0.5).distance).toBeGreaterThan(play.distance);
    for (const p of [pass, play]) {
      expect(p.polar).toBeGreaterThanOrEqual(p.minPolar);
      expect(p.polar).toBeLessThanOrEqual(p.maxPolar);
      expect(p.distance).toBeGreaterThanOrEqual(p.minDistance);
      expect(p.distance).toBeLessThanOrEqual(p.maxDistance);
    }
  });
});

describe('trackPieces', () => {
  const start = board('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');

  it('assigns ids to every piece on first sight', () => {
    const r = initial(start);
    expect(r.pieces).toHaveLength(32);
    expect(new Set(r.pieces.map((p) => p.id)).size).toBe(32);
    expect(r.captured).toEqual([]);
  });

  it('keeps a moved piece\'s id', () => {
    const a = initial(start);
    const e2 = at(a.pieces, 'e2')!;
    const b = trackPieces(a.pieces, board('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR'), a.nextId, { from: sq('e2'), to: sq('e4') });
    expect(at(b.pieces, 'e4')!.id).toBe(e2.id);
    expect(b.pieces).toHaveLength(32);
    expect(b.nextId).toBe(a.nextId);
  });

  it('reports captures and keeps the capturer', () => {
    const a = initial(board('4k3/8/8/3p4/4P3/8/8/4K3'));
    const pawn = at(a.pieces, 'e4')!;
    const victim = at(a.pieces, 'd5')!;
    const b = trackPieces(a.pieces, board('4k3/8/8/3P4/8/8/8/4K3'), a.nextId, { from: sq('e4'), to: sq('d5') });
    expect(at(b.pieces, 'd5')!.id).toBe(pawn.id);
    expect(b.captured.map((c) => c.id)).toEqual([victim.id]);
  });

  it('handles en passant (victim on another square) and castling (two pieces move)', () => {
    const a = initial(board('4k3/8/8/3pP3/8/8/8/4K2R'));
    const ep = trackPieces(a.pieces, board('4k3/8/3P4/8/8/8/8/4K2R'), a.nextId, { from: sq('e5'), to: sq('d6') });
    expect(at(ep.pieces, 'd6')!.id).toBe(at(a.pieces, 'e5')!.id);
    expect(ep.captured.map((c) => c.sq)).toEqual([sq('d5')]);
    const castle = trackPieces(ep.pieces, board('4k3/8/3P4/8/8/8/8/5RK1'), ep.nextId, { from: sq('e1'), to: sq('g1') });
    expect(at(castle.pieces, 'g1')!.id).toBe(at(a.pieces, 'e1')!.id);
    expect(at(castle.pieces, 'f1')!.id).toBe(at(a.pieces, 'h1')!.id);
    expect(castle.captured).toEqual([]);
  });

  it('promotion keeps the pawn\'s id (with or without a hint)', () => {
    const a = initial(board('8/4P3/8/8/8/8/8/k6K'));
    const pawn = at(a.pieces, 'e7')!;
    const promo = board('4Q3/8/8/8/8/8/8/k6K');
    expect(at(trackPieces(a.pieces, promo, a.nextId, { from: sq('e7'), to: sq('e8') }).pieces, 'e8')!.id).toBe(pawn.id);
    expect(at(trackPieces(a.pieces, promo, a.nextId).pieces, 'e8')!.id).toBe(pawn.id);
  });

  it('several moves at once (a whole multi-move turn) still glide the right pieces', () => {
    const a = initial(start);
    const g1 = at(a.pieces, 'g1')!.id;
    const d2 = at(a.pieces, 'd2')!.id;
    const b = trackPieces(a.pieces, board('rnbqkbnr/pppppppp/8/8/3P4/5N2/PPP1PPPP/RNBQKB1R'), a.nextId);
    expect(at(b.pieces, 'f3')!.id).toBe(g1);
    expect(at(b.pieces, 'd4')!.id).toBe(d2);
    expect(b.captured).toEqual([]);
  });

  it('a brand-new position (new game) gets fresh ids for unmatched pieces', () => {
    const a = initial(board('4k3/8/8/8/8/8/8/4K3'));
    const b = trackPieces(a.pieces, start, a.nextId);
    expect(b.pieces).toHaveLength(32);
    expect(new Set(b.pieces.map((p) => p.id)).size).toBe(32);
  });
});
