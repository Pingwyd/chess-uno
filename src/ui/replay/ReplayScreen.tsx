/**
 * Replay viewer + review (lazy chunk). Rebuilds every state from the game's
 * action log, steps per move or per turn, autoplays, and overlays the review
 * bot's verdicts, better lines (arrows) and summary.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { makeMove, other, type Move } from '../../rules/chess';
import type { GameEvent, GameResult, GameState, PlayerId } from '../../rules/game';
import { clocksAt, reconstruct, type Frame, type GameRecord, type Replay } from '../../replay/record';
import { loadGame, loadReview, saveReview } from '../../replay/store';
import { fetchServerRecord, fetchServerReview, reviewInWorker } from '../../engine/reviewClient';
import { EXPECTED_CARD, LABEL_TEXT, REVIEW_VERSION, hasBetterLine, winChance, type GameReview, type Label, type TurnReview } from '../../engine/review';
import { BoardView, has3D, type BoardMode } from '../BoardView';
import type { BoardArrow, LastMoveAnim } from '../Board';
import { CardBack, CardFace } from '../Card';
import { Piece, type PieceSet } from '../pieces';
import { formatClock } from '../PlayerZone';
import './replay.css';

export type ReplaySource = { id: string } | { gameId: string };

interface Props {
  source: ReplaySource;
  initialTab?: 'replay' | 'review';
  pieceSet: PieceSet;
  boardMode: BoardMode;
  onToggleBoard: () => void;
  onBoardUnavailable: () => void;
  onClose: () => void;
}

export const LABEL_ICON: Record<Label, string> = {
  brilliant: '!!', great: '!', best: '★', good: '✓', inaccuracy: '?!', mistake: '?', blunder: '??',
};

export default function ReplayScreen(props: Props) {
  const [record, setRecord] = useState<GameRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    (async () => {
      let rec: GameRecord | null | undefined = null;
      if ('id' in props.source) rec = await loadGame(props.source.id);
      else {
        rec = await loadGame(`online-${props.source.gameId}`);
        if (!rec) rec = await fetchServerRecord(props.source.gameId);
      }
      if (off) return;
      if (rec) setRecord(rec);
      else setError('id' in props.source ? 'This game is no longer saved on this device.' : "Couldn't load this replay — it may not exist, or the server is unreachable.");
    })();
    return () => { off = true; };
  }, [props.source]);

  const replay = useMemo(() => {
    if (!record) return null;
    try { return reconstruct(record); } catch (e) { setError(`This game log can't be replayed (${(e as Error).message}).`); return null; }
  }, [record]);

  if (error) {
    return (
      <div className="replay replay-empty" data-testid="replay-error">
        <header className="game-bar"><button className="icon-btn" onClick={props.onClose} aria-label="Back">‹</button><div className="game-bar-title">Replay</div></header>
        <div className="replay-msg"><p>{error}</p><button className="btn primary" onClick={props.onClose}>Back</button></div>
      </div>
    );
  }
  if (!record || !replay) return <div className="replay replay-empty"><div className="replay-msg loading">Loading replay…</div></div>;
  return <Viewer {...props} record={record} replay={replay} />;
}

// ---------------------------------------------------------------- viewer

/** Display number of a turn (history index -> the game's own turn count, which skips skipped turns). */
const TurnNo = createContext<(i: number) => number>((i) => i + 1);

const SPEEDS = [0.5, 1, 2, 4];

function useMedia(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

interface LineView { turn: TurnReview; step: number; playing: boolean }

function Viewer({ record, replay, pieceSet, boardMode, onToggleBoard, onBoardUnavailable, onClose, initialTab }: Props & { record: GameRecord; replay: Replay }) {
  const wide = useMedia('(min-width: 980px) and (min-aspect-ratio: 5/4)');
  const frames = replay.frames;
  const nav = useMemo(() => frames.map((f, i) => (f.kind === 'clock' ? -1 : i)).filter((i) => i >= 0), [frames]);
  const [fi, setFi] = useState(() => nav[nav.length - 1]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tab, setTab] = useState<'replay' | 'review'>(initialTab ?? 'replay');
  const [anim, setAnim] = useState<LastMoveAnim | null>(null);
  const [line, setLine] = useState<LineView | null>(null);
  const animKey = useRef(1);
  const { review, progress, failed } = useReview(record);

  const frame = frames[fi];
  const bottom: PlayerId = record.mode === 'online' ? (record.online?.you ?? 0) : 0;
  const top: PlayerId = bottom === 0 ? 1 : 0;
  const reviewByTurn = useMemo(() => new Map((review?.turns ?? []).map((t) => [t.turn, t])), [review]);
  const curTurn = reviewByTurn.get(frame.turn) ?? null;

  const go = useCallback((i: number, animate = true) => {
    const j = Math.max(0, Math.min(frames.length - 1, i));
    setLine(null);
    setFi((cur) => {
      const f = frames[j];
      if (animate && j === nextNav(nav, cur, 1) && f.move) setAnim({ key: animKey.current++, from: f.move.from, to: f.move.to });
      else setAnim(null);
      return j;
    });
  }, [frames, nav]);
  const step = useCallback((dir: 1 | -1) => go(nextNav(nav, fi, dir)), [go, nav, fi]);
  const stepTurn = useCallback((dir: 1 | -1) => {
    const starts = replay.turnStarts.filter((x) => x !== undefined);
    if (dir > 0) {
      const n = starts.find((s) => s > fi);
      go(n ?? nav[nav.length - 1], false);
    } else {
      const cur = [...starts].reverse().find((s) => s <= fi) ?? 0;
      const prev = [...starts].reverse().find((s) => s < cur);
      go(fi > cur ? cur : prev ?? 0, false);
    }
  }, [replay.turnStarts, fi, go, nav]);

  // Autoplay.
  useEffect(() => {
    if (!playing) return;
    if (fi >= nav[nav.length - 1]) { setPlaying(false); return; }
    const next = nextNav(nav, fi, 1);
    const turnBreak = frames[next].turn !== frame.turn;
    const t = setTimeout(() => step(1), (turnBreak ? 1250 : 850) / speed);
    return () => clearTimeout(t);
  }, [playing, fi, nav, speed, step, frames, frame.turn]);

  // Better-line playback.
  useEffect(() => {
    if (!line?.playing || !line.turn.best) return;
    if (line.step >= line.turn.best.moves.length) { setLine({ ...line, playing: false }); return; }
    const t = setTimeout(() => {
      const m = line.turn.best!.moves[line.step];
      setAnim({ key: animKey.current++, from: m.from, to: m.to });
      setLine({ ...line, step: line.step + 1 });
    }, line.step === 0 ? 500 : 900);
    return () => clearTimeout(t);
  }, [line]);

  // Keyboard: ← → moves, ↑ ↓ turns, space play/pause.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); stepTurn(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); stepTurn(-1); }
      else if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === 'Home') go(0, false);
      else if (e.key === 'End') go(nav[nav.length - 1], false);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [step, stepTurn, go, nav]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const scrollToTabs = () => {
    const sc = scrollRef.current, t = tabsRef.current;
    if (sc && t && !wide) sc.scrollTo({ top: t.offsetTop - sc.offsetTop - 8, behavior: 'smooth' });
  };
  // Opened from "Review game": on phones, land on the summary below the board.
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || initialTab !== 'review' || !review) return;
    landed.current = true;
    requestAnimationFrame(scrollToTabs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review]);

  const showLine = (t: TurnReview) => {
    setPlaying(false);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setFi(t.frameStart);
    setAnim(null);
    setLine({ turn: t, step: 0, playing: false });
  };

  // What the board shows: the frame, or the better line's position.
  const view = useMemo(() => lineState(frames, line) ?? frame.state, [frames, line, frame]);
  const arrows = useMemo(() => lineArrows(frames, line), [frames, line]);

  const board = (
    <div className="board-wrap replay-board">
      <BoardView
        mode={boardMode} onUnavailable={onBoardUnavailable}
        state={view} bottomColor={view.colorOf[bottom]} topColor={other(view.colorOf[bottom])}
        faceTopPieces={false} interactive={false} pieceSet={pieceSet} anim={anim}
        onMove={() => {}} onPromotion={() => {}} arrows={arrows}
      />
      {has3D() && <button className="icon-btn board-mode-btn" onClick={onToggleBoard} data-testid="replay-toggle-board" title="Switch board">{boardMode === '3d' ? '2D' : '3D'}</button>}
      {!line && <EventChip frame={frame} names={record.config.players.map((p) => p.name) as [string, string]} />}
    </div>
  );

  const header = (
    <header className="game-bar replay-bar">
      <button className="icon-btn" onClick={onClose} aria-label="Back" data-testid="replay-close">‹</button>
      <div className="game-bar-title replay-title">
        <span>{record.config.players[0].name} <i>vs</i> {record.config.players[1].name}</span>
        <small>{modeLabel(record)} · {resultLine(record.result, record.config.players.map((p) => p.name) as [string, string])}</small>
      </div>
      {record.online && <ShareReplay gameId={record.online.gameId} />}
    </header>
  );

  const zones = (p: PlayerId) => (
    <PlayerStrip
      frame={frame} state={view} player={p} name={record.config.players[p].name} pieceSet={pieceSet}
      bot={record.config.players[p].kind === 'bot'} accuracy={review?.players[p].accuracy ?? null}
    />
  );

  const controls = (
    <Controls
      fi={fi} nav={nav} frames={frames} playing={playing} speed={speed} review={review}
      onGo={go} onStep={step} onTurn={stepTurn} onPlay={() => { if (fi >= nav[nav.length - 1]) go(0, false); setPlaying((p) => !p); }}
      onSpeed={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}
    />
  );

  const coach = (
    <Coach
      turn={curTurn} frame={frame} line={line} review={review} progress={progress} failed={failed}
      names={record.config.players.map((p) => p.name) as [string, string]}
      onShowLine={showLine} onPlayLine={() => line && setLine({ ...line, step: 0, playing: true })} onExitLine={() => { setLine(null); setAnim(null); }}
      onOpenReview={wide && tab === 'review' ? undefined : () => { setTab('review'); requestAnimationFrame(() => scrollToTabs()); }}
    />
  );

  const tabs = (
    <div className="seg seg-small replay-tabs" role="tablist" ref={tabsRef}>
      <button className={`seg-btn ${tab === 'replay' ? 'on' : ''}`} onClick={() => setTab('replay')} data-testid="tab-replay">Moves</button>
      <button className={`seg-btn ${tab === 'review' ? 'on' : ''}`} onClick={() => setTab('review')} data-testid="tab-review">
        Review {review ? '' : progress !== null ? `· ${Math.round(progress * 100)}%` : ''}
      </button>
    </div>
  );

  const side = tab === 'replay'
    ? <TurnList replay={replay} fi={fi} reviewByTurn={reviewByTurn} onGo={(i) => go(i, false)} />
    : <ReviewPanel record={record} review={review} progress={progress} failed={failed} fi={fi} frames={frames} onGo={(i) => go(i, false)} onShowLine={showLine} />;

  const turnNo = useCallback((i: number) => replay.final.history[i]?.turn || i + 1, [replay]);
  if (wide) {
    return (
      <TurnNo.Provider value={turnNo}>
      <div className="replay replay-wide" data-testid="replay">
        {header}
        <div className="replay-wide-body">
          <div className="replay-stage">
            {zones(top)}
            {board}
            {zones(bottom)}
          </div>
          <aside className="replay-side">
            {coach}
            {controls}
            {tabs}
            <div className="replay-side-scroll">{side}</div>
          </aside>
        </div>
      </div>
      </TurnNo.Provider>
    );
  }
  return (
    <TurnNo.Provider value={turnNo}>
    <div className="replay replay-narrow" data-testid="replay">
      {header}
      <div className="replay-scroll" ref={scrollRef}>
        {zones(top)}
        {board}
        {zones(bottom)}
        {coach}
        {controls}
        {tabs}
        {side}
      </div>
    </div>
    </TurnNo.Provider>
  );
}

function nextNav(nav: number[], cur: number, dir: 1 | -1): number {
  if (dir > 0) return nav.find((i) => i > cur) ?? nav[nav.length - 1];
  for (let k = nav.length - 1; k >= 0; k--) if (nav[k] < cur) return nav[k];
  return nav[0];
}

/** Position while showing a better line: the turn's start with `step` best moves played. */
function lineState(frames: Frame[], line: LineView | null): GameState | null {
  if (!line?.turn.best) return null;
  const base = frames[line.turn.frameStart].state;
  let pos = { ...base.pos, board: base.pos.board.slice() };
  const done: Move[] = [];
  for (const m of line.turn.best.moves.slice(0, line.step)) {
    pos = makeMove(pos, m);
    pos.ep = -1;
    done.push(m);
  }
  return { ...base, pos, turnMoves: done, lastTurnMoves: done.length ? done : [], movesMade: done.length };
}

function lineArrows(frames: Frame[], line: LineView | null): BoardArrow[] {
  if (!line?.turn.best) return [];
  const best = line.turn.best.moves;
  const out: BoardArrow[] = best.slice(line.step).map((m, k) => ({ from: m.from, to: m.to, tone: 'best' as const, label: String(line.step + k + 1) }));
  if (line.step === 0) {
    const played = frames.slice(line.turn.frameStart, line.turn.frameEnd + 1).filter((f) => f.move && f.turn === line.turn.turn).map((f) => f.move!);
    const same = played.length === best.length && played.every((m, i) => m.from === best[i].from && m.to === best[i].to);
    if (!same) out.unshift(...played.map((m, k) => ({ from: m.from, to: m.to, tone: 'played' as const, label: String(k + 1) })));
  }
  return out;
}

// ---------------------------------------------------------------- review loading

function useReview(record: GameRecord) {
  const [review, setReview] = useState<GameReview | null>(null);
  const [progress, setProgress] = useState<number | null>(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let off = false;
    let cancel = () => {};
    (async () => {
      const cached = await loadReview(record.id);
      if (off) return;
      if (cached && cached.version === REVIEW_VERSION) { setReview(cached); setProgress(null); return; }
      // Online games: the server may already have analysed it (same engine, cached for everyone).
      if (record.online && navigator.onLine !== false) {
        const r = await fetchServerReview(record.online.gameId, 15_000);
        if (off) return;
        if (r) { setReview(r); setProgress(null); void saveReview(record.id, r); return; }
      }
      const job = reviewInWorker(record, (p) => !off && setProgress(p));
      cancel = job.cancel;
      try {
        const r = await job.promise;
        if (off) return;
        setReview(r);
        setProgress(null);
        void saveReview(record.id, r);
      } catch {
        if (!off) { setFailed(true); setProgress(null); }
      }
    })();
    return () => { off = true; cancel(); };
  }, [record]);
  return { review, progress, failed };
}

// ---------------------------------------------------------------- pieces of UI

function modeLabel(r: GameRecord) {
  if (r.mode === 'bot') return `Vs ${r.config.players[1].name}`;
  if (r.mode === 'pass') return 'Pass & Play';
  return r.online?.rated ? 'Online · rated' : 'Online';
}

const REASON: Record<GameResult['reason'], string> = {
  checkmate: 'checkmate', timeout: 'on time', resign: 'resignation', stalemate: 'stalemate', threefold: 'repetition',
  'fifty-move': '50-move rule', insufficient: 'insufficient material', agreement: 'agreement', 'timeout-vs-insufficient': 'time vs. insufficient material',
};

export function resultLine(r: GameResult | null, names: [string, string]) {
  if (!r) return 'Unfinished';
  if (r.winner === null) return `Draw · ${REASON[r.reason]}`;
  return `${names[r.winner]} won · ${REASON[r.reason]}`;
}

function PlayerStrip({ frame, state, player, name, pieceSet, bot, accuracy }: {
  frame: Frame; state: GameState; player: PlayerId; name: string; pieceSet: PieceSet; bot: boolean; accuracy: number | null;
}) {
  const color = state.colorOf[player];
  const clocks = clocksAt(frame);
  const active = state.current === player && state.phase !== 'over';
  const card = active && state.phase === 'moving' ? state.card : null;
  return (
    <div className={`replay-player zone-${color} ${active ? 'on' : ''}`} data-testid={`replay-player-${player}`}>
      <div className={`avatar avatar-${color}`}><Piece piece={color === 'w' ? 'K' : 'k'} set={pieceSet} /></div>
      <div className="rp-id">
        <div className="rp-name">{name}{bot && <span className="bot-tag">BOT</span>}</div>
        <div className="rp-sub">{color === 'w' ? 'White' : 'Black'}{accuracy !== null && <> · <b>{Math.round(accuracy)}%</b> accuracy</>}</div>
      </div>
      <div className="rp-cards" aria-label="Cards">
        {card && (
          <div className="rp-turn-card" title="Card for this turn">
            <CardFace kind={card.kind} size="xs" />
            <span className="rp-pips">{Array.from({ length: state.movesAllowed }, (_, i) => <i key={i} className={i < state.movesMade ? 'done' : ''} />)}</span>
          </div>
        )}
        {state.hands[player].map((c) => <CardFace key={c.id} kind={c.kind} size="xs" className="rp-held" />)}
        {!card && !state.hands[player].length && <span className="rp-none">no held cards</span>}
      </div>
      <div className={`clock rp-clock ${active ? 'clock-running' : ''}`} data-testid={`replay-clock-${player}`}>{formatClock(clocks[player])}</div>
    </div>
  );
}

function frameText(f: Frame, names: [string, string]): { text: string; tone: string } | null {
  const ev = f.state.events as GameEvent[];
  const pick = <T extends GameEvent['type']>(t: T) => ev.find((e) => e.type === t) as Extract<GameEvent, { type: T }> | undefined;
  const over = pick('gameOver');
  if (over) return { text: over.result.winner === null ? 'Draw' : `${names[over.result.winner]} wins`, tone: 'over' };
  const rev = pick('reverse');
  const burn = pick('burnCard');
  if (rev) return { text: burn ? 'REVERSE! Sides swapped (their other Reverse is now dead)' : 'REVERSE! Sides swapped', tone: 'reverse' };
  const skipped = pick('skipped');
  const play = pick('playCard');
  if (play && play.card.kind === 'skip') return { text: `SKIP! ${names[play.player]} goes again`, tone: 'skip' };
  if (skipped) return { text: `${names[skipped.player]}'s turn is skipped`, tone: 'skip' };
  const end = pick('turnEnd');
  if (end?.reason === 'check') return { text: 'CHECK — turn over', tone: 'check' };
  const draws = ev.filter((e): e is Extract<GameEvent, { type: 'draw' }> => e.type === 'draw');
  if (draws.length) {
    const held = draws.filter((d) => d.toHand).map((d) => (d.card.kind === 'skip' ? 'a Skip' : 'a Reverse'));
    const num = draws.find((d) => !d.toHand);
    const who = names[draws[0].player];
    const n = num ? `a ${num.card.kind}${num.capped ? ' (opening turn: 1 move)' : ''}` : '';
    if (burn) return { text: `${who} drew a dead Reverse (already used) — discarded${n ? `, then ${n}` : ''}`, tone: 'draw' };
    if (!held.length) return { text: `${who} drew ${n}`, tone: 'draw' };
    return { text: `${who} drew ${held.join(' and ')} for the hand${n ? `, then ${n}` : ''}`, tone: 'draw' };
  }
  return null;
}

function EventChip({ frame, names }: { frame: Frame; names: [string, string] }) {
  const t = frameText(frame, names);
  if (!t) return null;
  return <div className={`event-chip chip-${t.tone}`} key={frame.at + t.text} data-testid="event-chip">{t.text}</div>;
}

function Controls({ fi, nav, frames, playing, speed, review, onGo, onStep, onTurn, onPlay, onSpeed }: {
  fi: number; nav: number[]; frames: Frame[]; playing: boolean; speed: number; review: GameReview | null;
  onGo: (i: number, animate?: boolean) => void; onStep: (d: 1 | -1) => void; onTurn: (d: 1 | -1) => void; onPlay: () => void; onSpeed: () => void;
}) {
  const pos = nav.indexOf(fi);
  const last = nav.length - 1;
  const f = frames[fi];
  const tn = useContext(TurnNo);
  const turnNo = tn(f.turn);
  const markers = review?.turns.filter((t) => t.label && ['blunder', 'mistake', 'brilliant', 'great'].includes(t.label)) ?? [];
  return (
    <div className="replay-controls" data-testid="replay-controls">
      <div className="scrub">
        <div className="scrub-track">
          <div className="scrub-fill" style={{ width: `${(pos / Math.max(1, last)) * 100}%` }} />
          {markers.map((t) => {
            const k = nav.findIndex((i) => i >= t.frameEnd);
            return <span key={t.turn} className={`scrub-mark mark-${t.label}`} style={{ left: `${(Math.max(0, k) / Math.max(1, last)) * 100}%` }} title={`${LABEL_TEXT[t.label!]} · turn ${tn(t.turn)}`} />;
          })}
        </div>
        <input type="range" min={0} max={last} value={pos} onChange={(e) => onGo(nav[Number(e.target.value)], false)} aria-label="Scrub through the game" data-testid="scrub" />
      </div>
      <div className="ctl-row">
        <button className="ctl" onClick={() => onGo(0, false)} aria-label="Start" data-testid="ctl-start">⏮</button>
        <button className="ctl" onClick={() => onTurn(-1)} aria-label="Previous turn" data-testid="ctl-prev-turn">⏪</button>
        <button className="ctl" onClick={() => onStep(-1)} aria-label="Previous move" data-testid="ctl-prev">◀</button>
        <button className="ctl ctl-play" onClick={onPlay} aria-label={playing ? 'Pause' : 'Play'} data-testid="ctl-play">{playing ? '❚❚' : '▶'}</button>
        <button className="ctl" onClick={() => onStep(1)} aria-label="Next move" data-testid="ctl-next">▶</button>
        <button className="ctl" onClick={() => onTurn(1)} aria-label="Next turn" data-testid="ctl-next-turn">⏩</button>
        <button className="ctl" onClick={() => onGo(nav[last], false)} aria-label="End" data-testid="ctl-end">⏭</button>
        <button className="ctl ctl-speed" onClick={onSpeed} aria-label="Playback speed" data-testid="ctl-speed">{speed}×</button>
      </div>
      <div className="ctl-pos">Turn {turnNo} · step {pos + 1}/{last + 1}</div>
    </div>
  );
}

function LabelPill({ label, small }: { label: Label; small?: boolean }) {
  return <span className={`label-pill lbl-${label} ${small ? 'sm' : ''}`}><b>{LABEL_ICON[label]}</b>{!small && LABEL_TEXT[label]}</span>;
}

function Coach({ turn, frame, line, review, progress, failed, names, onShowLine, onPlayLine, onExitLine, onOpenReview }: {
  turn: TurnReview | null; frame: Frame; line: LineView | null; review: GameReview | null; progress: number | null; failed: boolean; names: [string, string];
  onShowLine: (t: TurnReview) => void; onPlayLine: () => void; onExitLine: () => void; onOpenReview?: () => void;
}) {
  const tn = useContext(TurnNo);
  if (line?.turn.best) {
    const t = line.turn;
    return (
      <div className="coach coach-line" data-testid="coach-line">
        <div className="coach-head">
          <LabelPill label={t.label!} />
          <span className="coach-who">Better line · {names[t.player]} · turn {tn(t.turn)} · {t.card}-card</span>
        </div>
        <p className="coach-text">{t.text}</p>
        <div className="coach-moves">
          <span className="legend best">Better</span><b>{t.best!.san.join('  ')}</b>
          {t.actual.join(' ') !== t.best!.san.join(' ') && <><span className="legend played">Played</span><span>{t.actual.join('  ')}</span></>}
        </div>
        <div className="coach-actions">
          <button className="btn primary small" onClick={onPlayLine} data-testid="play-line">{line.step ? '↻ Replay line' : '▶ Play the line'}</button>
          <button className="btn ghost small" onClick={onExitLine} data-testid="exit-line">Back to game</button>
        </div>
      </div>
    );
  }
  if (!review) {
    return (
      <div className="coach coach-wait" data-testid="coach-wait">
        {failed ? <span>Analysis unavailable for this game.</span> : (
          <>
            <span>Review bot is analysing every turn…</span>
            <div className="coach-progress"><div style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} /></div>
          </>
        )}
      </div>
    );
  }
  if (frame.state.phase === 'over') {
    const r = frame.state.result;
    return (
      <div className="coach coach-end" data-testid="coach-end">
        <div className="coach-head"><b>{r ? resultLine(r, names) : 'Game over'}</b></div>
        <p className="coach-text">
          Accuracy — {names[0]} <b>{review.players[0].accuracy === null ? '—' : `${Math.round(review.players[0].accuracy)}%`}</b>, {names[1]} <b>{review.players[1].accuracy === null ? '—' : `${Math.round(review.players[1].accuracy)}%`}</b>.
          {review.keyMoments.length > 0 && ` ${review.keyMoments.length} key moment${review.keyMoments.length === 1 ? '' : 's'} to look at.`}
        </p>
        {onOpenReview && <button className="btn ghost small" onClick={onOpenReview} data-testid="open-review">See the full review ↓</button>}
      </div>
    );
  }
  if (!turn || !turn.label || frame.kind === 'start') {
    return <div className="coach coach-idle"><span>Step through the game — each turn gets a verdict from the review bot.</span></div>;
  }
  return (
    <div className={`coach coach-${turn.label}`} data-testid="coach">
      <div className="coach-head">
        <LabelPill label={turn.label} />
        <span className="coach-who">{names[turn.player]} · turn {tn(turn.turn)}{turn.card ? ` · drew a ${turn.card}` : ''}</span>
      </div>
      <p className="coach-text" data-testid="coach-text">{turn.text}</p>
      {hasBetterLine(turn) && <button className="btn ghost small" onClick={() => onShowLine(turn)} data-testid="show-line">Show better line ↗</button>}
    </div>
  );
}

function TurnList({ replay, fi, reviewByTurn, onGo }: { replay: Replay; fi: number; reviewByTurn: Map<number, TurnReview>; onGo: (i: number) => void }) {
  const ref = useRef<HTMLOListElement>(null);
  const cur = replay.frames[fi].turn;
  useEffect(() => {
    // Scroll the list itself (never the page, which would move the board away).
    const list = ref.current;
    const el = list?.querySelector('.cur') as HTMLElement | null;
    if (!list || !el) return;
    const top = el.offsetTop;
    if (top < list.scrollTop || top + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top - list.clientHeight / 2 + el.offsetHeight / 2;
  }, [cur]);
  const names = replay.record.config.players.map((p) => p.name);
  return (
    <ol className="turn-list" ref={ref} data-testid="turn-list">
      {replay.final.history.map((t, i) => {
        const r = reviewByTurn.get(i);
        const start = replay.turnStarts[i];
        return (
          <li key={i} className={`${i === cur ? 'cur' : ''} tl-${t.color}`}>
            <button onClick={() => start !== undefined && onGo(start)}>
              <span className="tl-n">{t.skipped ? '' : t.turn}</span>
              <span className={`log-dot dot-${t.color}`} />
              <span className="tl-who">{names[t.player]}</span>
              <span className="tl-cards">
                {t.played.map((p, k) => <CardFace key={`p${k}`} kind={p} size="xs" />)}
                {t.card && <CardFace kind={t.card} size="xs" />}
                {t.toHand.length > 0 && <span className="tl-hand">+{t.toHand.length}</span>}
                {!!t.burned?.length && <span className="tl-burn" title="Dead Reverse discarded (already used)">⇄✕</span>}
              </span>
              <span className="tl-moves">{t.skipped ? 'skipped' : t.played.includes('reverse') && !t.moves.length ? 'Reverse' : t.moves.join(' ')}{t.endedByCheck && t.moves.length && !t.moves[t.moves.length - 1].includes('#') ? '' : ''}</span>
              {r?.label && <LabelPill label={r.label} small />}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- review summary

function ReviewPanel({ record, review, progress, failed, fi, frames, onGo, onShowLine }: {
  record: GameRecord; review: GameReview | null; progress: number | null; failed: boolean; fi: number; frames: Frame[];
  onGo: (i: number) => void; onShowLine: (t: TurnReview) => void;
}) {
  const names = record.config.players.map((p) => p.name) as [string, string];
  if (!review) {
    return (
      <div className="review-panel review-wait" data-testid="review-wait">
        {failed ? <p>The review bot couldn't analyse this game.</p> : (
          <>
            <div className="review-spinner" />
            <p>Analysing {frames[frames.length - 1].state.history.length} turns{progress !== null ? ` — ${Math.round(progress * 100)}%` : ''}</p>
            <small>Runs on this device, works offline.</small>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="review-panel" data-testid="review-summary">
      <div className="acc-row">
        {([0, 1] as PlayerId[]).map((p) => <AccuracyCard key={p} name={names[p]} p={p} review={review} />)}
      </div>
      <EvalGraph review={review} names={names} fi={fi} frames={frames} onGo={onGo} />
      <LuckMeter review={review} names={names} />
      <KeyMoments review={review} names={names} onGo={onGo} onShowLine={onShowLine} />
      <LabelTable review={review} names={names} />
      <p className="review-foot">Review bot: deeper search than the hardest bot, judged for the exact card drawn each turn. Analysed in {(review.ms / 1000).toFixed(1)} s.</p>
    </div>
  );
}

function AccuracyCard({ name, p, review }: { name: string; p: PlayerId; review: GameReview }) {
  const acc = review.players[p].accuracy;
  const r = 26, c = 2 * Math.PI * r;
  return (
    <div className={`acc-card acc-p${p}`} data-testid={`accuracy-${p}`}>
      <svg viewBox="0 0 64 64" className="acc-ring">
        <circle cx="32" cy="32" r={r} className="ring-bg" />
        <circle cx="32" cy="32" r={r} className="ring-fg" strokeDasharray={`${((acc ?? 0) / 100) * c} ${c}`} />
        <text x="32" y="36">{acc === null ? '—' : Math.round(acc)}</text>
      </svg>
      <div><b>{name}</b><small>accuracy</small></div>
    </div>
  );
}

function EvalGraph({ review, names, fi, frames, onGo }: { review: GameReview; names: [string, string]; fi: number; frames: Frame[]; onGo: (i: number) => void }) {
  const tn = useContext(TurnNo);
  const pts = review.graph;
  const W = 320, H = 120, n = Math.max(1, pts.length - 1);
  const x = (i: number) => (i / n) * W;
  const y = (v: number) => H - (winChance(v) / 100) * H;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const area = `${path} L${W} ${H / 2} L0 ${H / 2} Z`;
  const curTurn = frames[fi].turn;
  const curIdx = Math.max(0, pts.findIndex((p, i) => i > 0 && p.turn >= curTurn));
  const marks = review.turns.map((t, i) => ({ t, i: i + 1 })).filter(({ t }) => t.label && ['blunder', 'mistake', 'brilliant', 'great', 'inaccuracy'].includes(t.label));
  return (
    <div className="eval-card" data-testid="eval-graph">
      <div className="eval-head"><b>Evaluation</b><span><i className="sw sw0" />{names[0]} <i className="sw sw1" />{names[1]}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="eval-svg" preserveAspectRatio="none">
        <defs>
          <clipPath id="eval-top"><rect x="0" y="0" width={W} height={H / 2} /></clipPath>
          <clipPath id="eval-bot"><rect x="0" y={H / 2} width={W} height={H / 2} /></clipPath>
        </defs>
        <path d={area} className="eval-area-p0" clipPath="url(#eval-top)" />
        <path d={area} className="eval-area-p1" clipPath="url(#eval-bot)" />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="eval-mid" />
        <path d={path} className="eval-line" />
        {curIdx > 0 && <line x1={x(curIdx)} x2={x(curIdx)} y1="0" y2={H} className="eval-cursor" />}
      </svg>
      <div className="eval-marks">
        {marks.map(({ t, i }) => (
          <button key={t.turn} className={`eval-mark mark-${t.label}`} style={{ left: `${(i / n) * 100}%`, top: `${(y(t.evalAfter) / H) * 100}%` }}
            onClick={() => onGo(t.frameEnd)} title={`${LABEL_TEXT[t.label!]} — ${names[t.player]}, turn ${tn(t.turn)}`} aria-label={`${LABEL_TEXT[t.label!]} turn ${tn(t.turn)}`} />
        ))}
      </div>
      <div className="eval-axis"><span>{names[0]} winning</span><span>{names[1]} winning</span></div>
    </div>
  );
}

function LuckMeter({ review, names }: { review: GameReview; names: [string, string] }) {
  const [a, b] = review.players;
  const diff = a.luck - b.luck; // positive: player 0 got the better cards
  const pos = 50 + Math.max(-45, Math.min(45, diff * 6));
  const verdict = Math.abs(diff) < 1.5 ? 'The cards were even — this game was decided by play.' : `${diff > 0 ? names[0] : names[1]} drew the luckier cards (${Math.abs(diff).toFixed(1)}% swing per turn).`;
  return (
    <div className="luck-card" data-testid="luck-meter">
      <div className="eval-head"><b>Luck meter</b><span>cards drawn vs the deck average</span></div>
      <div className="luck-bar">
        <span className="luck-side">{names[1]}</span>
        <div className="luck-track"><div className="luck-mid" /><div className="luck-needle" style={{ left: `${pos}%` }} /></div>
        <span className="luck-side">{names[0]}</span>
      </div>
      <p>{verdict}</p>
      <div className="luck-stats">
        {([0, 1] as PlayerId[]).map((p) => (
          <div key={p}>
            <b>{names[p]}</b>
            <span>avg card <b>{review.players[p].avgCard?.toFixed(2) ?? '—'}</b> <small>(deck {(review.expectedCard ?? EXPECTED_CARD).toFixed(2)})</small></span>
            <span>{review.players[p].actionCards} action card{review.players[p].actionCards === 1 ? '' : 's'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KeyMoments({ review, names, onGo, onShowLine }: { review: GameReview; names: [string, string]; onGo: (i: number) => void; onShowLine: (t: TurnReview) => void }) {
  const tn = useContext(TurnNo);
  if (!review.keyMoments.length) return null;
  return (
    <div className="moments" data-testid="key-moments">
      <div className="eval-head"><b>Key moments</b></div>
      {review.keyMoments.map((k) => {
        const t = review.turns[k];
        return (
          <div key={k} className={`moment mom-${t.label}`}>
            <div className="moment-head">
              {t.label && <LabelPill label={t.label} small />}
              <b>Turn {tn(t.turn)} · {names[t.player]}</b>
              {t.card && <CardFace kind={t.card} size="xs" />}
            </div>
            <p>{t.text}</p>
            <div className="moment-actions">
              <button className="btn ghost tiny" onClick={() => onGo(t.frameEnd)}>View</button>
              {hasBetterLine(t) && <button className="btn ghost tiny" onClick={() => onShowLine(t)} data-testid="moment-line">Better line</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LabelTable({ review, names }: { review: GameReview; names: [string, string] }) {
  const rows: Label[] = ['brilliant', 'great', 'best', 'good', 'inaccuracy', 'mistake', 'blunder'];
  return (
    <table className="label-table" data-testid="label-table">
      <thead><tr><th>{names[0]}</th><th /><th>{names[1]}</th></tr></thead>
      <tbody>
        {rows.map((l) => (
          <tr key={l}>
            <td>{review.players[0].counts[l]}</td>
            <td><LabelPill label={l} /></td>
            <td>{review.players[1].counts[l]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ShareReplay({ gameId }: { gameId: string }) {
  const [done, setDone] = useState(false);
  const link = `${location.origin}${location.pathname}?replay=${gameId}`;
  return (
    <button className="btn ghost small share-btn" data-testid="share-replay" title="Copy a link to this replay"
      onClick={async () => {
        try {
          if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'Chess Uno replay', url: link });
          else await navigator.clipboard.writeText(link);
        } catch { /* cancelled or blocked */ }
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}>
      {done ? '✓ Link copied' : '🔗 Share'}
    </button>
  );
}

export { CardBack };
