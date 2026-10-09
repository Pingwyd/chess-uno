/**
 * Chess Uno rules layer (design doc §2–3). A pure reducer:
 *
 *   applyAction(state, action, now) -> new state
 *
 * It never mutates its input, never reads the wall clock, and only uses the
 * seeded RNG stored in the state, so the same code can run on the client for
 * instant feedback and on a future server as the source of truth.
 */
import {
  type Color, type Move, type Position, type PromotionPiece,
  START_FEN, canColorMate, castlingFen, hasLegalMove, inCheck, insufficientMaterial,
  legalMoves, makeMove, other, parseFen, placementFen, typeOf, moveToSan,
  FLAG_CAPTURE, FLAG_DOUBLE,
} from './chess';
import { type ActionKind, type Card, type CardKind, type RulesVersion, REVERSE_LIMIT, RULES_VERSION, buildDeck, isActionKind, shuffle } from './cards';

export type PlayerId = 0 | 1;
export type Phase = 'start' | 'overflow' | 'moving' | 'over';

export type ResultReason =
  | 'checkmate' | 'timeout' | 'resign' | 'stalemate' | 'threefold'
  | 'fifty-move' | 'insufficient' | 'agreement' | 'timeout-vs-insufficient';

export interface GameResult {
  winner: PlayerId | null;
  reason: ResultReason;
}

export interface PlayerInfo {
  name: string;
  kind: 'human' | 'bot';
}

export interface GameConfig {
  seed?: number;
  /** Per-player clock in ms. Default 10 minutes. */
  clockMs?: number;
  /** Grace period after a card is revealed (animation time). Default 1000ms. */
  graceMs?: number;
  /** Starting position (side to move = FEN side). Default: standard start. */
  fen?: string;
  /** Rig the draw pile, top card first (tests / tutorials). Remaining cards are not added. */
  deckOrder?: CardKind[];
  players?: [PlayerInfo, PlayerInfo];
  /** Colour played by player 0. Default White. */
  player0Color?: Color;
  /** Cap White's opening turn at 1 move (§2.6). Default: true for the standard start. */
  openingCap?: boolean;
  /** Turns each player must finish before Reverse is allowed (§2.8). Default 5. */
  reverseProtectionTurns?: number;
  /** Max held action cards (§2.4). Default 2. */
  handLimit?: number;
  /** Rules version (deck mix + Reverse limit). Default: the current version (2). */
  rules?: RulesVersion;
  /** Reverses each player may play per game; null = unlimited. Default from the rules version (v2: 1). */
  reverseLimit?: number | null;
}

export type GameEvent =
  | { type: 'turnStart'; player: PlayerId; color: Color; turn: number }
  | { type: 'draw'; player: PlayerId; card: Card; toHand: boolean; capped?: boolean }
  | { type: 'reshuffle'; count: number }
  | { type: 'playCard'; player: PlayerId; card: Card }
  | { type: 'discardCard'; player: PlayerId; card: Card }
  /** A dead card went straight to the discard pile: a Reverse after the player used up their Reverses. */
  | { type: 'burnCard'; player: PlayerId; card: Card; from: 'deck' | 'hand' }
  | { type: 'move'; player: PlayerId; color: Color; move: Move; san: string; index: number }
  | { type: 'skipped'; player: PlayerId }
  | { type: 'skipCancelled'; player: PlayerId }
  | { type: 'reverse'; player: PlayerId; colors: [Color, Color] }
  | { type: 'turnEnd'; player: PlayerId; reason: 'moves' | 'check' | 'no-moves' | 'reverse' }
  | { type: 'gameOver'; result: GameResult };

export interface TurnRecord {
  turn: number;
  player: PlayerId;
  color: Color;
  card?: CardKind;
  /** True when White's opening cap reduced the card to 1 move. */
  capped?: boolean;
  played: ActionKind[];
  toHand: ActionKind[];
  discarded: ActionKind[];
  /** Dead Reverse cards discarded this turn (drawn after the player's Reverse was used up, or left in hand). */
  burned?: ActionKind[];
  moves: string[];
  skipped?: boolean;
  endedByCheck?: boolean;
}

export interface GameState {
  config: { clockMs: number; graceMs: number; reverseProtectionTurns: number; handLimit: number; rules: RulesVersion; reverseLimit: number | null };
  players: [PlayerInfo, PlayerInfo];
  pos: Position;
  colorOf: [Color, Color];
  current: PlayerId;
  phase: Phase;
  /** Turns started so far (skipped turns don't count). */
  turnNumber: number;
  turnsCompleted: [number, number];
  openingCapPending: boolean;
  isOpeningTurn: boolean;
  hands: [Card[], Card[]];
  /** Draw pile; the top card is the LAST element. */
  drawPile: Card[];
  discard: Card[];
  rng: number;
  card: Card | null;
  movesAllowed: number;
  movesMade: number;
  overflowCard: Card | null;
  actionPlayedThisTurn: boolean;
  pendingSkip: PlayerId | null;
  reverseBlockedFor: PlayerId | null;
  /** Reverses each player has played. */
  reversesUsed: [number, number];
  /** Double push made as the last move of the previous move-turn (for en passant). */
  epCarry: { square: number; color: Color } | null;
  turnLastDouble: { square: number; color: Color } | null;
  turnProgress: boolean;
  /** Moves made in the current (or, between turns, the previous) turn — for highlights. */
  turnMoves: Move[];
  lastTurnMoves: Move[];
  noProgressTurns: number;
  repetition: Record<string, number>;
  clocks: [number, number];
  /** Timestamp from which the current player's clock is running; may be in the future during grace. */
  clockSince: number | null;
  paused: boolean;
  result: GameResult | null;
  events: GameEvent[];
  history: TurnRecord[];
}

export type GameAction =
  | { type: 'draw'; player: PlayerId }
  | { type: 'playCard'; player: PlayerId; cardId: number }
  | { type: 'resolveOverflow'; player: PlayerId; choice: 'play' | { discardId: number } }
  | { type: 'move'; player: PlayerId; from: number; to: number; promotion?: PromotionPiece }
  | { type: 'resign'; player: PlayerId }
  | { type: 'agreeDraw' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'tick' };

export class IllegalActionError extends Error {}

const opp = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

let cardIdCounter = 1000;

export function createGame(cfg: GameConfig = {}, now = 0): GameState {
  const fen = cfg.fen ?? START_FEN;
  const { pos, turn } = parseFen(fen);
  pos.ep = -1; // en passant availability is managed by epCarry
  const p0 = cfg.player0Color ?? 'w';
  const colorOf: [Color, Color] = [p0, other(p0)];
  const current: PlayerId = colorOf[0] === turn ? 0 : 1;
  let rng = (cfg.seed ?? Math.floor(Math.random() * 2 ** 31)) | 0;
  const rules = cfg.rules ?? RULES_VERSION;
  let drawPile: Card[];
  if (cfg.deckOrder) {
    drawPile = cfg.deckOrder.map((kind) => ({ id: cardIdCounter++, kind })).reverse();
  } else {
    [drawPile, rng] = shuffle(buildDeck(rules), rng);
  }
  const clockMs = cfg.clockMs ?? 10 * 60 * 1000;
  const s: GameState = {
    config: {
      clockMs,
      graceMs: cfg.graceMs ?? 1000,
      reverseProtectionTurns: cfg.reverseProtectionTurns ?? 5,
      handLimit: cfg.handLimit ?? 2,
      rules,
      reverseLimit: cfg.reverseLimit !== undefined ? cfg.reverseLimit : REVERSE_LIMIT[rules],
    },
    players: cfg.players ?? [{ name: 'Player 1', kind: 'human' }, { name: 'Player 2', kind: 'human' }],
    pos,
    colorOf,
    current,
    phase: 'start',
    turnNumber: 0,
    turnsCompleted: [0, 0],
    openingCapPending: cfg.openingCap ?? (fen === START_FEN),
    isOpeningTurn: false,
    hands: [[], []],
    drawPile,
    discard: [],
    rng,
    card: null,
    movesAllowed: 0,
    movesMade: 0,
    overflowCard: null,
    actionPlayedThisTurn: false,
    pendingSkip: null,
    reverseBlockedFor: null,
    reversesUsed: [0, 0],
    epCarry: null,
    turnLastDouble: null,
    turnProgress: false,
    turnMoves: [],
    lastTurnMoves: [],
    noProgressTurns: 0,
    repetition: {},
    clocks: [clockMs, clockMs],
    clockSince: null,
    paused: false,
    result: null,
    events: [],
    history: [],
  };
  startTurn(s, now);
  return s;
}

// ---------------------------------------------------------------- queries

export const currentColor = (s: GameState): Color => s.colorOf[s.current];
export const playerOfColor = (s: GameState, c: Color): PlayerId => (s.colorOf[0] === c ? 0 : 1);

/** Clock remaining for a player at time `now` (does not mutate). */
export function remainingMs(s: GameState, player: PlayerId, now: number): number {
  let ms = s.clocks[player];
  if (player === s.current && s.phase !== 'over' && !s.paused && s.clockSince !== null && now > s.clockSince) {
    ms -= now - s.clockSince;
  }
  return Math.max(0, ms);
}

/** True once a player has played all the Reverses the rules allow (v2: one per game). */
export function reverseExhausted(s: GameState, player: PlayerId): boolean {
  const limit = s.config.reverseLimit ?? null;
  return limit !== null && (s.reversesUsed?.[player] ?? 0) >= limit;
}

export function canPlayCard(s: GameState, player: PlayerId, kind: ActionKind): boolean {
  if (s.phase === 'over' || player !== s.current) return false;
  if (s.actionPlayedThisTurn || s.isOpeningTurn) return false;
  if (kind === 'reverse') {
    if (reverseExhausted(s, player)) return false;
    const need = s.config.reverseProtectionTurns;
    if (s.turnsCompleted[0] < need || s.turnsCompleted[1] < need) return false;
    if (s.reverseBlockedFor === player) return false;
  }
  return true;
}

/** Why a held card can't be played right now (for UI tooltips), or null. */
export function cardBlockReason(s: GameState, player: PlayerId, kind: ActionKind): string | null {
  if (s.isOpeningTurn) return 'Held cards unlock on your second turn';
  if (s.actionPlayedThisTurn) return 'One action card per turn';
  if (kind === 'reverse') {
    if (reverseExhausted(s, player)) return 'You’ve used your Reverse (one per game)';
    const need = s.config.reverseProtectionTurns;
    if (s.turnsCompleted[0] < need || s.turnsCompleted[1] < need) {
      const left = Math.max(need - s.turnsCompleted[0], need - s.turnsCompleted[1]);
      return `Reverse unlocks after ${need} turns each (${left} to go)`;
    }
    if (s.reverseBlockedFor === player) return "Can't Reverse straight back";
  }
  return null;
}

/** Legal moves available to the current player right now (empty unless in the moving phase). */
export function currentLegalMoves(s: GameState): Move[] {
  if (s.phase !== 'moving') return [];
  return legalMoves(s.pos, currentColor(s));
}

// ---------------------------------------------------------------- reducer

export function applyAction(prev: GameState, action: GameAction, now: number): GameState {
  if (prev.phase === 'over') {
    if (action.type === 'tick' || action.type === 'pause' || action.type === 'resume') return prev;
    throw new IllegalActionError('Game is over');
  }
  const s: GameState = structuredClone(prev);
  if (action.type === 'resume') {
    if (s.paused) {
      s.paused = false;
      s.clockSince = Math.max(now, s.clockSince ?? now);
    }
    return s;
  }
  if (s.paused) {
    if (action.type === 'tick' || action.type === 'pause') return prev;
    if (action.type !== 'resign' && action.type !== 'agreeDraw') throw new IllegalActionError('Game is paused');
  } else {
    settleClock(s, now);
    if (checkFlag(s)) return s;
  }

  switch (action.type) {
    case 'tick':
      return s;
    case 'pause':
      s.paused = true;
      return s;
    case 'resign':
      finish(s, { winner: opp(action.player), reason: 'resign' });
      return s;
    case 'agreeDraw':
      finish(s, { winner: null, reason: 'agreement' });
      return s;
    case 'playCard': {
      assertTurn(s, action.player, 'start');
      const hand = s.hands[action.player];
      const idx = hand.findIndex((c) => c.id === action.cardId);
      if (idx < 0) throw new IllegalActionError('Card not in hand');
      const card = hand[idx];
      if (!isActionKind(card.kind) || !canPlayCard(s, action.player, card.kind)) {
        throw new IllegalActionError(cardBlockReason(s, action.player, card.kind as ActionKind) ?? 'Cannot play card');
      }
      hand.splice(idx, 1);
      playActionCard(s, card, now);
      return s;
    }
    case 'draw':
      assertTurn(s, action.player, 'start');
      drawUntilNumber(s, now);
      return s;
    case 'resolveOverflow': {
      assertTurn(s, action.player, 'overflow');
      const card = s.overflowCard!;
      if (action.choice === 'play') {
        if (!isActionKind(card.kind) || !canPlayCard(s, action.player, card.kind)) {
          throw new IllegalActionError('That card cannot be played now');
        }
        s.overflowCard = null;
        s.phase = 'start';
        playActionCard(s, card, now);
        if (s.phase === 'start') drawUntilNumber(s, now);
        return s;
      }
      const hand = s.hands[action.player];
      const rec = s.history[s.history.length - 1];
      if (action.choice.discardId === card.id) {
        s.discard.push(card);
        s.events.push({ type: 'discardCard', player: action.player, card });
        rec.discarded.push(card.kind as ActionKind);
      } else {
        const idx = hand.findIndex((c) => c.id === (action.choice as { discardId: number }).discardId);
        if (idx < 0) throw new IllegalActionError('Card not in hand');
        const [old] = hand.splice(idx, 1);
        s.discard.push(old);
        s.events.push({ type: 'discardCard', player: action.player, card: old });
        rec.discarded.push(old.kind as ActionKind);
        hand.push(card);
      }
      s.overflowCard = null;
      s.phase = 'start';
      drawUntilNumber(s, now);
      return s;
    }
    case 'move': {
      assertTurn(s, action.player, 'moving');
      const color = currentColor(s);
      const candidates = legalMoves(s.pos, color).filter((m) => m.from === action.from && m.to === action.to);
      if (!candidates.length) throw new IllegalActionError('Illegal move');
      let move = candidates[0];
      if (candidates.length > 1 || move.promotion) {
        const found = candidates.find((m) => m.promotion === (action.promotion ?? 'q'));
        if (!found) throw new IllegalActionError('Bad promotion');
        move = found;
      }
      applyMove(s, move, now);
      return s;
    }
  }
}

function assertTurn(s: GameState, player: PlayerId, phase: Phase) {
  if (player !== s.current) throw new IllegalActionError('Not your turn');
  if (s.phase !== phase) throw new IllegalActionError(`Expected phase ${phase}, got ${s.phase}`);
}

function settleClock(s: GameState, now: number) {
  if (s.clockSince === null || s.paused || s.phase === 'over') return;
  if (now > s.clockSince) {
    s.clocks[s.current] -= now - s.clockSince;
    s.clockSince = now;
  }
}

function checkFlag(s: GameState): boolean {
  if (s.clocks[s.current] > 0) return false;
  s.clocks[s.current] = 0;
  const winner = opp(s.current);
  if (!canColorMate(s.pos.board, s.colorOf[winner])) finish(s, { winner: null, reason: 'timeout-vs-insufficient' });
  else finish(s, { winner, reason: 'timeout' });
  return true;
}

function finish(s: GameState, result: GameResult) {
  s.phase = 'over';
  s.result = result;
  s.clockSince = null;
  s.events.push({ type: 'gameOver', result });
}

function repetitionKey(s: GameState): string {
  const hands = s.hands.map((h) => h.map((c) => c.kind).sort().join(',')).join('|');
  return `${placementFen(s.pos.board)} ${currentColor(s)} ${castlingFen(s.pos.castling)} ${s.pos.ep} p${s.current} ${hands}`;
}

function startTurn(s: GameState, now: number) {
  // Resolve a pending Skip (§2.5: check cancels Skip).
  if (s.pendingSkip === s.current) {
    s.pendingSkip = null;
    const color = currentColor(s);
    if (inCheck(s.pos, color)) {
      s.events.push({ type: 'skipCancelled', player: s.current });
    } else {
      s.events.push({ type: 'skipped', player: s.current });
      s.history.push({ turn: s.turnNumber, player: s.current, color, played: [], toHand: [], discarded: [], moves: [], skipped: true });
      if (s.reverseBlockedFor === s.current) s.reverseBlockedFor = null;
      s.current = opp(s.current);
      return startTurn(s, now);
    }
  }

  const color = currentColor(s);
  s.turnNumber++;
  s.phase = 'start';
  s.card = null;
  s.movesAllowed = 0;
  s.movesMade = 0;
  s.overflowCard = null;
  s.actionPlayedThisTurn = false;
  s.turnMoves = [];
  s.turnLastDouble = null;
  s.turnProgress = false;
  s.isOpeningTurn = s.openingCapPending && color === 'w';
  s.pos.ep = s.epCarry && s.epCarry.color !== color ? s.epCarry.square : -1;
  s.clockSince = now;
  s.events.push({ type: 'turnStart', player: s.current, color, turn: s.turnNumber });
  s.history.push({ turn: s.turnNumber, player: s.current, color, played: [], toHand: [], discarded: [], moves: [] });

  if (insufficientMaterial(s.pos.board)) return finish(s, { winner: null, reason: 'insufficient' });
  const key = repetitionKey(s);
  s.repetition[key] = (s.repetition[key] ?? 0) + 1;
  if (s.repetition[key] >= 3) return finish(s, { winner: null, reason: 'threefold' });
  if (!hasLegalMove(s.pos, color)) {
    if (inCheck(s.pos, color)) return finish(s, { winner: opp(s.current), reason: 'checkmate' });
    return finish(s, { winner: null, reason: 'stalemate' });
  }
}

function playActionCard(s: GameState, card: Card, now: number) {
  const player = s.current;
  s.discard.push(card);
  s.actionPlayedThisTurn = true;
  s.events.push({ type: 'playCard', player, card });
  s.history[s.history.length - 1].played.push(card.kind as ActionKind);
  if (card.kind === 'skip') {
    s.pendingSkip = opp(player);
    return;
  }
  // Reverse: swap sides, the turn is used up (§2.4). Same colour moves next,
  // now controlled by the opponent. Clocks, hands and pending Skips stay with players.
  s.colorOf = [s.colorOf[1], s.colorOf[0]];
  s.events.push({ type: 'reverse', player, colors: [s.colorOf[0], s.colorOf[1]] });
  s.reverseBlockedFor = opp(player);
  s.reversesUsed[player]++;
  // Reverses still in hand are now dead: discard them so they don't block the hand.
  if (reverseExhausted(s, player)) {
    const hand = s.hands[player];
    for (const c of hand.filter((x) => x.kind === 'reverse')) burn(s, player, c, 'hand');
    s.hands[player] = hand.filter((x) => x.kind !== 'reverse');
  }
  endTurn(s, 'reverse', now);
}

function burn(s: GameState, player: PlayerId, card: Card, from: 'deck' | 'hand') {
  s.discard.push(card);
  s.events.push({ type: 'burnCard', player, card, from });
  const rec = s.history[s.history.length - 1];
  (rec.burned ??= []).push(card.kind as ActionKind);
}

function drawUntilNumber(s: GameState, now: number) {
  const player = s.current;
  const rec = s.history[s.history.length - 1];
  for (;;) {
    if (!s.drawPile.length) {
      if (!s.discard.length) throw new Error('Deck exhausted');
      const [pile, rng] = shuffle(s.discard, s.rng);
      s.drawPile = pile;
      s.rng = rng;
      s.discard = [];
      s.events.push({ type: 'reshuffle', count: pile.length });
    }
    const card = s.drawPile.pop()!;
    // A Reverse drawn after yours is used up is dead: it's discarded and you draw again.
    if (card.kind === 'reverse' && reverseExhausted(s, player)) {
      burn(s, player, card, 'deck');
      continue;
    }
    if (isActionKind(card.kind)) {
      if (s.hands[player].length < s.config.handLimit) {
        s.hands[player].push(card);
        rec.toHand.push(card.kind);
        s.events.push({ type: 'draw', player, card, toHand: true });
        continue;
      }
      s.overflowCard = card;
      s.phase = 'overflow';
      rec.toHand.push(card.kind);
      s.events.push({ type: 'draw', player, card, toHand: true });
      return;
    }
    const n = Number(card.kind);
    const capped = s.isOpeningTurn && n > 1;
    s.card = card;
    s.movesAllowed = s.isOpeningTurn ? 1 : n;
    s.movesMade = 0;
    s.phase = 'moving';
    rec.card = card.kind;
    if (capped) rec.capped = true;
    s.events.push({ type: 'draw', player, card, toHand: false, capped });
    // Clock pauses briefly while the card reveal animates (§3 step 4).
    s.clockSince = Math.max(now, s.clockSince ?? now) + s.config.graceMs;
    return;
  }
}

function applyMove(s: GameState, move: Move, now: number) {
  const player = s.current;
  const color = currentColor(s);
  const san = moveToSan(s.pos, move, color);
  s.pos = makeMove(s.pos, move);
  s.pos.ep = -1; // en passant only on the first move of a turn (§2.7)
  s.turnLastDouble = move.flags & FLAG_DOUBLE ? { square: (move.from + move.to) >> 1, color } : null;
  if (typeOf(move.piece) === 'p' || move.flags & FLAG_CAPTURE) s.turnProgress = true;
  s.movesMade++;
  s.turnMoves.push(move);
  s.history[s.history.length - 1].moves.push(san);
  s.events.push({ type: 'move', player, color, move, san, index: s.movesMade });

  if (insufficientMaterial(s.pos.board)) return finish(s, { winner: null, reason: 'insufficient' });
  if (inCheck(s.pos, other(color))) {
    s.history[s.history.length - 1].endedByCheck = true;
    return endTurn(s, 'check', now);
  }
  if (s.movesMade >= s.movesAllowed) return endTurn(s, 'moves', now);
  if (!hasLegalMove(s.pos, color)) return endTurn(s, 'no-moves', now);
}

function endTurn(s: GameState, reason: 'moves' | 'check' | 'no-moves' | 'reverse', now: number) {
  const player = s.current;
  settleClock(s, now);
  s.events.push({ type: 'turnEnd', player, reason });
  if (reason !== 'reverse') {
    s.epCarry = s.turnLastDouble;
    s.noProgressTurns = s.turnProgress ? 0 : s.noProgressTurns + 1;
    s.lastTurnMoves = s.turnMoves;
    if (s.isOpeningTurn) s.openingCapPending = false;
  }
  if (s.card) {
    s.discard.push(s.card);
    s.card = null;
  }
  s.turnsCompleted[player]++;
  if (s.reverseBlockedFor === player && reason !== 'reverse') s.reverseBlockedFor = null;
  if (reason !== 'reverse') {
    const enemy = other(s.colorOf[player]);
    if (inCheck(s.pos, enemy) && !hasLegalMove(s.pos, enemy)) {
      return finish(s, { winner: player, reason: 'checkmate' });
    }
    // 50-move rule adapted to turns (§2.7): 50 turns each without capture or pawn move.
    if (s.noProgressTurns >= 100) return finish(s, { winner: null, reason: 'fifty-move' });
  }
  s.current = opp(player);
  startTurn(s, now);
}

/** Extended PGN-like turn notation (§2.9), e.g. "[3] e4 Nf3 Bc4", "{Reverse}". */
export function formatTurn(t: TurnRecord): string {
  if (t.skipped) return '— skipped —';
  const parts: string[] = [];
  for (const p of t.played) parts.push(p === 'skip' ? '{Skip}' : '{Reverse}');
  for (const h of t.toHand) parts.push(`[${h === 'skip' ? 'Skip' : 'Reverse'}->hand]`);
  for (const b of t.burned ?? []) parts.push(`[${b === 'skip' ? 'Skip' : 'Reverse'}-burned]`);
  if (t.card) parts.push(`[${t.card}${t.capped ? '->1' : ''}]`);
  parts.push(...t.moves);
  return parts.join(' ');
}
