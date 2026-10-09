import { lazy, Suspense, useEffect, useState } from 'react';
import { Home } from './Home';
import { GameScreen } from './GameScreen';
import { OnlineScreen, type OnlineIntent } from './OnlineScreen';
import { normalizeCode } from '../net/protocol';
import { PieceDefs, type PieceSet } from './pieces';
import { setSoundEnabled } from './sound';
import { has3D, preload3D, type BoardMode } from './BoardView';
import type { GameSetup } from './useGame';
import type { LearnTab } from './learn/LearnScreen';
import { useProgress } from '../learn/store';
import { setActiveSkins } from './skins';
import type { ReplaySource } from './replay/ReplayScreen';

// The learning path (lessons, puzzles, path map) is its own chunk, loaded on first visit.
const LearnScreen = lazy(() => import('./learn/LearnScreen'));
// Replay viewer + review bot: its own chunk too (the analysis itself runs in a worker).
const ReplayScreen = lazy(() => import('./replay/ReplayScreen'));

interface ReplayView { src: ReplaySource; tab?: 'replay' | 'review'; back: 'home' | 'online' }

/** `?replay=<gameId>` opens a shared online replay. */
const urlReplay = (() => {
  if (typeof location === 'undefined') return null;
  const v = new URLSearchParams(location.search).get('replay');
  return v && /^[\w-]{6,64}$/.test(v) ? v : null;
})();

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
  const [replay, setReplay] = useState<ReplayView | null>(() => (urlReplay ? { src: { gameId: urlReplay }, back: 'home' } : null));
  const [learn, setLearn] = useState<LearnTab | null>(() => (typeof location !== 'undefined' && new URLSearchParams(location.search).has('learn') ? 'path' : null));
  const progress = useProgress();
  setActiveSkins(progress.skins);
  useEffect(clearUrlIntent, []);
  const [pieceSet, setPieceSet] = useState<PieceSet>(() => load('cu.pieceSet', 'arcane'));
  const [sound, setSound] = useState<boolean>(() => load('cu.sound', true));
  const [boardMode, setBoardMode] = useState<BoardMode>(() => (load<BoardMode>('cu.board', '2d') === '3d' && has3D() ? '3d' : '2d'));
  useEffect(() => { localStorage.setItem('cu.board', JSON.stringify(boardMode)); if (boardMode === '3d') preload3D(); }, [boardMode]);
  const toggleBoard = () => setBoardMode((m) => (m === '3d' ? '2d' : '3d'));

  useEffect(() => { localStorage.setItem('cu.pieceSet', JSON.stringify(pieceSet)); }, [pieceSet]);
  useEffect(() => { localStorage.setItem('cu.sound', JSON.stringify(sound)); setSoundEnabled(sound); }, [sound]);

  return (
    <div className={`app skin-w-${progress.skins.w} skin-b-${progress.skins.b}`}>
      <PieceDefs />
      <div className="bg-sparks" aria-hidden="true" />
      {replay ? (
        <Suspense fallback={<div className="learn-loading">Loading replay…</div>}>
          <ReplayScreen
            source={replay.src}
            initialTab={replay.tab}
            pieceSet={pieceSet}
            boardMode={boardMode}
            onToggleBoard={toggleBoard}
            onBoardUnavailable={() => setBoardMode('2d')}
            onClose={() => {
              if (urlReplay) { const u = new URL(location.href); u.searchParams.delete('replay'); history.replaceState(null, '', u.toString()); }
              setOnline(replay.back === 'online');
              setReplay(null);
            }}
          />
        </Suspense>
      ) : learn ? (
        <Suspense fallback={<div className="learn-loading">Opening the path…</div>}>
          <LearnScreen
            initialTab={learn}
            pieceSet={pieceSet}
            boardMode={boardMode}
            onToggleBoard={toggleBoard}
            onBoardUnavailable={() => setBoardMode('2d')}
            onHome={() => setLearn(null)}
          />
        </Suspense>
      ) : online ? (
        <OnlineScreen
          pieceSet={pieceSet}
          boardMode={boardMode}
          onToggleBoard={toggleBoard}
          onTogglePieces={() => setPieceSet((p) => (p === 'arcane' ? 'classic' : 'arcane'))}
          onHome={() => setOnline(false)}
          intent={urlIntent}
          onReplay={(src, tab) => setReplay({ src, tab, back: 'online' })}
        />
      ) : setup ? (
        <GameScreen
          setup={setup}
          pieceSet={pieceSet}
          boardMode={boardMode}
          onToggleBoard={toggleBoard}
          onTogglePieces={() => setPieceSet((p) => (p === 'arcane' ? 'classic' : 'arcane'))}
          onHome={() => setSetup(null)}
          onReview={(src, tab) => { setSetup(null); setReplay({ src, tab, back: 'home' }); }}
        />
      ) : (
        <Home pieceSet={pieceSet} sound={sound} boardMode={boardMode} onBoardMode={setBoardMode} onPieceSet={setPieceSet} onSound={setSound} onStart={(cfg) => setSetup({ ...cfg, seed: cfg.seed ?? urlSeed })} onOnline={() => setOnline(true)} onLearn={(t) => setLearn(t)} onReplay={(src, tab) => setReplay({ src, tab, back: 'home' })} />
      )}
    </div>
  );
}
