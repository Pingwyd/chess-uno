/**
 * Transport seam for future online play. The UI only talks to a GameTransport:
 * - LocalTransport (today): applies actions with the shared rules reducer on-device
 *   (Pass & Play, vs. Bot, offline).
 * - A future SocketTransport will send action intents to the authoritative server
 *   (design doc §11.2) and receive state snapshots; the UI stays unchanged.
 */
import { applyAction, createGame, type GameAction, type GameConfig, type GameState } from '../rules/game';

export interface GameTransport {
  getState(): GameState;
  /** Send an action; resolves to an error message if it was rejected. */
  send(action: GameAction): string | null;
  subscribe(listener: (s: GameState) => void): () => void;
}

export class LocalTransport implements GameTransport {
  private state: GameState;
  private listeners = new Set<(s: GameState) => void>();
  private readonly clock: () => number;

  constructor(config: GameConfig, clock: () => number = () => Date.now()) {
    this.clock = clock;
    this.state = createGame(config, clock());
  }

  getState() {
    return this.state;
  }

  send(action: GameAction): string | null {
    try {
      const next = applyAction(this.state, action, this.clock());
      if (next !== this.state) {
        this.state = next;
        this.listeners.forEach((l) => l(next));
      }
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  subscribe(listener: (s: GameState) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
