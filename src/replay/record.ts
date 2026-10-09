/**
 * Game records for replay and review.
 *
 * The rules reducer is deterministic: the same config (with its deck seed), the
 * same start time and the same timestamped actions always produce the same
 * states. So a finished game is stored as that action log, and the replay viewer
 * and the review bot rebuild every intermediate state from it.
 */
import {
  applyAction, createGame, remainingMs,
  type GameAction, type GameConfig, type GameEvent, type GameResult, type GameState, type PlayerId, type PlayerInfo,
} from '../rules/game';
import type { Color, Move } from '../rules/chess';
import type { ActionKind, CardKind } from '../rules/cards';

export type RecordMode = 'bot' | 'pass' | 'online';

export interface LoggedAction {
  /** Timestamp (ms) the action was applied at. */
  at: number;
  action: GameAction;
  /** Kind of the card for playCard / discards, so a log stays readable even if card ids differ. */
  kind?: CardKind;
}

/** Config as stored: always with an explicit seed. */
export type RecordConfig = GameConfig & { seed: number; players: [PlayerInfo, PlayerInfo] };

export interface OnlineMeta {
  gameId: string;
  code: string;
  rated: boolean;
  /** Seat of the local viewer when the game was played on this device (null = spectator / shared link). */
  you: PlayerId | null;
  ratings?: [number | null, number | null];
  ratingChange?: [number, number] | null;
}

export interface GameRecord {
  v: 1;
  id: string;
  mode: RecordMode;
  config: RecordConfig;
  startedAt: number;
  endedAt: number;
  actions: LoggedAction[];
  result: GameResult | null;
  botLevel?: string;
  online?: OnlineMeta;
}

/** Short summary kept in the recent-games index. */
export interface GameSummary {
  id: string;
  mode: RecordMode;
  players: [string, string];
  colors: [Color, Color];
  result: GameResult | null;
  /** The device owner's seat (bot games: 0, online: your seat), or null for pass & play / spectating. */
  you: PlayerId | null;
  turns: number;
  endedAt: number;
  online?: { gameId: string; rated: boolean };
  botLevel?: string;
}

// ---------------------------------------------------------------- recording

let fallbackSeq = 0;
export const newRecordId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `g-${Date.now().toString(36)}-${(fallbackSeq++).toString(36)}`);

/** Fill in a random seed (and default players) so the config can be replayed exactly. */
export function recordableConfig(cfg: GameConfig): RecordConfig {
  return {
    ...cfg,
    seed: cfg.seed ?? Math.floor(Math.random() * 2 ** 31),
    players: cfg.players ?? [{ name: 'Player 1', kind: 'human' }, { name: 'Player 2', kind: 'human' }],
  };
}

/** Attach card kinds to card actions (so the log is self-describing). */
export function logEntry(state: GameState, action: GameAction, at: number): LoggedAction {
  if (action.type === 'playCard') {
    const card = state.hands[action.player].find((c) => c.id === action.cardId);
    return { at, action, kind: card?.kind };
  }
  if (action.type === 'resolveOverflow' && action.choice !== 'play') {
    const id = action.choice.discardId;
    const card = [...state.hands[action.player], ...(state.overflowCard ? [state.overflowCard] : [])].find((c) => c.id === id);
    return { at, action, kind: card?.kind };
  }
  return { at, action };
}

export function summarize(rec: GameRecord, final?: GameState): GameSummary {
  const s = final ?? replayFinal(rec);
  const you: PlayerId | null = rec.mode === 'bot' ? 0 : rec.mode === 'online' ? rec.online?.you ?? null : null;
  return {
    id: rec.id,
    mode: rec.mode,
    players: [rec.config.players[0].name, rec.config.players[1].name],
    colors: [rec.config.player0Color ?? 'w', rec.config.player0Color === 'b' ? 'w' : 'b'],
    result: rec.result,
    you,
    turns: s.history.filter((t) => !t.skipped).length,
    endedAt: rec.endedAt,
    online: rec.online ? { gameId: rec.online.gameId, rated: rec.online.rated } : undefined,
    botLevel: rec.botLevel,
  };
}

// ---------------------------------------------------------------- reconstruction

/** Re-map card ids if a logged id isn't in hand (e.g. rigged decks), using the logged kind. */
function resolveAction(s: GameState, e: LoggedAction): GameAction {
  const a = e.action;
  if (a.type === 'playCard' && !s.hands[a.player].some((c) => c.id === a.cardId) && e.kind) {
    const card = s.hands[a.player].find((c) => c.kind === e.kind);
    if (card) return { ...a, cardId: card.id };
  }
  if (a.type === 'resolveOverflow' && a.choice !== 'play' && e.kind) {
    const pool = [...s.hands[a.player], ...(s.overflowCard ? [s.overflowCard] : [])];
    const id = a.choice.discardId;
    if (!pool.some((c) => c.id === id)) {
      const card = s.overflowCard?.kind === e.kind ? s.overflowCard : pool.find((c) => c.kind === e.kind);
      if (card) return { ...a, choice: { discardId: card.id } };
    }
  }
  return a;
}

export type FrameKind = 'start' | 'draw' | 'card' | 'discard' | 'move' | 'end' | 'clock';

export interface Frame {
  /** State after this frame's action. `events` holds only the events this action produced. */
  state: GameState;
  /** Timestamp of the action (start time for the first frame). */
  at: number;
  action: GameAction | null;
  kind: FrameKind;
  /** History index of the turn this action belonged to. */
  turn: number;
  /** For move frames: the move and its SAN. */
  move?: Move;
  san?: string;
  /** 1-based move number within the turn. */
  moveIndex?: number;
}

export interface Replay {
  record: GameRecord;
  frames: Frame[];
  final: GameState;
  /** First frame index of each turn (history index). */
  turnStarts: number[];
  /** True when the rebuilt result matches the recorded one. */
  consistent: boolean;
}

const kindOf = (a: GameAction, events: GameEvent[]): FrameKind => {
  switch (a.type) {
    case 'draw': return 'draw';
    case 'playCard': return 'card';
    case 'resolveOverflow': return a.choice === 'play' ? 'card' : 'discard';
    case 'move': return 'move';
    case 'resign': case 'agreeDraw': return 'end';
    default: return events.some((e) => e.type === 'gameOver') ? 'end' : 'clock';
  }
};

/** Rebuild every state of a recorded game. Throws if an action is illegal (corrupt log). */
export function reconstruct(rec: GameRecord): Replay {
  let s = createGame(rec.config, rec.startedAt);
  const frames: Frame[] = [{ state: { ...s, events: s.events.slice() }, at: rec.startedAt, action: null, kind: 'start', turn: 0 }];
  for (const e of rec.actions) {
    const turn = s.history.length - 1;
    const before = s.events.length;
    const action = resolveAction(s, e);
    const next = applyAction(s, action, e.at);
    if (next === s) continue; // no-op (e.g. tick while paused)
    const fresh = next.events.slice(before);
    const mv = fresh.find((x): x is Extract<GameEvent, { type: 'move' }> => x.type === 'move');
    frames.push({
      state: { ...next, events: fresh },
      at: e.at,
      action,
      kind: kindOf(action, fresh),
      turn,
      ...(mv ? { move: mv.move, san: mv.san, moveIndex: mv.index } : {}),
    });
    s = next;
  }
  const turnStarts: number[] = [];
  frames.forEach((f, i) => {
    if (f.kind === 'start') { turnStarts[0] = 0; return; }
    if (turnStarts[f.turn] === undefined) turnStarts[f.turn] = i;
  });
  const consistent = JSON.stringify(s.result) === JSON.stringify(rec.result);
  return { record: rec, frames, final: s, turnStarts, consistent };
}

export function replayFinal(rec: GameRecord): GameState {
  let s = createGame(rec.config, rec.startedAt);
  for (const e of rec.actions) s = applyAction(s, resolveAction(s, e), e.at);
  return s;
}

/** Both clocks as they stood at a frame. */
export function clocksAt(f: Frame): [number, number] {
  return [remainingMs(f.state, 0, f.at), remainingMs(f.state, 1, f.at)];
}

/** Action cards the frame's events show being played (for Skip / Reverse banners). */
export function frameCards(f: Frame): ActionKind[] {
  return f.state.events.filter((e) => e.type === 'playCard').map((e) => (e as Extract<GameEvent, { type: 'playCard' }>).card.kind as ActionKind);
}

// ---------------------------------------------------------------- server logs

/** Shape of the server's stored log (server/src/room.ts exportLog). */
export interface ServerLog {
  version: number;
  seed: number;
  player0Color: Color;
  clockMs: number;
  graceMs?: number;
  startedAt?: number;
  players?: [PlayerInfo, PlayerInfo];
  actions: { at: number; seat: PlayerId; action: GameAction }[];
  result: GameResult | null;
}

export function fromServerLog(
  log: ServerLog,
  meta: { gameId: string; code: string; rated: boolean; names: [string, string]; createdAt: string; endedAt: string | null; ratings?: [number | null, number | null]; ratingChange?: [number, number] | null },
): GameRecord {
  const startedAt = log.startedAt ?? (log.actions[0]?.at ?? Date.parse(meta.createdAt));
  return {
    v: 1,
    id: `online-${meta.gameId}`,
    mode: 'online',
    config: {
      seed: log.seed,
      clockMs: log.clockMs,
      graceMs: log.graceMs ?? 1000,
      player0Color: log.player0Color,
      players: log.players ?? [{ name: meta.names[0], kind: 'human' }, { name: meta.names[1], kind: 'human' }],
    },
    startedAt,
    endedAt: meta.endedAt ? Date.parse(meta.endedAt) : (log.actions[log.actions.length - 1]?.at ?? startedAt),
    actions: log.actions.map((a) => ({ at: a.at, action: a.action })),
    result: log.result,
    online: { gameId: meta.gameId, code: meta.code, rated: meta.rated, you: null, ratings: meta.ratings, ratingChange: meta.ratingChange },
  };
}
