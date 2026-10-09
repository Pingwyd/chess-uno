import { useEffect, useRef, useState } from 'react';
import { other, type PromotionPiece } from '../rules/chess';
import { formatTurn, type GameEvent, type GameResult, type GameState, type PlayerId } from '../rules/game';
import type { CardKind } from '../rules/cards';
import { Board, type LastMoveAnim } from './Board';
import { PlayerZone } from './PlayerZone';
import { CardFace } from './Card';
import { useGame, type GameSetup, BOT_NAMES } from './useGame';
import { buzz, sfx } from './sound';
import type { PieceSet } from './pieces';

interface Props {
  setup: GameSetup;
  pieceSet: PieceSet;
  onTogglePieces: () => void;
  onHome: () => void;
}

interface Reveal { key: number; kind: CardKind; toHand: boolean; capped: boolean; flip: boolean }
interface Banner { key: number; text: string; sub?: string; tone: 'skip' | 'reverse' | 'check' | 'info' }

export function GameScreen({ setup, pieceSet, onTogglePieces, onHome }: Props) {
  const [gameKey, setGameKey] = useState(0);
  return <Game key={gameKey} setup={setup} gameKey={gameKey} pieceSet={pieceSet} onTogglePieces={onTogglePieces} onHome={onHome} onRematch={() => setGameKey((k) => k + 1)} />;
}

function Game({ setup, gameKey, pieceSet, onTogglePieces, onHome, onRematch }: Props & { gameKey: number; onRematch: () => void }) {
  const { state, now, dispatch, error } = useGame(setup, gameKey);
  const wide = useMediaQuery('(min-width: 1000px) and (min-aspect-ratio: 5/4)');
  const pass = setup.mode === 'pass';
  // Player 0 always sits at the bottom (the human in vs-bot mode).
  const bottom: PlayerId = 0;
  const top: PlayerId = 1;
  const bottomColor = state.colorOf[bottom];
  const [promotion, setPromotion] = useState<{ from: number; to: number } | null>(null);
  const [anim, setAnim] = useState<LastMoveAnim | null>(null);
  const [reveals, setReveals] = useState<Reveal[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [showLog, setShowLog] = useState(false);
  const seen = useRef(0);
  const key = useRef(1);

  // Turn new rule events into animations, sounds and haptics.
  useEffect(() => {
    const fresh = state.events.slice(seen.current);
    const firstLoad = seen.current === 0;
    seen.current = state.events.length;
    if (firstLoad) return;
    const newReveals: Reveal[] = [];
    let newBanner: Banner | null = null;
    for (const e of fresh as GameEvent[]) {
      switch (e.type) {
        case 'draw':
          newReveals.push({ key: key.current++, kind: e.card.kind, toHand: e.toHand, capped: !!e.capped, flip: pass && e.player === top });
          sfx.draw();
          break;
        case 'move':
          setAnim({ key: key.current++, from: e.move.from, to: e.move.to });
          if (e.san.includes('+') || e.san.includes('#')) sfx.check(); else if (e.move.captured) sfx.capture(); else sfx.move();
          break;
        case 'playCard':
          if (e.card.kind === 'skip') {
            newBanner = { key: key.current++, text: 'SKIP!', sub: `${state.players[e.player].name} will go again`, tone: 'skip' };
            sfx.skip();
          }
          break;
        case 'reverse':
          newBanner = { key: key.current++, text: 'REVERSE!', sub: 'Sides swapped — clocks & cards stay with you', tone: 'reverse' };
          sfx.reverse();
          buzz(120);
          break;
        case 'skipped':
          newBanner = { key: key.current++, text: 'Turn skipped', sub: `${state.players[e.player].name} sits this one out`, tone: 'skip' };
          break;
        case 'skipCancelled':
          newBanner = { key: key.current++, text: 'Skip cancelled', sub: 'Check cancels Skip', tone: 'info' };
          break;
        case 'turnEnd':
          if (e.reason === 'check' && state.phase !== 'over') newBanner = { key: key.current++, text: 'CHECK!', sub: 'Check ends the turn', tone: 'check' };
          break;
        case 'turnStart':
          if (pass) { buzz(35); sfx.turn(); }
          break;
        case 'gameOver': {
          const r = e.result;
          if (r.winner === null) sfx.lose();
          else if (pass || r.winner === 0) sfx.win();
          else sfx.lose();
          break;
        }
      }
    }
    if (newReveals.length) setReveals((q) => [...q, ...newReveals]);
    if (newBanner) setBanner(newBanner);
    setPromotion(null);
  }, [state, pass, top]);

  useEffect(() => {
    if (!reveals.length) return;
    const t = setTimeout(() => setReveals((q) => q.slice(1)), reveals[0].toHand ? 900 : 1050);
    return () => clearTimeout(t);
  }, [reveals]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 1500);
    return () => clearTimeout(t);
  }, [banner]);

  const humanTurn = state.players[state.current].kind === 'human';
  const interactive = state.phase === 'moving' && humanTurn && !state.paused && !promotion;

  const move = (from: number, to: number, promo?: PromotionPiece) =>
    dispatch({ type: 'move', player: state.current, from, to, promotion: promo });

  const zone = (player: PlayerId, rotated: boolean, compact = false) => (
    <PlayerZone
      state={state}
      player={player}
      now={now}
      rotated={rotated}
      compact={compact}
      isBot={state.players[player].kind === 'bot'}
      pieceSet={pieceSet}
      dispatch={dispatch}
      promotion={promotion && state.current === player ? promotion : null}
      onPromote={(p) => { if (promotion) move(promotion.from, promotion.to, p); setPromotion(null); }}
      onCancelPromotion={() => setPromotion(null)}
      onPause={state.players[player].kind === 'human' ? () => dispatch({ type: 'pause' }) : undefined}
      onResign={state.players[player].kind === 'human' ? () => dispatch({ type: 'resign', player }) : undefined}
    />
  );

  const board = (
    <div className="board-wrap">
      <Board
        state={state}
        bottomColor={bottomColor}
        topColor={other(bottomColor)}
        faceTopPieces={pass}
        interactive={interactive}
        pieceSet={pieceSet}
        anim={anim}
        onMove={(f, t) => move(f, t)}
        onPromotion={(f, t) => setPromotion({ from: f, to: t })}
      />
      {reveals[0] && <CardReveal reveal={reveals[0]} pass={pass} />}
      {banner && <BannerView banner={banner} pass={pass} />}
      {error && <div className="toast">{error}</div>}
    </div>
  );

  return (
    <div className={`game game-${setup.mode}`} data-testid="game">
      {pass ? (
        <>
          {zone(top, true)}
          {board}
          {zone(bottom, false)}
        </>
      ) : (
        <>
          <header className="game-bar">
            <button className="icon-btn" onClick={onHome} aria-label="Home">⌂</button>
            <div className="game-bar-title">vs {BOT_NAMES[setup.botLevel]}</div>
            <button className="icon-btn" onClick={onTogglePieces} title="Toggle piece set">{pieceSet === 'arcane' ? '♞' : '✦'}</button>
            {!wide && <button className="icon-btn log-toggle" onClick={() => setShowLog((v) => !v)} aria-label="Move list">☰</button>}
          </header>
          {wide ? (
            <div className="bot-wide">
              {board}
              <aside className="side-col">
                {zone(top, false, true)}
                <MoveLog state={state} />
                <DeckInfo state={state} />
                {zone(bottom, false)}
              </aside>
            </div>
          ) : (
          <div className="bot-layout">
            <div className="bot-main">
              {zone(top, false, true)}
              {board}
              {zone(bottom, false)}
            </div>
            <aside className={`side-panel ${showLog ? 'open' : ''}`}>
              <MoveLog state={state} />
              <DeckInfo state={state} />
            </aside>
          </div>
          )}
        </>
      )}
      {state.paused && state.phase !== 'over' && (
        <div className="overlay pause-overlay">
          {pass && <PausePanel rotated onResume={() => dispatch({ type: 'resume' })} onHome={onHome} />}
          <PausePanel rotated={false} onResume={() => dispatch({ type: 'resume' })} onHome={onHome} />
        </div>
      )}
      {state.phase === 'over' && state.result && (
        <GameOver state={state} result={state.result} pass={pass} onRematch={onRematch} onHome={onHome} />
      )}
    </div>
  );
}

function useMediaQuery(q: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return match;
}

function CardReveal({ reveal, pass }: { reveal: Reveal; pass: boolean }) {
  return (
    <div className={`reveal ${reveal.flip ? 'reveal-flip' : ''} ${reveal.toHand ? 'reveal-hand' : ''} ${pass ? 'reveal-pass' : ''}`} key={reveal.key}>
      <div className="reveal-card">
        <CardFace kind={reveal.kind} size="xl" />
      </div>
      <div className="reveal-label">
        {reveal.toHand ? 'Into your hand — draw again' : reveal.capped ? 'Opening turn: counts as 1' : `${reveal.kind} move${reveal.kind === '1' ? '' : 's'}`}
      </div>
    </div>
  );
}

function BannerView({ banner, pass }: { banner: Banner; pass: boolean }) {
  const content = (
    <div className={`banner banner-${banner.tone}`}>
      <div className="banner-text">{banner.text}</div>
      {banner.sub && <div className="banner-sub">{banner.sub}</div>}
    </div>
  );
  return (
    <div className="banner-layer" key={banner.key}>
      {pass && <div className="banner-half rotated">{content}</div>}
      <div className="banner-half">{content}</div>
    </div>
  );
}

function PausePanel({ rotated, onResume, onHome }: { rotated: boolean; onResume: () => void; onHome: () => void }) {
  return (
    <div className={`panel ${rotated ? 'rotated' : ''}`}>
      <h2>Paused</h2>
      <p>Clocks are stopped.</p>
      <div className="panel-actions">
        <button className="btn primary" onClick={onResume}>Resume</button>
        <button className="btn ghost" onClick={onHome}>Quit to menu</button>
      </div>
    </div>
  );
}

const REASON: Record<GameResult['reason'], string> = {
  checkmate: 'by checkmate',
  timeout: 'on time',
  resign: 'by resignation',
  stalemate: 'Stalemate',
  threefold: 'Threefold repetition',
  'fifty-move': '50-move rule',
  insufficient: 'Insufficient material',
  agreement: 'By agreement',
  'timeout-vs-insufficient': 'Time out vs. insufficient material',
};

function GameOver({ state, result, pass, onRematch, onHome }: { state: GameState; result: GameResult; pass: boolean; onRematch: () => void; onHome: () => void }) {
  const panel = (viewer: PlayerId | null, rotated: boolean) => {
    const draw = result.winner === null;
    const won = !draw && viewer !== null && result.winner === viewer;
    const title = draw ? 'Draw' : viewer === null ? `${state.players[result.winner!].name} wins` : won ? 'Victory!' : 'Defeat';
    const sub = draw ? REASON[result.reason] : `${state.players[result.winner!].name} won ${REASON[result.reason]}`;
    const turns = state.history.filter((t) => !t.skipped).length;
    return (
      <div className={`panel gameover ${rotated ? 'rotated' : ''} ${won ? 'won' : draw ? 'drawn' : 'lost'}`} data-testid="game-over">
        <div className="gameover-crest">{draw ? '½' : won || viewer === null ? '♛' : '♚'}</div>
        <h2>{title}</h2>
        <p>{sub}</p>
        <div className="gameover-stats">
          <span>{turns} turns</span>
          <span>{state.history.reduce((n, t) => n + t.moves.length, 0)} moves</span>
          <span>{state.history.reduce((n, t) => n + t.played.length, 0)} cards played</span>
        </div>
        <div className="panel-actions">
          <button className="btn primary" onClick={onRematch}>Rematch</button>
          <button className="btn ghost" onClick={onHome}>Menu</button>
        </div>
      </div>
    );
  };
  return (
    <div className={`overlay gameover-overlay ${pass ? 'two-sided' : ''}`}>
      {pass && panel(1, true)}
      {panel(pass ? 0 : 0, false)}
    </div>
  );
}

function MoveLog({ state }: { state: GameState }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight }); }, [state.history.length, state.movesMade]);
  return (
    <div className="move-log">
      <h3>Turns</h3>
      <ol ref={ref}>
        {state.history.map((t, i) => (
          <li key={i} className={`log-${t.color}`}>
            <span className="log-n">{t.turn}.</span>
            <span className={`log-dot dot-${t.color}`} />
            <span className="log-who">{state.players[t.player].name}</span>
            <span className="log-txt">{formatTurn(t) || '…'}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DeckInfo({ state }: { state: GameState }) {
  const top = state.discard[state.discard.length - 1];
  return (
    <div className="deck-info">
      <div><b>{state.drawPile.length}</b> in draw pile</div>
      <div className="discard-top">
        Discard {top ? <CardFace kind={top.kind} size="xs" /> : <span>—</span>}
      </div>
    </div>
  );
}
