import { useEffect, useState } from 'react';
import { Home } from './Home';
import { GameScreen } from './GameScreen';
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

export function App() {
  const [setup, setSetup] = useState<GameSetup | null>(null);
  const [pieceSet, setPieceSet] = useState<PieceSet>(() => load('cu.pieceSet', 'arcane'));
  const [sound, setSound] = useState<boolean>(() => load('cu.sound', true));

  useEffect(() => { localStorage.setItem('cu.pieceSet', JSON.stringify(pieceSet)); }, [pieceSet]);
  useEffect(() => { localStorage.setItem('cu.sound', JSON.stringify(sound)); setSoundEnabled(sound); }, [sound]);

  return (
    <div className="app">
      <PieceDefs />
      <div className="bg-sparks" aria-hidden="true" />
      {setup ? (
        <GameScreen
          setup={setup}
          pieceSet={pieceSet}
          onTogglePieces={() => setPieceSet((p) => (p === 'arcane' ? 'classic' : 'arcane'))}
          onHome={() => setSetup(null)}
        />
      ) : (
        <Home pieceSet={pieceSet} sound={sound} onPieceSet={setPieceSet} onSound={setSound} onStart={(cfg) => setSetup({ ...cfg, seed: cfg.seed ?? urlSeed })} />
      )}
    </div>
  );
}
