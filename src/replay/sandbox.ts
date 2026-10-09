/**
 * "Try it yourself": play on from a reviewed position against the engine. The sandbox starts
 * from the full (unredacted) replay state at the start of a turn, so the same card is in hand
 * and the deck order is unchanged. Clocks are effectively off, nothing is saved, and every
 * turn of yours is a checkpoint for Undo; Reset returns to the reviewed position.
 */
import { applyAction, type GameAction, type GameState, type PlayerId } from '../rules/game';
import type { GameTransport } from '../net/transport';

/** Long enough that nobody flags in a sandbox (the clock is hidden there). */
export const SANDBOX_CLOCK_MS = 24 * 60 * 60_000;

/** The replay position, re-seated: `human` plays on, the other seat becomes the engine. */
export function sandboxStart(from: GameState, human: PlayerId, botName: string, now: number): GameState {
  const players = from.players.map((_p, i) => (i === human ? { name: 'You', kind: 'human' as const } : { name: botName, kind: 'bot' as const })) as GameState['players'];
  return {
    ...from,
    players,
    clocks: [SANDBOX_CLOCK_MS, SANDBOX_CLOCK_MS],
    clockSince: from.clockSince === null ? null : now,
    paused: false,
    result: null,
    events: from.events.slice(),
  };
}

const actor = (a: GameAction): PlayerId | null => ('player' in a ? a.player : null);

export class SandboxTransport implements GameTransport {
  private state: GameState;
  private readonly initial: GameState;
  /** States just before each of your turns (newest last). */
  private checkpoints: GameState[] = [];
  private listeners = new Set<(s: GameState) => void>();

  constructor(start: GameState, readonly human: PlayerId, private clock: () => number = () => Date.now()) {
    this.initial = start;
    this.state = start;
  }

  getState() { return this.state; }

  send(action: GameAction): string | null {
    if (action.type === 'pause' || action.type === 'resume') return null;
    try {
      const prev = this.state;
      const next = applyAction(prev, action, this.clock());
      if (next === prev) return null;
      const top = this.checkpoints[this.checkpoints.length - 1];
      if (actor(action) === this.human && (!top || top.turnNumber !== prev.turnNumber)) {
        this.checkpoints.push(prev);
      }
      this.set(next);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  /** Take back your last turn (and the engine's reply after it). */
  undo(): boolean {
    const cp = this.checkpoints.pop();
    if (!cp) return false;
    this.set(this.restamp(cp));
    return true;
  }

  canUndo() { return this.checkpoints.length > 0; }

  /** Back to the reviewed position. */
  reset() {
    this.checkpoints = [];
    this.set(this.restamp(this.initial));
  }

  /** Restored states get a fresh clock start (time spent elsewhere doesn't count). */
  private restamp(s: GameState): GameState {
    return { ...s, clockSince: s.clockSince === null ? null : this.clock(), events: s.events.slice() };
  }

  private set(s: GameState) {
    this.state = s;
    this.listeners.forEach((l) => l(s));
  }

  subscribe(listener: (s: GameState) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  now() { return this.clock(); }
}
