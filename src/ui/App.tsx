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
import { SettingsScreen, type SettingsTab } from './settings/SettingsScreen';
import { useReducedMotion } from './settings/store';
import { SocialLayer } from './social/SocialLayer';
import { getOnlineClient, HAS_SERVER, storedToken } from '../net/online';
import { AppNav, type NavTab } from './nav/AppNav';
import { SocialScreen, type SocialTab } from './social/SocialScreen';
import { LeaderboardScreen } from './social/LeaderboardScreen';
import { AuthModal } from './AuthModal';
import { useOnlineSelect } from './social/useOnline';

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
  const [intent, setIntent] = useState<{ v: OnlineIntent; key: number }>({ v: urlIntent, key: 0 });
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(() => (typeof location !== 'undefined' && new URLSearchParams(location.search).has('settings') ? 'settings' : null));
  /** Top-level pages reached from the app nav (Home is "none of the above"). */
  const [page, setPage] = useState<{ v: 'social' | 'leaderboard'; tab?: SocialTab; key: number } | null>(() => {
    if (typeof location === 'undefined') return null;
    const q = new URLSearchParams(location.search);
    return q.has('social') ? { v: 'social', tab: q.get('social') === 'live' ? 'live' : 'friends', key: 0 } : q.has('leaderboard') ? { v: 'leaderboard', key: 0 } : null;
  });
  const [learnPlaying, setLearnPlaying] = useState(false);
  const [auth, setAuth] = useState<'login' | 'signup' | null>(null);
  const inOnlineGame = useOnlineSelect((v) => !!v.snap);
  const lobbyKind = useOnlineSelect((v) => v.lobby.kind);
  const reduced = useReducedMotion();
  const [replay, setReplay] = useState<ReplayView | null>(() => (urlReplay ? { src: { gameId: urlReplay }, back: 'home' } : null));
  const [learn, setLearn] = useState<LearnTab | null>(() => (typeof location !== 'undefined' && new URLSearchParams(location.search).has('learn') ? 'path' : null));
  const [learnLesson, setLearnLesson] = useState<string | undefined>(undefined);
  const progress = useProgress();
  setActiveSkins(progress.skins);
  useEffect(clearUrlIntent, []);
  // Signed in on this device before? Connect in the background so friends see you online and
  // challenges / friend requests reach you on any screen. (Never creates a guest by itself.)
  useEffect(() => {
    if (!HAS_SERVER || !storedToken()) return;
    const c = getOnlineClient();
    c.ensureSession().then(() => c.connect()).catch(() => {});
  }, []);
  /** Jump to the online screen from anywhere (accepting a challenge, watching a friend…). */
  const goOnline = (v: OnlineIntent = null) => {
    setSetup(null); setReplay(null); setLearn(null); setSettingsTab(null); setPage(null);
    setIntent((i) => ({ v, key: i.key + 1 }));
    setOnline(true);
  };
  /** App nav: jump to a top-level page, leaving whatever hub screen was open. */
  const navTo = (t: NavTab) => {
    if (online && lobbyKind === 'queued') getOnlineClient().cancelQueue();
    if (online && lobbyKind === 'waiting') getOnlineClient().leave();
    setSetup(null); setReplay(null); setOnline(false);
    setLearn(t === 'learn' ? 'path' : null);
    setSettingsTab(t === 'profile' ? 'profile' : t === 'settings' ? 'settings' : null);
    setPage(t === 'social' || t === 'leaderboard' ? { v: t, key: Date.now() } : null);
    window.scrollTo(0, 0);
  };
  const openSocial = (tab: SocialTab) => { setOnline(false); setSetup(null); setLearn(null); setReplay(null); setSettingsTab(null); setPage({ v: 'social', tab, key: Date.now() }); };
  const [pieceSet, setPieceSet] = useState<PieceSet>(() => load('cu.pieceSet', 'arcane'));
  const [sound, setSound] = useState<boolean>(() => load('cu.sound', true));
  const [boardMode, setBoardMode] = useState<BoardMode>(() => (load<BoardMode>('cu.board', '2d') === '3d' && has3D() ? '3d' : '2d'));
  useEffect(() => { localStorage.setItem('cu.board', JSON.stringify(boardMode)); if (boardMode === '3d') preload3D(); }, [boardMode]);
  const toggleBoard = () => setBoardMode((m) => (m === '3d' ? '2d' : '3d'));

  useEffect(() => { localStorage.setItem('cu.pieceSet', JSON.stringify(pieceSet)); }, [pieceSet]);
  useEffect(() => { localStorage.setItem('cu.sound', JSON.stringify(sound)); setSoundEnabled(sound); }, [sound]);

  // Nav is hidden while playing: games (local or online), lessons/puzzles and replays.
  const immersive = !!replay || (learn !== null && learnPlaying) || (online && inOnlineGame) || (!online && !learn && !settingsTab && !page && !!setup);
  const navActive: NavTab | null = immersive ? null
    : learn ? 'learn' : settingsTab ? (settingsTab === 'settings' ? 'settings' : 'profile') : page ? page.v : 'home';

  return (
    <div className={`app skin-w-${progress.skins.w} skin-b-${progress.skins.b} ${reduced ? 'reduce-motion' : ''} ${navActive ? 'has-nav' : ''}`}>
      <PieceDefs />
      <div className="bg-sparks" aria-hidden="true" />
      <SocialLayer onAccept={() => goOnline()} onOpenFriends={() => openSocial('friends')} />
      {replay ? (
        <Suspense fallback={<div className="learn-loading">Loading replay…</div>}>
          <ReplayScreen
            source={replay.src}
            initialTab={replay.tab}
            pieceSet={pieceSet}
            boardMode={boardMode}
            onToggleBoard={toggleBoard}
            onBoardUnavailable={() => setBoardMode('2d')}
            onTogglePieces={() => setPieceSet((p) => (p === 'arcane' ? 'classic' : 'arcane'))}
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
            startLesson={learnLesson}
            pieceSet={pieceSet}
            boardMode={boardMode}
            onToggleBoard={toggleBoard}
            onBoardUnavailable={() => setBoardMode('2d')}
            onHome={() => { setLearn(null); setLearnLesson(undefined); }}
            onPlaying={setLearnPlaying}
          />
        </Suspense>
      ) : settingsTab ? (
        <SettingsScreen
          key={settingsTab}
          initialTab={settingsTab}
          pieceSet={pieceSet}
          onPieceSet={setPieceSet}
          boardMode={boardMode}
          onBoardMode={setBoardMode}
          sound={sound}
          onSound={setSound}
          onHome={() => setSettingsTab(null)}
          onReplay={(src, tab) => { setSettingsTab(null); setReplay({ src, tab, back: 'home' }); }}
          onLearn={(lesson) => { setSettingsTab(null); setLearnLesson(lesson); setLearn('path'); }}
        />
      ) : page?.v === 'social' ? (
        <SocialScreen key={page.key} initialTab={page.tab} onChallenge={() => goOnline()} onWatch={(code) => goOnline({ kind: 'watch', code })} />
      ) : page?.v === 'leaderboard' ? (
        <LeaderboardScreen key={page.key} onSignUp={() => setAuth('signup')} />
      ) : online ? (
        <OnlineScreen
          key={intent.key}
          pieceSet={pieceSet}
          boardMode={boardMode}
          onToggleBoard={toggleBoard}
          onTogglePieces={() => setPieceSet((p) => (p === 'arcane' ? 'classic' : 'arcane'))}
          onHome={() => setOnline(false)}
          intent={intent.v}
          onSocial={openSocial}
          onLeaderboard={() => navTo('leaderboard')}
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
        <Home pieceSet={pieceSet} onStart={(cfg) => setSetup({ ...cfg, seed: cfg.seed ?? urlSeed })} onOnline={() => setOnline(true)} onLearn={(t) => setLearn(t)} onReplay={(src, tab) => setReplay({ src, tab, back: 'home' })} />
      )}
      {navActive !== null && <AppNav active={navActive} onNav={navTo} />}
      {auth && <AuthModal mode={auth} onMode={setAuth} onClose={() => setAuth(null)} />}
    </div>
  );
}
