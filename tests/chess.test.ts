import { describe, expect, it } from 'vitest';
import {
  START_FEN, parseFen, toFen, perft, legalMoves, makeMove, parseSquare, moveToSan, inCheck,
  insufficientMaterial, canColorMate, isCheckmate, hasLegalMove, type Color, type Move,
} from '../src/rules/chess';

const find = (fen: string, from: string, to: string, promo?: string): { m: Move; turn: Color; pos: ReturnType<typeof parseFen>['pos'] } => {
  const { pos, turn } = parseFen(fen);
  const m = legalMoves(pos, turn).find((x) => x.from === parseSquare(from) && x.to === parseSquare(to) && (!promo || x.promotion === promo));
  if (!m) throw new Error(`no move ${from}${to}`);
  return { m, turn, pos };
};

describe('FEN', () => {
  it('round-trips the start position', () => {
    const { pos, turn } = parseFen(START_FEN);
    expect(toFen(pos, turn)).toBe(START_FEN);
  });
});

describe('perft (move generation correctness)', () => {
  it('start position depth 1-4', () => {
    const { pos, turn } = parseFen(START_FEN);
    expect(perft(pos, turn, 1)).toBe(20);
    expect(perft(pos, turn, 2)).toBe(400);
    expect(perft(pos, turn, 3)).toBe(8902);
    expect(perft(pos, turn, 4)).toBe(197281);
  });
  it('kiwipete depth 1-3 (castling, ep, promotions, pins)', () => {
    const { pos, turn } = parseFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    expect(perft(pos, turn, 1)).toBe(48);
    expect(perft(pos, turn, 2)).toBe(2039);
    expect(perft(pos, turn, 3)).toBe(97862);
  });
  it('position 3 depth 1-4 (ep discovered checks)', () => {
    const { pos, turn } = parseFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
    expect(perft(pos, turn, 1)).toBe(14);
    expect(perft(pos, turn, 2)).toBe(191);
    expect(perft(pos, turn, 3)).toBe(2812);
    expect(perft(pos, turn, 4)).toBe(43238);
  });
  it('position 4 depth 1-3 (promotions, castling through check)', () => {
    const { pos, turn } = parseFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
    expect(perft(pos, turn, 1)).toBe(6);
    expect(perft(pos, turn, 2)).toBe(264);
    expect(perft(pos, turn, 3)).toBe(9467);
  });
  it('position 5 depth 1-3', () => {
    const { pos, turn } = parseFen('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
    expect(perft(pos, turn, 1)).toBe(44);
    expect(perft(pos, turn, 2)).toBe(1486);
    expect(perft(pos, turn, 3)).toBe(62379);
  });
});

describe('special moves', () => {
  it('castles kingside and moves the rook', () => {
    const { m, pos, turn } = find('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1', 'g1');
    const next = makeMove(pos, m);
    expect(next.board[parseSquare('g1')]).toBe('K');
    expect(next.board[parseSquare('f1')]).toBe('R');
    expect(next.board[parseSquare('h1')]).toBe('');
    expect(next.castling & 3).toBe(0);
    expect(moveToSan(pos, m, turn)).toBe('O-O');
  });
  it('cannot castle out of, through, or into check', () => {
    const through = parseFen('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1');
    expect(legalMoves(through.pos, 'w').some((m) => m.to === parseSquare('g1') && m.piece === 'K')).toBe(false);
    expect(legalMoves(through.pos, 'w').some((m) => m.to === parseSquare('c1') && m.piece === 'K')).toBe(true);
    const outOf = parseFen('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(legalMoves(outOf.pos, 'w').some((m) => m.piece === 'K' && Math.abs(m.to - m.from) === 2)).toBe(false);
  });
  it('captures en passant', () => {
    const { m, pos, turn } = find('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'e5', 'd6');
    const next = makeMove(pos, m);
    expect(next.board[parseSquare('d5')]).toBe('');
    expect(next.board[parseSquare('d6')]).toBe('P');
    expect(moveToSan(pos, m, turn)).toBe('exd6');
  });
  it('promotes to any piece', () => {
    const { pos } = parseFen('8/4P3/8/8/8/8/k7/4K3 w - - 0 1');
    const promos = legalMoves(pos, 'w').filter((m) => m.promotion).map((m) => m.promotion).sort();
    expect(promos).toEqual(['b', 'n', 'q', 'r']);
    const { m } = find('8/4P3/8/8/8/8/k7/4K3 w - - 0 1', 'e7', 'e8', 'n');
    expect(makeMove(pos, m).board[parseSquare('e8')]).toBe('N');
  });
  it('detects check, mate and SAN suffixes', () => {
    const { m, pos, turn } = find('rnbqkbnr/ppppp2p/5p2/6p1/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3', 'd1', 'h5');
    expect(moveToSan(pos, m, turn)).toBe('Qh5#');
    const after = makeMove(pos, m);
    expect(inCheck(after, 'b')).toBe(true);
    expect(isCheckmate(after, 'b')).toBe(true);
  });
  it('disambiguates SAN', () => {
    const { m, pos, turn } = find('4k3/8/8/8/8/8/8/N1N1K3 w - - 0 1', 'a1', 'b3');
    expect(moveToSan(pos, m, turn)).toBe('Nab3');
  });
  it('detects stalemate (no legal moves, not in check)', () => {
    const { pos } = parseFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(inCheck(pos, 'b')).toBe(false);
    expect(hasLegalMove(pos, 'b')).toBe(false);
  });
});

describe('material', () => {
  it('insufficient material', () => {
    expect(insufficientMaterial(parseFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1').pos.board)).toBe(true);
    expect(insufficientMaterial(parseFen('4k3/8/8/8/8/8/8/4KN2 w - - 0 1').pos.board)).toBe(true);
    expect(insufficientMaterial(parseFen('4kb2/8/8/8/8/8/8/2B1K3 w - - 0 1').pos.board)).toBe(true); // same-colour bishops
    expect(insufficientMaterial(parseFen('4k1b1/8/8/8/8/8/8/2B1K3 w - - 0 1').pos.board)).toBe(false);
    expect(insufficientMaterial(parseFen('4k3/8/8/8/8/8/8/3NKN2 w - - 0 1').pos.board)).toBe(false);
    expect(insufficientMaterial(parseFen('4k3/8/8/8/8/8/P7/4K3 w - - 0 1').pos.board)).toBe(false);
  });
  it('canColorMate', () => {
    const b = parseFen('4k3/8/8/8/8/8/8/3NK3 w - - 0 1').pos.board;
    expect(canColorMate(b, 'w')).toBe(false);
    expect(canColorMate(b, 'b')).toBe(false);
    expect(canColorMate(parseFen('4k3/8/8/8/8/8/8/2BNK3 w - - 0 1').pos.board, 'w')).toBe(true);
    expect(canColorMate(parseFen('4k3/8/8/8/8/8/8/R3K3 w - - 0 1').pos.board, 'w')).toBe(true);
  });
});
