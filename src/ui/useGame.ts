import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LocalTransport, type GameTransport } from '../net/transport';
import { remainingMs, type GameAction, type GameState, type PlayerId } from '../rules/game';
import type { Color, Move } from '../rules/chess';
import { askBot } from '../engine/botClient';
import type { BotLevel } from '../engine/bot';

export type GameMode = 'pass' | 'bot' | 'online';

export interface GameSetup {
  mode: GameMode;
  botLevel: BotLevel;
  /** Colour of the human in vs-bot mode (player 0). */
  humanColor: Color;
  names?: [string, string];
  seed?: number;
}

export const BOT_NAMES: Record<BotLevel, string> = { easy: 'Pawn Bot', medium: 'Knight Bot', hard: 'Rook Bot' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useGame(setup: GameSetup, gameKey: number, external?: GameTransport) {
  const transport = useMemo<GameTransport>(() => external ?? new LocalTransport({
    seed: setup.seed,
    player0Color: setup.mode === 'bot' ? setup.humanColor : 'w',
    players: setup.mode === 'bot'
      ? [{ name: 'You', kind: 'human' }, { name: BOT_NAMES[setup.botLevel], kind: 'bot' }]
      : [{ name: setup.names?.[0] ?? 'Player 1', kind: 'human' }, { name: setup.names?.[1] ?? 'Player 2', kind: 'human' }],
  }), // eslint-disable-next-line react-hooks/exhaustive-deps
  [gameKey, external]);
  const clock = useCallback(() => (transport.now ? transport.now() : Date.now()), [transport]);

  const [state, setState] = useState<GameState>(() => transport.getState());
  const [now, setNow] = useState(() => clock());
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    setState(transport.getState());
    stateRef.current = transport.getState();
    return transport.subscribe((s) => {
      stateRef.current = s;
      setState(s);
    });
  }, [transport]);

  const dispatch = useCallback((action: GameAction) => {
    const err = transport.send(action);
    if (err) {
      setError(err);
      setTimeout(() => setError(null), 2200);
    }
    return !err;
  }, [transport]);

  // Clock display + flag detection.
  useEffect(() => {
    const id = setInterval(() => {
      const t = clock();
      setNow(t);
      const s = stateRef.current;
      // Online games: the server runs the clocks and decides flag fall.
      if (!external && s.phase !== 'over' && !s.paused && remainingMs(s, s.current as PlayerId, t) <= 0) transport.send({ type: 'tick' });
    }, 100);
    return () => clearInterval(id);
  }, [transport, clock, external]);

  // Bot driver.
  const plan = useRef<{ turn: number; moves: Move[] } | null>(null);
  const busy = useRef<string | null>(null);
  const [kick, setKick] = useState(0);
  useEffect(() => {
    const s = state;
    if (setup.mode !== 'bot' || s.phase === 'over' || s.paused) return;
    if (s.players[s.current].kind !== 'bot') return;
    const key = `${s.turnNumber}:${s.phase}:${s.movesMade}:${s.hands[s.current].length}:${s.actionPlayedThisTurn}`;
    if (busy.current === key) return;
    busy.current = key;
    const stale = () => {
      if (stateRef.current === s) return false;
      busy.current = null;
      setKick((k) => k + 1);
      return true;
    };
    (async () => {
      if (s.phase === 'moving') {
        if (plan.current?.turn !== s.turnNumber || !plan.current.moves.length) {
          const [res] = await Promise.all([askBot(s, setup.botLevel), sleep(1150)]);
          plan.current = { turn: s.turnNumber, moves: Array.isArray(res) ? res : [] };
        } else {
          await sleep(650);
        }
        if (stale()) return;
        const m = plan.current.moves.shift();
        if (m && dispatchOk(m)) return;
        // Plan went stale (shouldn't happen) — replan from scratch.
        const res = await askBot(stateRef.current, setup.botLevel);
        if (Array.isArray(res) && res[0]) {
          plan.current = { turn: s.turnNumber, moves: res.slice(1) };
          dispatchOk(res[0]);
        }
        return;
      }
      await sleep(s.phase === 'start' ? 750 : 900);
      if (stale()) return;
      const res = await askBot(s, setup.botLevel);
      if (stale()) return;
      if (res && !Array.isArray(res)) dispatch(res);
    })();
    function dispatchOk(m: Move) {
      const cur = stateRef.current;
      return transport.send({ type: 'move', player: cur.current, from: m.from, to: m.to, promotion: m.promotion }) === null;
    }
  }, [state, kick, setup.mode, setup.botLevel, dispatch, transport]);

  return { state, now, dispatch, error };
}
