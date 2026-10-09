/**
 * Pure, dependency-free chess core used by the Chess Uno rules layer, the bot,
 * and (later) the authoritative game server.
 *
 * Board: 64-element array, index = rank * 8 + file (a1 = 0, h1 = 7, a8 = 56).
 * Pieces are FEN letters: uppercase = White, lowercase = Black, '' = empty.
 *
 * Unlike normal chess, the side to move is passed explicitly to every function,
 * because in Chess Uno the same colour can move several times in a row.
 */

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

export const FLAG_CAPTURE = 1;
export const FLAG_EP = 2;
export const FLAG_DOUBLE = 4;
export const FLAG_CASTLE_K = 8;
export const FLAG_CASTLE_Q = 16;
export const FLAG_PROMO = 32;

export interface Position {
  board: string[];
  /** Bitmask of CASTLE_* rights. */
  castling: number;
  /** En-passant target square (the square passed over), or -1. */
  ep: number;
}

export interface Move {
  from: number;
  to: number;
  piece: string;
  captured: string;
  promotion?: PromotionPiece;
  flags: number;
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
export const colorOfPiece = (p: string): Color => (p === p.toUpperCase() ? 'w' : 'b');
export const typeOf = (p: string): PieceType => p.toLowerCase() as PieceType;
export const fileOf = (sq: number) => sq & 7;
export const rankOf = (sq: number) => sq >> 3;

export function squareName(sq: number): string {
  return 'abcdefgh'[fileOf(sq)] + (rankOf(sq) + 1);
}

export function parseSquare(name: string): number {
  const f = name.charCodeAt(0) - 97;
  const r = name.charCodeAt(1) - 49;
  if (f < 0 || f > 7 || r < 0 || r > 7 || name.length !== 2) throw new Error(`Bad square: ${name}`);
  return r * 8 + f;
}

export function parseFen(fen: string): { pos: Position; turn: Color; halfmove: number; fullmove: number } {
  const [placement, turn = 'w', castling = '-', ep = '-', half = '0', full = '1'] = fen.trim().split(/\s+/);
  const board: string[] = new Array(64).fill('');
  const rows = placement.split('/');
  if (rows.length !== 8) throw new Error('Bad FEN placement');
  rows.forEach((row, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) file += Number(ch);
      else board[rank * 8 + file++] = ch;
    }
    if (file !== 8) throw new Error('Bad FEN row');
  });
  let c = 0;
  if (castling.includes('K')) c |= CASTLE_WK;
  if (castling.includes('Q')) c |= CASTLE_WQ;
  if (castling.includes('k')) c |= CASTLE_BK;
  if (castling.includes('q')) c |= CASTLE_BQ;
  return {
    pos: { board, castling: c, ep: ep === '-' ? -1 : parseSquare(ep) },
    turn: turn === 'b' ? 'b' : 'w',
    halfmove: Number(half) || 0,
    fullmove: Number(full) || 1,
  };
}

export function placementFen(board: string[]): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const p = board[rank * 8 + file];
      if (!p) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += p;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return rows.join('/');
}

export function castlingFen(c: number): string {
  const s = (c & CASTLE_WK ? 'K' : '') + (c & CASTLE_WQ ? 'Q' : '') + (c & CASTLE_BK ? 'k' : '') + (c & CASTLE_BQ ? 'q' : '');
  return s || '-';
}

export function toFen(pos: Position, turn: Color, halfmove = 0, fullmove = 1): string {
  return `${placementFen(pos.board)} ${turn} ${castlingFen(pos.castling)} ${pos.ep >= 0 ? squareName(pos.ep) : '-'} ${halfmove} ${fullmove}`;
}

export function clonePosition(pos: Position): Position {
  return { board: pos.board.slice(), castling: pos.castling, ep: pos.ep };
}

const KNIGHT_D: [number, number][] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_D: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_D: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_D: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

// Precomputed jump tables for speed.
const KNIGHT_TARGETS: number[][] = [];
const KING_TARGETS: number[][] = [];
for (let sq = 0; sq < 64; sq++) {
  const f = fileOf(sq), r = rankOf(sq);
  KNIGHT_TARGETS.push(KNIGHT_D.filter(([df, dr]) => f + df >= 0 && f + df < 8 && r + dr >= 0 && r + dr < 8).map(([df, dr]) => sq + dr * 8 + df));
  KING_TARGETS.push(KING_D.filter(([df, dr]) => f + df >= 0 && f + df < 8 && r + dr >= 0 && r + dr < 8).map(([df, dr]) => sq + dr * 8 + df));
}

const isColor = (p: string, c: Color) => p !== '' && (c === 'w' ? p < 'a' : p >= 'a');

/** Is `sq` attacked by any piece of colour `by`? */
export function isAttacked(board: string[], sq: number, by: Color): boolean {
  const f = fileOf(sq), r = rankOf(sq);
  // Pawns
  const pr = by === 'w' ? r - 1 : r + 1;
  const pawn = by === 'w' ? 'P' : 'p';
  if (pr >= 0 && pr < 8) {
    if (f > 0 && board[pr * 8 + f - 1] === pawn) return true;
    if (f < 7 && board[pr * 8 + f + 1] === pawn) return true;
  }
  const knight = by === 'w' ? 'N' : 'n';
  for (const t of KNIGHT_TARGETS[sq]) if (board[t] === knight) return true;
  const king = by === 'w' ? 'K' : 'k';
  for (const t of KING_TARGETS[sq]) if (board[t] === king) return true;
  const rook = by === 'w' ? 'R' : 'r', bishop = by === 'w' ? 'B' : 'b', queen = by === 'w' ? 'Q' : 'q';
  for (const [df, dr] of ROOK_D) {
    let ff = f + df, rr = r + dr;
    while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
      const p = board[rr * 8 + ff];
      if (p) {
        if (p === rook || p === queen) return true;
        break;
      }
      ff += df; rr += dr;
    }
  }
  for (const [df, dr] of BISHOP_D) {
    let ff = f + df, rr = r + dr;
    while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
      const p = board[rr * 8 + ff];
      if (p) {
        if (p === bishop || p === queen) return true;
        break;
      }
      ff += df; rr += dr;
    }
  }
  return false;
}

export function kingSquare(board: string[], color: Color): number {
  const k = color === 'w' ? 'K' : 'k';
  for (let i = 0; i < 64; i++) if (board[i] === k) return i;
  return -1;
}

export function inCheck(pos: Position, color: Color): boolean {
  const k = kingSquare(pos.board, color);
  return k >= 0 && isAttacked(pos.board, k, other(color));
}

function pushPawnMove(moves: Move[], from: number, to: number, piece: string, captured: string, flags: number, color: Color) {
  const lastRank = color === 'w' ? 7 : 0;
  if (rankOf(to) === lastRank) {
    for (const promo of ['q', 'r', 'b', 'n'] as PromotionPiece[]) {
      moves.push({ from, to, piece, captured, promotion: promo, flags: flags | FLAG_PROMO });
    }
  } else moves.push({ from, to, piece, captured, flags });
}

/** Pseudo-legal moves (may leave own king in check). */
export function pseudoMoves(pos: Position, color: Color): Move[] {
  const { board } = pos;
  const moves: Move[] = [];
  const enemy = other(color);
  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!isColor(piece, color)) continue;
    const t = typeOf(piece);
    const f = fileOf(sq), r = rankOf(sq);
    if (t === 'p') {
      const dir = color === 'w' ? 1 : -1;
      const startRank = color === 'w' ? 1 : 6;
      const r1 = r + dir;
      if (r1 >= 0 && r1 < 8) {
        const one = r1 * 8 + f;
        if (!board[one]) {
          pushPawnMove(moves, sq, one, piece, '', 0, color);
          const two = (r + 2 * dir) * 8 + f;
          if (r === startRank && !board[two]) moves.push({ from: sq, to: two, piece, captured: '', flags: FLAG_DOUBLE });
        }
        for (const df of [-1, 1]) {
          const ff = f + df;
          if (ff < 0 || ff > 7) continue;
          const to = r1 * 8 + ff;
          if (isColor(board[to], enemy)) pushPawnMove(moves, sq, to, piece, board[to], FLAG_CAPTURE, color);
          else if (to === pos.ep && !board[to]) {
            moves.push({ from: sq, to, piece, captured: color === 'w' ? 'p' : 'P', flags: FLAG_CAPTURE | FLAG_EP });
          }
        }
      }
    } else if (t === 'n' || t === 'k') {
      for (const to of (t === 'n' ? KNIGHT_TARGETS : KING_TARGETS)[sq]) {
        const target = board[to];
        if (!target) moves.push({ from: sq, to, piece, captured: '', flags: 0 });
        else if (isColor(target, enemy)) moves.push({ from: sq, to, piece, captured: target, flags: FLAG_CAPTURE });
      }
      if (t === 'k') addCastling(pos, color, sq, moves);
    } else {
      const dirs = t === 'r' ? ROOK_D : t === 'b' ? BISHOP_D : [...ROOK_D, ...BISHOP_D];
      for (const [df, dr] of dirs) {
        let ff = f + df, rr = r + dr;
        while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
          const to = rr * 8 + ff;
          const target = board[to];
          if (!target) moves.push({ from: sq, to, piece, captured: '', flags: 0 });
          else {
            if (isColor(target, enemy)) moves.push({ from: sq, to, piece, captured: target, flags: FLAG_CAPTURE });
            break;
          }
          ff += df; rr += dr;
        }
      }
    }
  }
  return moves;
}

function addCastling(pos: Position, color: Color, kingSq: number, moves: Move[]) {
  const { board, castling } = pos;
  const home = color === 'w' ? 4 : 60;
  if (kingSq !== home) return;
  const enemy = other(color);
  const kRight = color === 'w' ? CASTLE_WK : CASTLE_BK;
  const qRight = color === 'w' ? CASTLE_WQ : CASTLE_BQ;
  const rook = color === 'w' ? 'R' : 'r';
  const king = board[home];
  if (!(castling & (kRight | qRight))) return;
  if (isAttacked(board, home, enemy)) return;
  if (castling & kRight && board[home + 3] === rook && !board[home + 1] && !board[home + 2]
      && !isAttacked(board, home + 1, enemy) && !isAttacked(board, home + 2, enemy)) {
    moves.push({ from: home, to: home + 2, piece: king, captured: '', flags: FLAG_CASTLE_K });
  }
  if (castling & qRight && board[home - 4] === rook && !board[home - 1] && !board[home - 2] && !board[home - 3]
      && !isAttacked(board, home - 1, enemy) && !isAttacked(board, home - 2, enemy)) {
    moves.push({ from: home, to: home - 2, piece: king, captured: '', flags: FLAG_CASTLE_Q });
  }
}

const CASTLE_MASK: number[] = new Array(64).fill(15);
CASTLE_MASK[0] = 15 & ~CASTLE_WQ;
CASTLE_MASK[7] = 15 & ~CASTLE_WK;
CASTLE_MASK[4] = 15 & ~(CASTLE_WK | CASTLE_WQ);
CASTLE_MASK[56] = 15 & ~CASTLE_BQ;
CASTLE_MASK[63] = 15 & ~CASTLE_BK;
CASTLE_MASK[60] = 15 & ~(CASTLE_BK | CASTLE_BQ);

/**
 * Apply a move and return a new position. The returned `ep` follows standard
 * chess (set after a double push); the Chess Uno layer narrows it further.
 */
export function makeMove(pos: Position, m: Move): Position {
  const board = pos.board.slice();
  board[m.from] = '';
  if (m.flags & FLAG_EP) {
    const capSq = colorOfPiece(m.piece) === 'w' ? m.to - 8 : m.to + 8;
    board[capSq] = '';
  }
  let placed = m.piece;
  if (m.promotion) placed = colorOfPiece(m.piece) === 'w' ? m.promotion.toUpperCase() : m.promotion;
  board[m.to] = placed;
  if (m.flags & FLAG_CASTLE_K) {
    board[m.from + 1] = board[m.from + 3];
    board[m.from + 3] = '';
  } else if (m.flags & FLAG_CASTLE_Q) {
    board[m.from - 1] = board[m.from - 4];
    board[m.from - 4] = '';
  }
  const castling = pos.castling & CASTLE_MASK[m.from] & CASTLE_MASK[m.to];
  const ep = m.flags & FLAG_DOUBLE ? (m.from + m.to) >> 1 : -1;
  return { board, castling, ep };
}

export function legalMoves(pos: Position, color: Color): Move[] {
  const out: Move[] = [];
  const enemy = other(color);
  for (const m of pseudoMoves(pos, color)) {
    const next = makeMove(pos, m);
    const k = typeOf(m.piece) === 'k' ? m.to : kingSquare(next.board, color);
    if (k < 0 || !isAttacked(next.board, k, enemy)) out.push(m);
  }
  return out;
}

export function hasLegalMove(pos: Position, color: Color): boolean {
  const enemy = other(color);
  for (const m of pseudoMoves(pos, color)) {
    const next = makeMove(pos, m);
    const k = typeOf(m.piece) === 'k' ? m.to : kingSquare(next.board, color);
    if (k < 0 || !isAttacked(next.board, k, enemy)) return true;
  }
  return false;
}

export function isCheckmate(pos: Position, color: Color): boolean {
  return inCheck(pos, color) && !hasLegalMove(pos, color);
}

/**
 * True when neither side can possibly deliver mate: K v K, K+minor v K,
 * and K+B v K+B with all bishops on the same square colour.
 */
export function insufficientMaterial(board: string[]): boolean {
  const minors: { type: string; sqColor: number }[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p) continue;
    const t = typeOf(p);
    if (t === 'k') continue;
    if (t === 'p' || t === 'r' || t === 'q') return false;
    minors.push({ type: t, sqColor: (fileOf(sq) + rankOf(sq)) & 1 });
  }
  if (minors.length <= 1) return true;
  return minors.every((m) => m.type === 'b') && minors.every((m) => m.sqColor === minors[0].sqColor);
}

/** Can `color` alone possibly checkmate (used for the flag-fall exception)? */
export function canColorMate(board: string[], color: Color): boolean {
  let minors = 0, bishopsLight = 0, bishopsDark = 0, knights = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p || colorOfPiece(p) !== color) continue;
    const t = typeOf(p);
    if (t === 'p' || t === 'r' || t === 'q') return true;
    if (t === 'n') { knights++; minors++; }
    if (t === 'b') { minors++; if ((fileOf(sq) + rankOf(sq)) & 1) bishopsLight++; else bishopsDark++; }
  }
  if (minors <= 1) return false;
  if (knights === 0 && (bishopsLight === 0 || bishopsDark === 0)) return false;
  return true;
}

const PIECE_LETTER: Record<PieceType, string> = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };

/** Standard Algebraic Notation for a legal move by `color` in `pos`. */
export function moveToSan(pos: Position, m: Move, color: Color): string {
  let san: string;
  if (m.flags & FLAG_CASTLE_K) san = 'O-O';
  else if (m.flags & FLAG_CASTLE_Q) san = 'O-O-O';
  else {
    const t = typeOf(m.piece);
    const capture = m.flags & FLAG_CAPTURE;
    if (t === 'p') {
      san = (capture ? 'abcdefgh'[fileOf(m.from)] + 'x' : '') + squareName(m.to);
      if (m.promotion) san += '=' + m.promotion.toUpperCase();
    } else {
      let dis = '';
      const rivals = legalMoves(pos, color).filter((o) => o.to === m.to && o.piece === m.piece && o.from !== m.from);
      if (rivals.length) {
        const sameFile = rivals.some((o) => fileOf(o.from) === fileOf(m.from));
        const sameRank = rivals.some((o) => rankOf(o.from) === rankOf(m.from));
        if (!sameFile) dis = 'abcdefgh'[fileOf(m.from)];
        else if (!sameRank) dis = String(rankOf(m.from) + 1);
        else dis = squareName(m.from);
      }
      san = PIECE_LETTER[t] + dis + (capture ? 'x' : '') + squareName(m.to);
    }
  }
  const next = makeMove(pos, m);
  const enemy = other(color);
  if (inCheck(next, enemy)) san += hasLegalMove(next, enemy) ? '+' : '#';
  return san;
}

/** Standard alternating-turn perft, used to validate move generation. */
export function perft(pos: Position, color: Color, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(pos, color);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(makeMove(pos, m), other(color), depth - 1);
  return n;
}
