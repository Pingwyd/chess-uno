/**
 * Review bot: a deeper, noise-free analysis mode of the Chess Uno engine.
 *
 * For every turn it looks at the position after the card was drawn and asks,
 * for that exact card: what was the best turn, and how much winning chance did
 * the turn actually played give away? Turns are labelled from that loss, and
 * Chess Uno-specific patterns get plain-language notes: checks that ended a turn
 * early, missed mates, mates allowed, Reverse and Skip timing. It also rates card
 * luck by comparing the best turn with the card drawn to the average over the
 * cards that could have come.
 *
 * Pure TypeScript, so it runs in a Web Worker (offline) or on the server.
 */
import {
  type Color, type Move, type Position, hasLegalMove, inCheck, legalMoves, makeMove, moveToSan, other, typeOf, FLAG_CAPTURE,
} from '../rules/chess';
import type { GameState, PlayerId } from '../rules/game';
import { numberOdds, type ActionKind, type CardKind, type NumberKind } from '../rules/cards';
import { MATE, scoreAfterTurn, searchTurn, type LevelParams, type Line, type SearchCtx } from './bot';
import { evaluate, VALUE } from './evaluate';
import { reconstruct, type Frame, type GameRecord, type Replay } from '../replay/record';

export const REVIEW_VERSION = 3;

/** Deeper than the hardest bot: wider beams, full 2-move replies, no noise. */
export const ANALYSIS: LevelParams = { beam: 9, tactical: 10, reply: 2, replyBeam: 6, noise: 0, blunder: 0 };
/** Cheaper settings for the luck meter's "what if I had drawn another card" searches. */
export const LUCK: LevelParams = { beam: 5, tactical: 6, reply: 1, replyBeam: 0, noise: 0, blunder: 0 };

export type Label = 'brilliant' | 'great' | 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';
export const LABELS: Label[] = ['brilliant', 'great', 'best', 'good', 'inaccuracy', 'mistake', 'blunder'];
export const LABEL_TEXT: Record<Label, string> = {
  brilliant: 'Brilliant', great: 'Great', best: 'Best', good: 'Good', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder',
};

/** Upper bounds on win-chance loss (percentage points) for each label. */
export const THRESHOLDS = { best: 2, good: 5, inaccuracy: 10, mistake: 20 } as const;

/** Deck odds of each number card for the current rules (v2: 19×1, 18×2, 5×3). Old games use their own rules' odds. */
export const CARD_ODDS: Record<NumberKind, number> = numberOdds();
export const EXPECTED_CARD = 1 * CARD_ODDS['1'] + 2 * CARD_ODDS['2'] + 3 * CARD_ODDS['3'];
type Odds = Record<NumberKind, number>;

// ---------------------------------------------------------------- scoring helpers

/** Win chance (0–100) from a centipawn score, logistic like lichess; mates are 0/100. */
export function winChance(cp: number): number {
  if (cp >= MATE / 2) return 100;
  if (cp <= -MATE / 2) return 0;
  return 100 / (1 + Math.exp(-0.00368208 * cp));
}

/** Per-turn accuracy (0–100) from win-chance loss, same curve as common chess sites. */
export function accuracyFromLoss(lossPct: number): number {
  const a = 103.1668 * Math.exp(-0.04354 * Math.max(0, lossPct)) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

export interface ClassifyInput {
  /** Win-chance loss vs the best turn for this card (percentage points; negative = better than the engine line). */
  loss: number;
  /** Win-chance change from before the turn to after it (mover's view). */
  gain?: number;
  /** A material sacrifice that kept the evaluation. */
  sacrifice?: boolean;
  /** A mate that needed every move of the card. */
  deepMate?: boolean;
  /** Mate was available and not played. */
  missedMate?: boolean;
}

/** Label a turn from its loss in win chance (see THRESHOLDS) plus a few special cases. */
export function classify({ loss, gain = 0, sacrifice, deepMate, missedMate }: ClassifyInput): Label {
  let label: Label;
  if (loss <= THRESHOLDS.best) {
    if (deepMate || sacrifice) label = 'brilliant';
    else if (gain >= 20) label = 'great';
    else label = 'best';
  } else if (loss <= THRESHOLDS.good) label = 'good';
  else if (loss <= THRESHOLDS.inaccuracy) label = 'inaccuracy';
  else if (loss <= THRESHOLDS.mistake) label = 'mistake';
  else label = 'blunder';
  // A missed mate is at least an inaccuracy, and a mistake unless the game stayed completely won.
  if (missedMate) label = worse(label, loss < 3 ? 'inaccuracy' : 'mistake');
  return label;
}

const worse = (a: Label, b: Label): Label => (LABELS.indexOf(a) >= LABELS.indexOf(b) ? a : b);

// ---------------------------------------------------------------- search

/** Exhaustive search for a mate within an n-move turn (a check that doesn't mate ends the turn). */
export function findMateInTurn(pos: Position, color: Color, n: number): Move[] | null {
  const them = other(color);
  const walk = (p: Position, left: number): Move[] | null => {
    const moves = legalMoves(p, color);
    // Mates first (any depth), then quiet moves to recurse into.
    const quiet: { m: Move; next: Position }[] = [];
    for (const m of moves) {
      const next = makeMove(p, m);
      next.ep = -1;
      if (inCheck(next, them)) {
        if (!hasLegalMove(next, them)) return [m];
        continue;
      }
      if (left > 1) quiet.push({ m, next });
    }
    for (const q of quiet) {
      const sub = walk(q.next, left - 1);
      if (sub) return [q.m, ...sub];
    }
    return null;
  };
  // Prefer the shortest mate.
  for (let k = 1; k <= n; k++) {
    const line = walk({ ...pos, board: pos.board.slice() }, k);
    if (line) return line;
  }
  return null;
}

export interface Contexts { w: SearchCtx; b: SearchCtx }
export const newContexts = (params: LevelParams): Contexts => ({
  w: { color: 'w', params, cache: new Map(), nodes: 0 },
  b: { color: 'b', params, cache: new Map(), nodes: 0 },
});

/** Best full turn for `color` with `n` moves from `pos` (mover's-view score). */
export function bestTurn(pos: Position, color: Color, n: number, ctxs: Contexts, exactMate = true): Line & { mate: boolean } {
  const ctx = ctxs[color];
  if (exactMate) {
    const mate = findMateInTurn(pos, color, n);
    if (mate) return { moves: mate, score: MATE + (n - mate.length), mate: true };
  }
  const them = other(color);
  const legal = legalMoves(pos, color);
  if (!legal.length) return { moves: [], score: scoreAfterTurn(pos, ctx), mate: false };
  let best: Line = { moves: [], score: -Infinity };
  for (const m of legal) {
    const next = makeMove(pos, m);
    next.ep = -1;
    const check = inCheck(next, them);
    if (check && !hasLegalMove(next, them)) return { moves: [m], score: MATE + n - 1, mate: true };
    let line: Line;
    if (check || n <= 1) line = { moves: [m], score: scoreAfterTurn(next, ctx) };
    else {
      const sub = searchTurn(next, n - 1, ctx);
      line = { moves: [m, ...sub.moves], score: sub.score };
    }
    if (line.score > best.score) best = line;
  }
  return { ...best, mate: best.score >= MATE / 2 };
}

/** Value of a position for the side to move before it has drawn (expected over the number cards). */
export function toMoveValue(pos: Position, color: Color, ctxs: Contexts, odds: Odds = CARD_ODDS): number {
  let v = 0;
  for (const c of ['1', '2', '3'] as const) v += odds[c] * clampCp(bestTurn(pos, color, Number(c), ctxs, c !== '1').score);
  return v;
}

const clampCp = (cp: number) => Math.max(-3000, Math.min(3000, cp));

/** Score of a finished turn (mover's view): mate, or the engine's view of the opponent's best reply. */
function scoreEnd(pos: Position, color: Color, ctxs: Contexts): number {
  const them = other(color);
  if (inCheck(pos, them) && !hasLegalMove(pos, them)) return MATE;
  return scoreAfterTurn(pos, ctxs[color]);
}

function material(board: string[], color: Color): number {
  let n = 0;
  for (const p of board) if (p && (p === p.toUpperCase() ? 'w' : 'b') === color) n += VALUE[p.toLowerCase()];
  return n;
}

export function sanLine(pos: Position, color: Color, moves: Move[]): string[] {
  const out: string[] = [];
  let p = { ...pos, board: pos.board.slice() };
  for (const m of moves) {
    out.push(moveToSan(p, m, color));
    p = makeMove(p, m);
    p.ep = -1;
  }
  return out;
}

const PIECE_NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const ORD = ['', 'first', 'second', 'third'];
const pawns = (cp: number) => `${cp >= 0 ? '+' : '−'}${(Math.abs(cp) / 100).toFixed(1)}`;
const joinLine = (san: string[]) => (san.length <= 1 ? san.join('') : `${san.slice(0, -1).join(', ')} then ${san[san.length - 1]}`);

// ---------------------------------------------------------------- game review

export type FlagType =
  | 'earlyCheck' | 'missedMate' | 'foundMate' | 'allowedMate' | 'hangs'
  | 'reverseGood' | 'reverseBad' | 'skipGood' | 'skipWasted';

export interface Flag { type: FlagType; text: string }

export interface TurnReview {
  /** History index. */
  turn: number;
  player: PlayerId;
  color: Color;
  card?: CardKind;
  capped?: boolean;
  played: ActionKind[];
  label: Label | null;
  /** Frame index where the analysed position starts (card revealed) and the turn's last frame. */
  frameStart: number;
  frameEnd: number;
  actual: string[];
  best: { moves: Move[]; san: string[]; mate: boolean } | null;
  /** Mover's-view scores in centipawns (mates ≈ ±100000). */
  scoreBest: number | null;
  scoreActual: number | null;
  /** Win-chance loss vs the best turn (percentage points). */
  loss: number;
  accuracy: number | null;
  /** Evaluation after the turn from player 0's view (centipawns, clamped), for the graph. */
  evalAfter: number;
  /** Mover's win chance after the turn. */
  winAfter: number;
  flags: Flag[];
  /** One or two plain-language sentences. */
  text: string;
  /** Card luck: win-chance swing of the card drawn vs the average card (percentage points). */
  luck: number | null;
}

export interface PlayerReview {
  accuracy: number | null;
  counts: Record<Label, number>;
  /** Average number card drawn vs the deck's expected value (≈1.67 v2, ≈1.79 v1). */
  avgCard: number | null;
  numberCards: number;
  actionCards: number;
  /** Average win-chance swing from the cards drawn (positive = lucky). */
  luck: number;
}

export interface GameReview {
  version: number;
  turns: TurnReview[];
  players: [PlayerReview, PlayerReview];
  /** Turn indexes (into `turns`) of the biggest swings, in game order. */
  keyMoments: number[];
  /** Player 0's evaluation after each turn, starting at 0. */
  graph: { turn: number; value: number; frame: number }[];
  /** Average moves per number card for this game's deck (luck meter baseline). */
  expectedCard: number;
  ms: number;
}

export type Progress = (done: number, total: number) => void;

interface TurnSpan { turn: number; frames: number[]; moving: number | null }

function spans(replay: Replay): TurnSpan[] {
  const out: TurnSpan[] = [];
  replay.frames.forEach((f, i) => {
    if (f.kind === 'start') return;
    const t = (out[f.turn] ??= { turn: f.turn, frames: [], moving: null });
    t.frames.push(i);
    if (t.moving === null && f.state.phase === 'moving' && f.state.history.length - 1 === f.turn && f.state.movesMade === 0) t.moving = i;
  });
  return out.filter(Boolean);
}

const stateBefore = (replay: Replay, frameIndex: number): GameState => replay.frames[frameIndex - 1]?.state ?? replay.frames[0].state;

/** Analyse a whole game. Synchronous; call it from a worker. */
export function reviewGame(record: GameRecord, onProgress?: Progress, replay = reconstruct(record)): GameReview {
  const t0 = Date.now();
  // Records without a rules version predate rules v2 (old deck, unlimited Reverse).
  const odds = numberOdds(record.config.rules ?? 1);
  const expectedCard = odds['1'] + 2 * odds['2'] + 3 * odds['3'];
  const ctxs = newContexts(ANALYSIS);
  const luckCtxs = newContexts(LUCK);
  const history = replay.final.history;
  const turns: TurnReview[] = [];
  const all = spans(replay);
  // Running "value before the turn" from each player's view: −(opponent's last after-score).
  let lastAfter: { player: PlayerId; score: number } | null = null;
  let p0Eval = 0;

  all.forEach((span, k) => {
    onProgress?.(k, all.length);
    const rec = history[span.turn];
    if (!rec || rec.skipped) return;
    const player = rec.player;
    const firstFrame = span.frames[0];
    const lastFrame = span.frames[span.frames.length - 1];
    const startState = stateBefore(replay, firstFrame);
    const color = startState.colorOf[player];
    const beforeMover = lastAfter ? (lastAfter.player === player ? lastAfter.score : -lastAfter.score) : 0;
    const base: TurnReview = {
      turn: span.turn, player, color, card: rec.card, capped: rec.capped, played: rec.played.slice(),
      label: null, frameStart: span.moving ?? firstFrame, frameEnd: lastFrame, actual: rec.moves.slice(),
      best: null, scoreBest: null, scoreActual: null, loss: 0, accuracy: null,
      evalAfter: p0Eval, winAfter: winChance(beforeMover), flags: [], text: '', luck: null,
    };

    // ------------------------------------------------ Reverse (the whole turn)
    if (rec.played.includes('reverse')) {
      const pos = startState.pos;
      const v = clampCp(toMoveValue(pos, color, ctxs, odds));
      // Not reversing keeps value v; reversing hands the side to move to the opponent: −v.
      const loss = Math.max(-100, winChance(v) - winChance(-v));
      const gainPct = winChance(-v) - winChance(beforeMover);
      const label = classify({ loss: Math.max(0, loss), gain: Math.max(-loss, gainPct > 0 && loss < 0 ? gainPct : 0) });
      const flags: Flag[] = loss > THRESHOLDS.good
        ? [{ type: 'reverseBad', text: `Reverse here gave away a ${v > 150 ? 'winning' : 'better'} position (${pawns(v)} → ${pawns(-v)}).` }]
        : v < -100 ? [{ type: 'reverseGood', text: `Well-timed Reverse: your side was worse (${pawns(v)}), so swapping took over the stronger side (${pawns(-v)}).` }] : [];
      const after = -v;
      lastAfter = { player, score: after };
      p0Eval = player === 0 ? after : -after;
      turns.push({
        ...base, label, loss: Math.max(0, loss), accuracy: accuracyFromLoss(Math.max(0, loss)), scoreBest: Math.max(v, -v), scoreActual: after,
        evalAfter: clampCp(p0Eval), winAfter: winChance(after), flags,
        text: (flags[0]?.text ?? (loss <= 0 ? 'Reverse kept things level.' : 'Drawing a card instead of Reversing was slightly better.'))
          + (startState.config.reverseLimit === 1 ? (loss > THRESHOLDS.good ? ' And that was your only Reverse of the game.' : ' (Your one Reverse for the game.)') : ''),
      });
      return;
    }

    // ------------------------------------------------ a moving turn
    if (span.moving === null || !rec.card) return;
    const mstate = replay.frames[span.moving].state;
    const n = mstate.movesAllowed;
    const pos = mstate.pos;
    const moveFrames = span.frames.filter((i) => replay.frames[i].kind === 'move');
    const endState = replay.frames[lastFrame].state;
    const finishedMidTurn = endState.phase === 'over' && endState.result?.reason !== 'checkmate' && moveFrames.length < n && !rec.endedByCheck
      && endState.result?.reason !== 'insufficient' && endState.result?.reason !== 'stalemate';
    if (!moveFrames.length || finishedMidTurn) {
      turns.push({ ...base, text: 'The game ended during this turn.' });
      return;
    }
    const actualMoves = moveFrames.map((i) => replay.frames[i].move!);
    const endPos = replay.frames[moveFrames[moveFrames.length - 1]].state.pos;
    const best = bestTurn(pos, color, n, ctxs);
    const actualScore = scoreEnd(endPos, color, ctxs);
    const bestScore = Math.max(best.score, actualScore);
    const loss = Math.max(0, winChance(best.score) - winChance(actualScore));
    const bestSan = sanLine(pos, color, best.moves);
    const mated = actualScore >= MATE / 2;
    const flags: Flag[] = [];
    const earlyCheck = !!rec.endedByCheck && actualMoves.length < n && !mated;
    const bestText = `${joinLine(bestSan)}${best.mate ? ' was mate' : ' was stronger'}`;

    if (best.mate && !mated) {
      flags.push({
        type: earlyCheck ? 'earlyCheck' : 'missedMate',
        text: earlyCheck
          ? `You checked on move ${actualMoves.length} of a ${n}-card, ending your turn; ${bestText}.`
          : `Mate was on the board with your ${n}: ${joinLine(bestSan)}.`,
      });
    } else if (earlyCheck && loss > THRESHOLDS.best) {
      flags.push({ type: 'earlyCheck', text: `You checked on move ${actualMoves.length} of a ${n}-card, ending your turn with ${plural(n - actualMoves.length, 'move')} unused; ${bestText} (${pawns(best.score)}).` });
    }
    let deepMate = false;
    if (mated) {
      deepMate = n >= 2 && actualMoves.length === n && !findMateInTurn(pos, color, n - 1);
      flags.push({ type: 'foundMate', text: deepMate ? `Checkmate that needed all ${n} moves — the quiet setup made it work.` : 'Checkmate!' });
    } else if (actualScore <= -MATE * 0.5 + 1 || (actualScore < -20000)) {
      const them = other(color);
      const line = findMateInTurn(endPos, them, 2);
      if (line) {
        const unstoppable = winChance(best.score) - winChance(actualScore) <= THRESHOLDS.best;
        flags.push({ type: 'allowedMate', text: unstoppable ? `Mate could no longer be stopped: ${joinLine(sanLine(endPos, them, line))}.` : `This allowed mate: ${joinLine(sanLine(endPos, them, line))}.` });
      }
    }
    if (!flags.some((f) => f.type === 'allowedMate') && loss > THRESHOLDS.inaccuracy && !mated) {
      const hang = biggestThreat(endPos, color);
      if (hang) flags.push({ type: 'hangs', text: `After this, ${hang}.` });
    }
    // Sacrifice: material dropped by ≥ 2 pawns but the evaluation held (and it isn't simply a trade).
    const matBefore = material(pos.board, color) - material(pos.board, other(color));
    const matAfterReply = material(endPos.board, color) - material(endPos.board, other(color)) - maxCaptureValue(endPos, other(color));
    const sacrifice = loss <= THRESHOLDS.best && matAfterReply <= matBefore - 200 && actualScore >= beforeMover - 30 && actualScore > -150;
    const gain = winChance(actualScore) - winChance(beforeMover);
    const label = classify({ loss, gain, sacrifice, deepMate, missedMate: best.mate && !mated });

    // Skip timing: judged on this turn plus the bonus turn it buys.
    if (rec.played.includes('skip')) {
      const next = all.slice(k + 1).find((sp) => history[sp.turn] && !history[sp.turn].skipped);
      const nextRec = next ? history[next.turn] : null;
      if (nextRec && nextRec.player === player) {
        // Score after the bonus turn is computed when we get there; estimate now from the actual positions.
        const nextEndFrame = next!.frames[next!.frames.length - 1];
        const nextEnd = replay.frames[nextEndFrame].state;
        const nColor = replay.frames[next!.frames[0] - 1]?.state.colorOf[player] ?? color;
        const twoTurn = nextEnd.phase === 'over' && nextEnd.result?.winner === player ? MATE : scoreAfterTurn(nextEnd.pos, ctxs[nColor]);
        const swing = clampCp(twoTurn) - clampCp(beforeMover);
        if (twoTurn >= MATE / 2 || swing >= 150) flags.push({ type: 'skipGood', text: `Well-timed Skip: two turns in a row ${twoTurn >= MATE / 2 ? 'forced mate' : `gained ${pawns(swing)}`}.` });
        else if (swing < 50 && startState.turnNumber < 30) flags.push({ type: 'skipWasted', text: `Skip spent for little gain (${pawns(swing)}). Holding it for a moment when two turns in a row win material or force mate would have been stronger.` });
      }
    }
    const finalLabel = flags.some((f) => f.type === 'skipWasted') ? worse(label, 'inaccuracy') : label;

    // Card luck: best turn with the card drawn vs the average over the cards that could have come.
    let luck: number | null = null;
    if (!rec.capped) {
      const by = { '1': 0, '2': 0, '3': 0 } as Record<'1' | '2' | '3', number>;
      for (const c of ['1', '2', '3'] as const) by[c] = winChance(c === rec.card && n === Number(c) ? best.score : bestTurn(pos, color, Number(c), luckCtxs, true).score);
      const exp = by['1'] * odds['1'] + by['2'] * odds['2'] + by['3'] * odds['3'];
      luck = by[rec.card as '1' | '2' | '3'] - exp;
    }

    const after = actualScore;
    lastAfter = { player, score: after };
    p0Eval = player === 0 ? after : -after;
    const text = describe(finalLabel, flags, bestSan, best.mate, n, loss, base.actual, gain);
    turns.push({
      ...base, label: finalLabel, best: { moves: best.moves, san: bestSan, mate: best.mate }, scoreBest: bestScore, scoreActual: actualScore,
      loss, accuracy: accuracyFromLoss(loss), evalAfter: clampCp(p0Eval), winAfter: winChance(after), flags, text, luck,
    });
  });
  onProgress?.(all.length, all.length);

  // ------------------------------------------------ per-player summaries
  const players = ([0, 1] as PlayerId[]).map((p) => {
    const mine = turns.filter((t) => t.player === p);
    const scored = mine.filter((t) => t.accuracy !== null);
    const counts = Object.fromEntries(LABELS.map((l) => [l, 0])) as Record<Label, number>;
    for (const t of mine) if (t.label) counts[t.label]++;
    const recs = history.filter((t) => t.player === p && t.card && !t.capped);
    const lucky = mine.filter((t) => t.luck !== null);
    const actionCards = history.filter((t) => t.player === p).reduce((n, t) => n + t.toHand.length, 0);
    return {
      accuracy: scored.length ? scored.reduce((a, t) => a + t.accuracy!, 0) / scored.length : null,
      counts,
      avgCard: recs.length ? recs.reduce((a, t) => a + Number(t.card), 0) / recs.length : null,
      numberCards: recs.length,
      actionCards,
      luck: lucky.length ? lucky.reduce((a, t) => a + t.luck!, 0) / lucky.length : 0,
    } satisfies PlayerReview;
  }) as [PlayerReview, PlayerReview];

  // ------------------------------------------------ key moments: biggest swings in player 0's eval, plus every blunder/brilliancy
  const swings = turns.map((t, i) => {
    const prev = i > 0 ? turns[i - 1].evalAfter : 0;
    const wp = (cp: number) => winChance(cp);
    return { i, swing: Math.abs(wp(t.evalAfter) - wp(prev)) + (t.label === 'blunder' || t.label === 'brilliant' ? 30 : t.label === 'mistake' || t.label === 'great' ? 12 : 0) + (t.flags.length ? 5 : 0) };
  });
  const keyMoments = swings.filter((s) => s.swing >= 15).sort((a, b) => b.swing - a.swing).slice(0, 5).map((s) => s.i).sort((a, b) => a - b);

  const graph = [{ turn: -1, value: 0, frame: 0 }, ...turns.map((t) => ({ turn: t.turn, value: t.evalAfter, frame: t.frameEnd }))];
  return { version: REVIEW_VERSION, turns, players, keyMoments, graph, expectedCard, ms: Date.now() - t0 };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function maxCaptureValue(pos: Position, color: Color): number {
  let best = 0;
  for (const m of legalMoves(pos, color)) if (m.flags & FLAG_CAPTURE) best = Math.max(best, VALUE[typeOf(m.captured)] ?? 0);
  return best;
}

/** The opponent's most damaging single reply, in words ("Black can answer Qxd5, winning the queen"). */
function biggestThreat(pos: Position, color: Color): string | null {
  const them = other(color);
  let best: { san: string; gain: number; captured: string } | null = null;
  const base = evaluate(pos.board, them);
  for (const m of legalMoves(pos, them)) {
    const next = makeMove(pos, m);
    const gain = evaluate(next.board, them) - base;
    if (!best || gain > best.gain) best = { san: moveToSan(pos, m, them), gain, captured: m.captured };
  }
  if (!best || best.gain < 150) return null;
  const who = them === 'w' ? 'White' : 'Black';
  return best.captured ? `${who} can answer ${best.san}, winning ${/^[aeiou]/.test(PIECE_NAME[typeOf(best.captured)]) ? 'an' : 'a'} ${PIECE_NAME[typeOf(best.captured)]}` : `${who} can answer ${best.san} with a big threat`;
}

function describe(label: Label, flags: Flag[], bestSan: string[], mate: boolean, n: number, loss: number, actual: string[], gain: number): string {
  const main = flags.find((f) => f.type !== 'skipGood' && f.type !== 'skipWasted');
  const card = flags.find((f) => f.type === 'skipGood' || f.type === 'skipWasted');
  const parts: string[] = [];
  if (main) parts.push(main.text);
  else if (label === 'best' || label === 'great' || label === 'brilliant') {
    if (gain >= 10 && actual.some((m) => m.includes('x'))) parts.push(`Took the chance: ${joinLine(actual)} — the best use of this card.`);
    else if (label === 'great') parts.push('A turning point — the best use of this card.');
    else if (label === 'brilliant') parts.push('Brilliant — a sacrifice that keeps everything under control.');
    else parts.push('The best use of this card.');
  }
  else if (label === 'good') parts.push(`Fine. ${joinLine(bestSan)} was a little better.`);
  else parts.push(`${joinLine(bestSan)}${mate ? ' was mate' : ' was better'} with your ${n}${loss > THRESHOLDS.mistake ? ` — this turn cost about ${Math.round(loss)}% winning chance` : ''}.`);
  if (card) parts.push(card.text);
  return parts.join(' ');
}

/** Turns where the engine has a better line worth showing with arrows. */
export const hasBetterLine = (t: TurnReview) => !!t.best && t.label !== null && LABELS.indexOf(t.label) >= LABELS.indexOf('good') && t.best.moves.length > 0;

export { ORD };
export type { Frame };
