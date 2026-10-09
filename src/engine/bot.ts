/**
 * Chess Uno bot. Understands multi-move turns: for an N-move card it searches
 * sequences of up to N moves (any check ends the sequence, mirroring the rule),
 * then scores each resulting position by the opponent's best reply turn.
 *
 * Difficulty is controlled by beam width, reply depth, and deliberate noise.
 * Pure TypeScript so it runs in a Web Worker today and can be swapped for the
 * planned Rust→WASM engine later behind the same interface.
 */
import {
  type Color, type Move, type Position, hasLegalMove, inCheck, legalMoves, makeMove, other, placementFen, FLAG_CAPTURE,
} from '../rules/chess';
import { type GameState, type GameAction, type PlayerId, canPlayCard, currentColor } from '../rules/game';
import { evaluate, VALUE } from './evaluate';

export type BotLevel = 'easy' | 'medium' | 'hard';

export interface LevelParams {
  beam: number;          // quiet moves kept per ply of our own turn
  tactical: number;      // max checks/captures kept per ply
  reply: 0 | 1 | 2;      // opponent reply depth (moves) used to score our turn
  replyBeam: number;     // opponent first moves expanded to a second move
  noise: number;         // ± random centipawns added to final scores
  blunder: number;       // chance of picking a random legal sequence
}

export const LEVELS: Record<BotLevel, LevelParams> = {
  easy: { beam: 4, tactical: 4, reply: 0, replyBeam: 0, noise: 120, blunder: 0.15 },
  medium: { beam: 6, tactical: 6, reply: 1, replyBeam: 0, noise: 25, blunder: 0.03 },
  hard: { beam: 7, tactical: 8, reply: 2, replyBeam: 4, noise: 4, blunder: 0 },
};

const MATE = 100000;

type Rand = () => number;

export interface SearchCtx {
  color: Color;
  params: LevelParams;
  cache: Map<string, number>;
  nodes: number;
}

const posKey = (pos: Position) => placementFen(pos.board) + pos.castling;

/** Score a position at the end of our turn, assuming the opponent moves next. */
export function scoreAfterTurn(pos: Position, ctx: SearchCtx): number {
  const key = posKey(pos);
  const cached = ctx.cache.get(key);
  if (cached !== undefined) return cached;
  ctx.nodes++;
  const me = ctx.color, them = other(me);
  let score: number;
  if (!hasLegalMove(pos, them)) {
    score = inCheck(pos, them) ? MATE : 0;
  } else if (ctx.params.reply === 0) {
    score = evaluate(pos.board, me) + (inCheck(pos, them) ? 15 : 0);
  } else {
    score = replyScore(pos, ctx);
  }
  ctx.cache.set(key, score);
  return score;
}

/**
 * Opponent's best reply. With reply=2 we blend their best 1-move and 2-move
 * turns by the deck's odds (≈43% draw a 1, ≈57% draw 2+).
 */
function replyScore(pos: Position, ctx: SearchCtx): number {
  const me = ctx.color, them = other(me);
  const replies = legalMoves(pos, them);
  let best1 = Infinity;
  const scored: { m: Move; next: Position; s: number; check: boolean }[] = [];
  for (const m of replies) {
    const next = makeMove(pos, m);
    next.ep = -1;
    const check = inCheck(next, me);
    let s: number;
    if (check && !hasLegalMove(next, me)) s = -MATE;
    else s = evaluate(next.board, me);
    if (s < best1) best1 = s;
    scored.push({ m, next, s, check });
  }
  if (ctx.params.reply < 2 || best1 <= -MATE) return best1;
  scored.sort((a, b) => a.s - b.s);
  let best2 = best1;
  let expanded = 0;
  for (const r of scored) {
    if (r.check) continue; // their check ends their turn
    if (expanded++ >= ctx.params.replyBeam) break;
    for (const m2 of legalMoves(r.next, them)) {
      const n2 = makeMove(r.next, m2);
      let s: number;
      if (inCheck(n2, me) && !hasLegalMove(n2, me)) s = -MATE;
      else s = evaluate(n2.board, me);
      if (s < best2) best2 = s;
    }
  }
  // Also look for their quiet-quiet-mate threats cheaply: any mate already found dominates.
  if (best2 <= -MATE) return -MATE * 0.6 + best1 * 0.4;
  return 0.43 * best1 + 0.57 * best2;
}

export interface Line { moves: Move[]; score: number }

export function searchTurn(pos: Position, left: number, ctx: SearchCtx): Line {
  const me = ctx.color, them = other(me);
  const moves = legalMoves(pos, me);
  if (!moves.length) return { moves: [], score: scoreAfterTurn(pos, ctx) };
  const cands: { m: Move; next: Position; check: boolean; quick: number; tactical: boolean }[] = [];
  for (const m of moves) {
    const next = makeMove(pos, m);
    next.ep = -1;
    const check = inCheck(next, them);
    if (check && !hasLegalMove(next, them)) return { moves: [m], score: MATE + left }; // mate now
    const quick = evaluate(next.board, me);
    cands.push({ m, next, check, quick, tactical: check || !!(m.flags & FLAG_CAPTURE) || !!m.promotion });
  }
  const tactical = cands.filter((c) => c.tactical).sort((a, b) => b.quick - a.quick).slice(0, ctx.params.tactical);
  const quiet = cands.filter((c) => !c.tactical).sort((a, b) => b.quick - a.quick).slice(0, ctx.params.beam);
  let best: Line = { moves: [], score: -Infinity };
  for (const c of [...tactical, ...quiet]) {
    let line: Line;
    if (c.check || left <= 1) line = { moves: [c.m], score: scoreAfterTurn(c.next, ctx) };
    else {
      const sub = searchTurn(c.next, left - 1, ctx);
      line = { moves: [c.m, ...sub.moves], score: sub.score };
    }
    if (line.score > best.score) best = line;
  }
  return best;
}

/** Hanging-material helper: value of our pieces the opponent can capture for free. */
export function evalFor(state: GameState, color: Color): number {
  return evaluate(state.pos.board, color);
}

/** Plan the remaining moves of the current turn. */
export function planTurn(state: GameState, level: BotLevel, rand: Rand = Math.random): Move[] {
  const color = currentColor(state);
  const params = LEVELS[level];
  const left = state.movesAllowed - state.movesMade;
  const pos: Position = { ...state.pos, board: state.pos.board.slice() };
  const legal = legalMoves(pos, color);
  if (!legal.length) return [];
  const them = other(color);
  // Every level always takes a mate-in-one.
  for (const m of legal) {
    const next = makeMove(pos, m);
    if (inCheck(next, them) && !hasLegalMove(next, them)) return [m];
  }
  if (rand() < params.blunder) {
    // A "human" slip: random first move, then search the rest normally.
    const m = legal[Math.floor(rand() * legal.length)];
    return [m];
  }
  const ctx: SearchCtx = { color, params, cache: new Map(), nodes: 0 };
  // Root: score every first move with noise so weaker bots vary their play.
  let best: Line = { moves: [], score: -Infinity };
  for (const m of legal) {
    const next = makeMove(pos, m);
    next.ep = -1;
    const check = inCheck(next, them);
    let line: Line;
    if (check && !hasLegalMove(next, them)) return [m];
    if (check || left <= 1) line = { moves: [m], score: scoreAfterTurn(next, ctx) };
    else {
      const sub = searchTurn(next, left - 1, ctx);
      line = { moves: [m, ...sub.moves], score: sub.score };
    }
    if (line.score < MATE / 2) line.score += (rand() * 2 - 1) * params.noise;
    if (line.score > best.score) best = line;
  }
  return best.moves;
}

/** Decide what to do at the start of the turn: play a held card or draw. */
export function decideStart(state: GameState, level: BotLevel, rand: Rand = Math.random): GameAction {
  const player = state.current as PlayerId;
  const color = currentColor(state);
  const hand = state.hands[player];
  const ev = evaluate(state.pos.board, color);
  for (const card of hand) {
    if (card.kind !== 'reverse' || !canPlayCard(state, player, 'reverse')) continue;
    const threshold = level === 'easy' ? -50 : level === 'medium' ? -250 : -180;
    if (ev <= threshold && (level !== 'easy' || rand() < 0.5)) return { type: 'playCard', player, cardId: card.id };
  }
  for (const card of hand) {
    if (card.kind !== 'skip' || !canPlayCard(state, player, 'skip')) continue;
    const handFull = hand.length >= state.config.handLimit;
    const late = state.turnNumber > 24;
    const chance = level === 'easy' ? 0.5 : level === 'medium' ? 0.3 : 0.2;
    // Hard bots save Skip to press an advantage or when the hand is full.
    const pressing = level === 'hard' && ev >= 150;
    if (handFull || late || pressing || rand() < chance) return { type: 'playCard', player, cardId: card.id };
  }
  return { type: 'draw', player };
}

/** Resolve a third action card: play it if useful, otherwise discard the weakest. */
export function decideOverflow(state: GameState, level: BotLevel): GameAction {
  const player = state.current as PlayerId;
  const card = state.overflowCard!;
  const color = currentColor(state);
  const ev = evaluate(state.pos.board, color);
  if (card.kind === 'skip' && canPlayCard(state, player, 'skip')) {
    return { type: 'resolveOverflow', player, choice: 'play' };
  }
  if (card.kind === 'reverse' && canPlayCard(state, player, 'reverse') && ev <= (level === 'easy' ? 0 : -180)) {
    return { type: 'resolveOverflow', player, choice: 'play' };
  }
  // Discard a Reverse when winning (we don't want to swap), otherwise discard the new card.
  const hand = state.hands[player];
  const heldReverse = hand.find((c) => c.kind === 'reverse');
  if (card.kind === 'skip' && heldReverse && ev > 0) return { type: 'resolveOverflow', player, choice: { discardId: heldReverse.id } };
  return { type: 'resolveOverflow', player, choice: { discardId: card.id } };
}

/** One bot step for whatever phase the game is in (null when it's not the bot's decision). */
export function botStep(state: GameState, level: BotLevel, rand: Rand = Math.random): GameAction | Move[] | null {
  if (state.phase === 'start') return decideStart(state, level, rand);
  if (state.phase === 'overflow') return decideOverflow(state, level);
  if (state.phase === 'moving') return planTurn(state, level, rand);
  return null;
}

export { MATE, VALUE };
