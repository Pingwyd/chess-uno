import { useEffect, useState } from 'react';
import { Home } from './Home';
import { GameScreen } from './GameScreen';
import { OnlineScreen, type OnlineIntent } from './OnlineScreen';
import { normalizeCode } from '../net/protocol';
import { PieceDefs, type PieceSet } from './pieces';
import { setSoundEnabled } from './sound';
import type { GameSetup } from './useGame';

const load = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
};

/** Optional `?seed=123` for reproducible decks (bug reports, demos, screenshots). */
const urlSeed = (() => {
  const v = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('seed') : null;
  return v && /^\d+$/.test(v) ? Number(v) : undefined;
})();

/** `?join=CODE` (invite link) or `?watch=CODE` (spectator link) open the online screen directly. */
const urlIntent: OnlineIntent = (() => {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search);
  const join = q.get('join');
  const watch = q.get('watch');
  if (join) return { kind: 'join', code: normalizeCode(join) };
  if (watch) return { kind: 'watch', code: normalizeCode(watch) };
  return null;
})();

const clearUrlIntent = () => {
  if (!urlIntent) return;
  const u = new URL(location.href);
  u.searchParams.delete('join');
  u.searchParams.delete('watch');
  history.replaceState(null, '', u.toString());
};

export function App() {
  const [setup, setSetup] = useState<GameSetup | null>(null);
  const [online, setOnline] = useState<boolean>(!!urlIntent);
  useEffect(clearUrlIntent, []);
  const [pieceSet, setPieceSet] = useState<PieceSet>(() => load('cu.pieceSet', 'arcane'));
  const [sound, setSound] = useState<boolean>(() => load('cu.sound', true));

  useEffect(() => { localStorage.setItem('cu.pieceSet', JSON.stringify(pieceSet)); }, [pieceSet]);
  useEffect(() => { localStorage.setItem('cu.sound', JSON.stringify(sound)); setSoundEnabled(sound); }, [sound]);

  return (
    <div className="app">
      <PieceDefs />
      <div className="bg-sparks" aria-hidden="true" />
      {online ? (
        <OnlineScreen
          pieceSet={pieceSet}
          onTogglePieces={() => setPieceSet((p) => (p === 'arcane' ? 'classic' : 'arcane'))}
          onHome={() => setOnline(false)}
          intent={urlIntent}
        />
      ) : setup ? (
        <GameScreen
          setup={setup}
          pieceSet={pieceSet}
          onTogglePieces={() => setPieceSet((p) => (p === 'arcane' ? 'classic' : 'arcane'))}
          onHome={() => setSetup(null)}
        />
      ) : (
        <Home pieceSet={pieceSet} sound={sound} onPieceSet={setPieceSet} onSound={setSound} onStart={(cfg) => setSetup({ ...cfg, seed: cfg.seed ?? urlSeed })} onOnline={() => setOnline(true)} />
      )}
    </div>
  );
}
