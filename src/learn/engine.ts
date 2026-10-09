/**
 * Glue between lesson content and the real Chess Uno rules engine (src/rules, unchanged).
 * Puzzles and demos are real games built with `createGame` (fixed FEN + rigged deck), so every
 * rule — check ends your turn, Skip, Reverse, en passant on the first move only — applies exactly
 * as in a match. Goals are judged on the resulting state, so any valid solution is accepted.
 */
import { applyAction, canPlayCard, createGame, currentColor, type GameState, type PlayerId } from '../rules/game';
import type { ActionKind, Card, CardKind } from '../rules/cards';
import {
  type Color, type Move, type PieceType, type Position, FLAG_EP, colorOfPiece, hasLegalMove, inCheck, legalMoves,
  makeMove, other, parseFen, parseSquare, typeOf,
} from '../rules/chess';
import type { Demo, Goal, Puzzle } from './types';

/** The learner is always player 0. */
export const LEARNER: PlayerId = 0;
const NOW = 0;
const PAD: CardKind[] = ['1', '1', '1', '1', '1', '1'];
let cardIds = 50_000;
const toCards = (kinds: ActionKind[] | undefined): Card[] => (kinds ?? []).map((kind) => ({ id: cardIds++, kind }));

const VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const material = (board: string[], color: Color) =>
  board.reduce((n, p) => n + (p && colorOfPiece(p) === color ? VALUE[typeOf(p)] : 0), 0);
const count = (board: string[], color: Color, type: PieceType) =>
  board.filter((p) => p && colorOfPiece(p) === color && typeOf(p) === type).length;

/** Colour the learner plays in a puzzle (the side to move after the prelude). */
export function learnerColor(p: Puzzle): Color {
  const { turn } = parseFen(p.fen);
  return p.prelude?.length ? other(turn) : turn;
}

/** Apply one script token for whoever is to move. Draws automatically before a move. */
export function applyToken(s: GameState, token: string): GameState {
  const player = s.current;
  if (token === 'draw') return applyAction(s, { type: 'draw', player }, NOW);
  if (token === 'skip' || token === 'reverse') {
    const card = s.hands[player].find((c) => c.kind === token);
    if (!card) throw new Error(`No ${token} in hand`);
    return applyAction(s, { type: 'playCard', player, cardId: card.id }, NOW);
  }
  if (s.phase === 'start') s = applyAction(s, { type: 'draw', player }, NOW);
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(token);
  if (!m) throw new Error(`Bad token ${token}`);
  return applyAction(s, {
    type: 'move', player, from: parseSquare(m[1]), to: parseSquare(m[2]),
    promotion: m[3] as 'q' | 'r' | 'b' | 'n' | undefined,
  }, NOW);
}

/** A fresh puzzle game, after any prelude, with the learner (player 0) to act. */
export function createPuzzleGame(p: Puzzle): GameState {
  const me = learnerColor(p);
  const deck: CardKind[] = [...(p.prelude?.length ? [String(p.prelude.length) as CardKind] : []), ...p.cards, ...PAD];
  let s = createGame({
    fen: p.fen,
    deckOrder: deck,
    graceMs: 0,
    clockMs: 24 * 3600_000,
    player0Color: me,
    reverseProtectionTurns: p.reverseProtection ?? 0,
    players: [{ name: 'You', kind: 'human' }, { name: 'Rival', kind: 'bot' }],
  }, NOW);
  s.hands[LEARNER] = toCards(p.hand);
  if (p.turnsDone) s.turnsCompleted = [...p.turnsDone];
  for (const t of p.prelude ?? []) s = applyToken(s, t);
  s.events = [];
  return s;
}

/** The learner's part of the puzzle is over (their turn(s) ended, or the game did). */
export const segmentOver = (s: GameState) => s.phase === 'over' || s.current !== LEARNER;

/** Should the UI draw for the learner automatically (nothing to decide)? */
export const needsDraw = (s: GameState) => s.phase === 'start' && s.current === LEARNER;
export const playableCards = (s: GameState) =>
  s.hands[LEARNER].filter((c) => (c.kind === 'skip' || c.kind === 'reverse') && canPlayCard(s, LEARNER, c.kind as ActionKind));

// ---------------------------------------------------------------- turn search

/**
 * Can `color`, making up to `n` moves in one Chess Uno turn, play a move for which `hit` is true?
 * Follows the turn rules: a checking move ends the turn, en passant only on the first move, a turn
 * ends early when no legal move remains.
 */
export function turnCan(pos: Position, color: Color, n: number, hit: (before: Position, m: Move, after: Position) => boolean): boolean {
  for (const m of legalMoves(pos, color)) {
    const after = makeMove(pos, m);
    after.ep = -1;
    if (hit(pos, m, after)) return true;
    if (inCheck(after, other(color))) continue;
    if (n > 1 && turnCan(after, color, n - 1, hit)) return true;
  }
  return false;
}

export const canMateInTurn = (pos: Position, color: Color, n: number) =>
  turnCan(pos, color, n, (_b, _m, a) => inCheck(a, other(color)) && !hasLegalMove(a, other(color)));

export const canCaptureInTurn = (pos: Position, color: Color, n: number, type: PieceType) =>
  turnCan(pos, color, n, (b, m) => (b.board[m.to] ? typeOf(b.board[m.to]) === type : type === 'p' && !!(m.flags & FLAG_EP)));

// ---------------------------------------------------------------- goals

export interface Verdict {
  ok: boolean;
  /** Learner-facing reason for the first failed goal. */
  reason?: string;
  /** The turn ended because the learner gave check before using all their moves. */
  earlyCheck?: boolean;
}

function goalMet(g: Goal, start: GameState, end: GameState, me: Color): string | null {
  const them = other(me);
  const ctrl = end.colorOf[LEARNER];
  const won = end.result?.winner === LEARNER;
  switch (g.type) {
    case 'mate':
      return won && end.result?.reason === 'checkmate' ? null : 'No checkmate this time.';
    case 'check':
      return inCheck(end.pos, other(ctrl)) ? null : "The enemy king isn't in check.";
    case 'noCheck':
      return !inCheck(end.pos, other(ctrl)) ? null : 'You gave check, which ended your turn early.';
    case 'occupy':
      for (const [sq, piece] of Object.entries(g.squares)) {
        if (end.pos.board[parseSquare(sq)] !== piece) return `The target square ${sq} isn't reached yet.`;
      }
      return null;
    case 'capture': {
      const sq = parseSquare(g.square);
      const victim = start.pos.board[sq];
      const before = start.pos.board.filter((p) => p === victim).length;
      const after = end.pos.board.filter((p) => p === victim).length;
      return victim && after < before && end.pos.board[sq] !== victim ? null : `The piece on ${g.square} is still there.`;
    }
    case 'captureType': {
      const lost = count(start.pos.board, them, g.piece) - count(end.pos.board, them, g.piece);
      return lost >= (g.count ?? 1) ? null : `You haven't captured the ${NAME[g.piece]}${(g.count ?? 1) > 1 ? 's' : ''}.`;
    }
    case 'promote': {
      const t = g.piece ?? 'q';
      return count(end.pos.board, me, t) > count(start.pos.board, me, t) ? null : `No new ${NAME[t]} yet.`;
    }
    case 'safe':
      if (won) return null;
      return end.phase !== 'over' && !canMateInTurn(end.pos, currentColor(end), g.oppCard)
        ? null : `With a ${g.oppCard} card your opponent could still checkmate you.`;
    case 'keep':
      if (won) return null;
      return end.phase !== 'over' && !canCaptureInTurn(end.pos, currentColor(end), g.oppCard, g.piece)
        ? null : `With a ${g.oppCard} card your opponent could still take your ${NAME[g.piece]}.`;
    case 'keepCard':
      return end.hands[LEARNER].some((c) => c.kind === g.card) ? null : `You used your ${g.card === 'skip' ? 'Skip' : 'Reverse'} — this time it was better saved.`;
    case 'lead':
      return material(end.pos.board, ctrl) - material(end.pos.board, other(ctrl)) >= g.min ? null : 'Your side is not ahead on material.';
  }
}

export const NAME: Record<PieceType, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/** Judge the learner's finished segment against every goal. */
export function judge(p: Puzzle, start: GameState, end: GameState): Verdict {
  const me = learnerColor(p);
  const last = [...end.history].reverse().find((t) => t.player === LEARNER && !t.skipped);
  const earlyCheck = !!last?.endedByCheck && last.card !== undefined && last.moves.length < Number(last.card);
  for (const g of p.goals) {
    const why = goalMet(g, start, end, me);
    if (why) return { ok: false, reason: earlyCheck && (g.type === 'mate' || g.type === 'noCheck') ? 'Your check ended your turn before you could finish.' : why, earlyCheck };
  }
  return { ok: true, earlyCheck };
}

/** Play the authored solution from the start and judge it (used by tests and "Show solution"). */
export function playSolution(p: Puzzle): { states: GameState[]; verdict: Verdict } {
  const start = createPuzzleGame(p);
  const states = [start];
  let s = start;
  for (const t of p.solution) {
    if (segmentOver(s)) throw new Error(`${p.id}: solution continues after the turn ended (${t})`);
    s = applyToken(s, t);
    states.push(s);
  }
  if (!segmentOver(s)) throw new Error(`${p.id}: solution leaves moves unplayed`);
  return { states, verdict: judge(p, start, s) };
}

/**
 * Enumerate every learner line (moves, card plays) and return those meeting the goals, up to
 * `limit` nodes. Used by the content tests to make sure puzzles are fair and to measure how
 * many solutions are accepted.
 */
export function solveAll(p: Puzzle, limit = 200_000): { solutions: string[][]; nodes: number; complete: boolean } {
  const start = createPuzzleGame(p);
  const solutions: string[][] = [];
  let nodes = 0;
  const walk = (s: GameState, line: string[]) => {
    if (nodes++ > limit) return;
    if (segmentOver(s)) {
      if (judge(p, start, s).ok) solutions.push(line);
      return;
    }
    if (s.phase === 'start') {
      for (const c of playableCards(s)) walk(applyToken(s, c.kind), [...line, c.kind]);
      walk(applyAction(s, { type: 'draw', player: LEARNER }, NOW), line);
      return;
    }
    if (s.phase !== 'moving') return;
    for (const m of legalMoves(s.pos, currentColor(s))) {
      if (m.promotion && m.promotion !== 'q' && m.promotion !== 'n') continue;
      const tok = uci(m);
      walk(applyToken(s, tok), [...line, tok]);
    }
  };
  walk(start, []);
  return { solutions, nodes, complete: nodes <= limit };
}

export const uci = (m: Move) => `${sqName(m.from)}${sqName(m.to)}${m.promotion ?? ''}`;
const sqName = (sq: number) => 'abcdefgh'[sq & 7] + String((sq >> 3) + 1);

// ---------------------------------------------------------------- demos

export function createDemoGame(d: Demo): GameState {
  const { turn } = parseFen(d.fen);
  const s = createGame({
    fen: d.fen,
    deckOrder: [...(d.deck ?? []), ...PAD, ...PAD],
    graceMs: 0,
    clockMs: 24 * 3600_000,
    player0Color: turn,
    reverseProtectionTurns: d.reverseProtection ?? 0,
  }, NOW);
  if (d.hands) s.hands = [toCards(d.hands[0]), toCards(d.hands[1])];
  return s;
}

/** Every state of a demo script, in order (first = initial position). */
export function demoFrames(d: Demo): GameState[] {
  let s = createDemoGame(d);
  const out = [s];
  for (const t of d.actions) {
    s = applyToken(s, t);
    out.push(s);
  }
  return out;
}
