import { useEffect, useMemo, useRef, useState } from 'react';
import { EMOTES } from '../net/protocol';
import { other, type PromotionPiece } from '../rules/chess';
import { formatTurn, type GameEvent, type GameResult, type GameState, type PlayerId } from '../rules/game';
import type { CardKind } from '../rules/cards';
import type { LastMoveAnim } from './Board';
import { PlayerZone } from './PlayerZone';
import { CardBack, CardFace } from './Card';
import { useGame, type GameSetup, BOT_NAMES } from './useGame';
import type { GameTransport } from '../net/transport';
import type { ChatMessage, EmoteId, RoomSnapshot } from '../net/protocol';
import { ChatPanel } from './ChatPanel';
import { BoardView, has3D, type BoardMode } from './BoardView';
import { buzz, sfx } from './sound';
import type { PieceSet } from './pieces';

/** Everything an online game needs from the network layer. */
export interface OnlineBinding {
  transport: GameTransport;
  snap: RoomSnapshot;
  chat: ChatMessage[];
  error: string | null;
  onChat: (text: string) => void;
  onEmote: (e: EmoteId) => void;
  /** Back to the online lobby (only offered when the game is over or when spectating). */
  onLeave: () => void;
}

interface Props {
  setup: GameSetup;
  pieceSet: PieceSet;
  boardMode: BoardMode;
  onToggleBoard: () => void;
  onTogglePieces: () => void;
  onHome: () => void;
  online?: OnlineBinding;
}

interface Reveal { key: number; kind: CardKind; toHand: boolean; capped: boolean; flip: boolean; hidden: boolean }
interface Banner { key: number; text: string; sub?: string; tone: 'skip' | 'reverse' | 'check' | 'info' }

export function GameScreen(props: Props) {
  const [gameKey, setGameKey] = useState(0);
  if (props.online) {
    return <Game key={props.online.snap.gameId} {...props} gameKey={0} onRematch={props.online.onLeave} />;
  }
  return <Game key={gameKey} {...props} gameKey={gameKey} onRematch={() => setGameKey((k) => k + 1)} />;
}

function Game({ setup, gameKey, pieceSet, boardMode, onToggleBoard, onTogglePieces, onHome, onRematch, online }: Props & { gameKey: number; onRematch: () => void }) {
  const { state, now, dispatch, error: localError } = useGame(setup, gameKey, online?.transport);
  const error = online ? online.error : localError;
  const wide = useMediaQuery('(min-width: 1000px) and (min-aspect-ratio: 5/4)');
  const pass = setup.mode === 'pass';
  const you: PlayerId | null = online ? online.snap.you : null;
  const spectator = !!online && you === null;
  const hiddenIds = useMemo(() => new Set(online?.snap.hiddenCardIds ?? []), [online?.snap.hiddenCardIds]);
  // Player 0 sits at the bottom locally (the human vs. the bot); online, you are always at the bottom.
  const bottom: PlayerId = online ? (you ?? 0) : 0;
  const top: PlayerId = bottom === 0 ? 1 : 0;
  const [showLog, setShowLog] = useState(false);
  const chatOpen = showLog;
  const [seenChat, setSeenChat] = useState(0);
  const [bubble, setBubble] = useState<ChatMessage | null>(null);
  const chatLen = online?.chat.length ?? 0;
  const chatSeen = useRef(chatLen);
  useEffect(() => {
    if (!online || chatLen <= chatSeen.current) { chatSeen.current = chatLen; return; }
    chatSeen.current = chatLen;
    const last = online.chat[chatLen - 1];
    if (last.seat === you && you !== null) return;
    setBubble(last);
    const t = setTimeout(() => setBubble(null), 3000);
    return () => clearTimeout(t);
  }, [chatLen, online, you]);
  const unread = online ? Math.max(0, online.chat.length - seenChat) : 0;
  useEffect(() => { if (chatOpen || wide) setSeenChat(online?.chat.length ?? 0); }, [chatOpen, wide, online?.chat.length]);
  const bottomColor = state.colorOf[bottom];
  const [promotion, setPromotion] = useState<{ from: number; to: number } | null>(null);
  const [anim, setAnim] = useState<LastMoveAnim | null>(null);
  const [reveals, setReveals] = useState<Reveal[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const seen = useRef(0);
  const key = useRef(1);

  // Turn new rule events into animations, sounds and haptics.
  useEffect(() => {
    if (state.events.length < seen.current) seen.current = 0;
    const fresh = state.events.slice(seen.current);
    const firstLoad = seen.current === 0;
    seen.current = state.events.length;
    if (firstLoad) return;
    const newReveals: Reveal[] = [];
    let newBanner: Banner | null = null;
    for (const e of fresh as GameEvent[]) {
      switch (e.type) {
        case 'draw':
          newReveals.push({ key: key.current++, kind: e.card.kind, toHand: e.toHand, capped: !!e.capped, flip: pass && e.player === top, hidden: hiddenIds.has(e.card.id) });
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
          else if (pass || r.winner === (online ? you : 0)) sfx.win();
          else sfx.lose();
          break;
        }
      }
    }
    if (newReveals.length) setReveals((q) => [...q, ...newReveals]);
    if (newBanner) setBanner(newBanner);
    setPromotion(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const humanTurn = online ? state.current === you : state.players[state.current].kind === 'human';
  const interactive = state.phase === 'moving' && humanTurn && !state.paused && !promotion && !online?.snap.delayed;

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
      remote={online ? player !== you : false}
      hiddenCardIds={online ? hiddenIds : undefined}
      badge={online ? <SeatBadge snap={online.snap} seat={player} now={now} /> : undefined}
      pieceSet={pieceSet}
      dispatch={dispatch}
      promotion={promotion && state.current === player ? promotion : null}
      onPromote={(p) => { if (promotion) move(promotion.from, promotion.to, p); setPromotion(null); }}
      onCancelPromotion={() => setPromotion(null)}
      onPause={!online && state.players[player].kind === 'human' ? () => dispatch({ type: 'pause' }) : undefined}
      onResign={(online ? player === you : state.players[player].kind === 'human') ? () => dispatch({ type: 'resign', player }) : undefined}
    />
  );

  const board = (
    <div className="board-wrap">
      <BoardView
        mode={boardMode}
        onUnavailable={() => { if (boardMode === '3d') onToggleBoard(); }}
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
      {has3D() && (
        <button className={`icon-btn board-mode-btn ${pass ? 'board-mode-pass' : ''}`} onClick={onToggleBoard} title={boardMode === '3d' ? 'Switch to 2D board' : 'Switch to 3D board'} data-testid="toggle-board">
          {boardMode === '3d' ? '2D' : '3D'}
        </button>
      )}
      {reveals[0] && <CardReveal reveal={reveals[0]} pass={pass} />}
      {bubble && (
        <div className={`chat-bubble ${bubble.seat === top ? 'bubble-top' : 'bubble-bottom'}`} key={bubble.id}>
          <b>{bubble.name}</b> {bubble.emote ? EMOTE_TEXT[bubble.emote] : bubble.text}
        </div>
      )}
      {online?.snap.delayed && <div className="delay-pill">Ranked game · spectators see it one turn behind</div>}
      {banner && <BannerView banner={banner} pass={pass} />}
      {error && <div className="toast">{error}</div>}
    </div>
  );

  return (
    <div className={`game game-${setup.mode}`} data-testid="game" data-turns={state.history.length}>
      {pass ? (
        <>
          {zone(top, true)}
          {board}
          {zone(bottom, false)}
        </>
      ) : (
        <>
          <header className="game-bar">
            {(!online || spectator || state.phase === 'over') && (
              <button className="icon-btn" onClick={online ? online.onLeave : onHome} aria-label={online ? 'Back to lobby' : 'Home'}>{online ? '‹' : '⌂'}</button>
            )}
            <div className="game-bar-title">
              {online
                ? spectator
                  ? <>Watching · <span className="mono">{online.snap.code}</span></>
                  : <>vs {state.players[top].name}{online.snap.rated && <span className="rated-tag">RATED</span>}</>
                : <>vs {BOT_NAMES[setup.botLevel]}</>}
            </div>
            {online && online.snap.spectators > 0 && <span className="spectators" title="Spectators">👁 {online.snap.spectators}</span>}
            {online && !spectator && <ShareWatch code={online.snap.code} />}
            <button className="icon-btn" onClick={onTogglePieces} title="Toggle piece set">{pieceSet === 'arcane' ? '♞' : '✦'}</button>
            {!wide && (
              <button className="icon-btn log-toggle" onClick={() => setShowLog((v) => !v)} aria-label={online ? 'Chat and turns' : 'Move list'} data-testid="side-toggle">
                {online ? '💬' : '☰'}
                {online && unread > 0 && !showLog && <span className="unread">{unread}</span>}
              </button>
            )}
          </header>
          {wide ? (
            <div className="bot-wide">
              {board}
              <aside className="side-col">
                {zone(top, false, true)}
                {online ? <SideTabs state={state} online={online} spectator={spectator} /> : <MoveLog state={state} />}
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
              {online ? <SideTabs state={state} online={online} spectator={spectator} /> : <MoveLog state={state} />}
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
        <GameOver state={state} result={state.result} pass={pass} onRematch={onRematch} onHome={onHome} online={online} />
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
        {reveal.hidden ? <CardBack size="xl" /> : <CardFace kind={reveal.kind} size="xl" />}
      </div>
      <div className="reveal-label">
        {reveal.hidden ? 'Action card — held in hand' : reveal.toHand ? 'Into your hand — draw again' : reveal.capped ? 'Opening turn: counts as 1' : `${reveal.kind} move${reveal.kind === '1' ? '' : 's'}`}
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

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

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

function GameOver({ state, result, pass, onRematch, onHome, online }: { state: GameState; result: GameResult; pass: boolean; onRematch: () => void; onHome: () => void; online?: OnlineBinding }) {
  const info = online?.snap.result;
  const panel = (viewer: PlayerId | null, rotated: boolean) => {
    const draw = result.winner === null;
    const won = !draw && viewer !== null && result.winner === viewer;
    const title = draw ? 'Draw' : viewer === null ? `${state.players[result.winner!].name} wins` : won ? 'Victory!' : 'Defeat';
    const how = info?.note === 'abandoned' ? 'by abandonment' : REASON[result.reason];
    const sub = draw ? REASON[result.reason] : `${state.players[result.winner!].name} won ${how}`;
    const delta = info?.ratingChange && viewer !== null ? info.ratingChange[viewer] : null;
    const turns = state.history.filter((t) => !t.skipped).length;
    return (
      <div className={`panel gameover ${rotated ? 'rotated' : ''} ${won ? 'won' : draw ? 'drawn' : 'lost'}`} data-testid="game-over">
        <div className="gameover-crest">{draw ? '½' : won || viewer === null ? '♛' : '♚'}</div>
        <h2>{title}</h2>
        <p>{sub}</p>
        <div className="gameover-stats">
          <span>{plural(turns, 'turn')}</span>
          <span>{plural(state.history.reduce((n, t) => n + t.moves.length, 0), 'move')}</span>
          <span>{plural(state.history.reduce((n, t) => n + t.played.length, 0), 'card')} played</span>
        </div>
        {delta !== null && info?.ratingAfter && viewer !== null && (
          <div className={`rating-change ${delta >= 0 ? 'up' : 'down'}`} data-testid="rating-change">
            Rating {info.ratingAfter[viewer]} <b>{delta >= 0 ? `▲ +${delta}` : `▼ ${delta}`}</b>
          </div>
        )}
        {info && <div className="seed-note">Deck seed {info.seed} — the shuffle can be verified</div>}
        <div className="panel-actions">
          <button className="btn primary" onClick={onRematch}>{online ? 'New game' : 'Rematch'}</button>
          <button className="btn ghost" onClick={onHome}>Menu</button>
        </div>
      </div>
    );
  };
  return (
    <div className={`overlay gameover-overlay ${pass ? 'two-sided' : ''}`}>
      {pass && panel(1, true)}
      {panel(online ? online.snap.you : 0, false)}
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
            <span className="log-n">{t.skipped ? '' : `${t.turn}.`}</span>
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

const EMOTE_TEXT = EMOTES;

/** Seconds left as m:ss (e.g. 1:30). */
const fmtCountdown = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

function SeatBadge({ snap, seat, now }: { snap: RoomSnapshot; seat: PlayerId; now: number }) {
  const info = snap.seats[seat];
  const away = !info.connected && info.graceUntil;
  return (
    <>
      <span className="rating-tag" title={info.guest ? 'Guest' : 'Rating'}>{info.guest ? 'guest' : info.rating}</span>
      {away && snap.state.phase !== 'over' && (
        <span className="away-tag">reconnecting {fmtCountdown(info.graceUntil! - now)}</span>
      )}
    </>
  );
}

function ShareWatch({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}${location.pathname}?watch=${code}`;
  return (
    <button
      className="icon-btn"
      title="Copy spectator link"
      aria-label="Copy spectator link"
      onClick={async () => {
        try { await navigator.clipboard.writeText(link); } catch { /* clipboard blocked */ }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? '✓' : '🔗'}
    </button>
  );
}

function SideTabs({ state, online, spectator }: { state: GameState; online: OnlineBinding; spectator: boolean }) {
  const [tab, setTab] = useState<'chat' | 'turns'>('chat');
  return (
    <div className="side-tabs">
      <div className="seg seg-small">
        <button className={`seg-btn ${tab === 'chat' ? 'on' : ''}`} onClick={() => setTab('chat')}>Chat</button>
        <button className={`seg-btn ${tab === 'turns' ? 'on' : ''}`} onClick={() => setTab('turns')}>Turns</button>
      </div>
      {tab === 'chat'
        ? <ChatPanel messages={online.chat} you={online.snap.you} readOnly={spectator} onSend={online.onChat} onEmote={online.onEmote} />
        : <MoveLog state={state} />}
    </div>
  );
}
