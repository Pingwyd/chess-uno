/**
 * Transport seam for future online play. The UI only talks to a GameTransport:
 * - LocalTransport (today): applies actions with the shared rules reducer on-device
 *   (Pass & Play, vs. Bot, offline).
 * - OnlineTransport (src/net/online.ts) sends action intents to the authoritative
 *   server (design doc §11.2) and renders the snapshots it receives.
 */
import { applyAction, createGame, type GameAction, type GameConfig, type GameState } from '../rules/game';
import { logEntry, recordableConfig, type LoggedAction, type RecordConfig } from '../replay/record';

export interface GameTransport {
  getState(): GameState;
  /** Send an action; resolves to an error message if it was rejected. */
  send(action: GameAction): string | null;
  subscribe(listener: (s: GameState) => void): () => void;
  /** Clock source for display (server-synchronised for online games). */
  now?(): number;
}

export class LocalTransport implements GameTransport {
  private state: GameState;
  private listeners = new Set<(s: GameState) => void>();
  private readonly clock: () => number;
  /** Everything needed to replay this game exactly (see src/replay/record.ts). */
  readonly config: RecordConfig;
  readonly startedAt: number;
  readonly log: LoggedAction[] = [];

  constructor(config: GameConfig, clock: () => number = () => Date.now()) {
    this.clock = clock;
    this.config = recordableConfig(config);
    this.startedAt = clock();
    this.state = createGame(this.config, this.startedAt);
  }

  getState() {
    return this.state;
  }

  send(action: GameAction): string | null {
    try {
      const at = this.clock();
      const next = applyAction(this.state, action, at);
      if (next !== this.state) {
        this.log.push(logEntry(this.state, action, at));
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
