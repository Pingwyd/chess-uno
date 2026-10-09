import { useEffect, useMemo, useRef, useState } from 'react';
import { applyAction, cardBlockReason, type GameState } from '../../rules/game';
import type { ActionKind } from '../../rules/cards';
import type { PromotionPiece } from '../../rules/chess';
import {
  LEARNER, applyToken, createPuzzleGame, judge, needsDraw, playableCards, segmentOver, type Verdict,
} from '../../learn/engine';
import type { Puzzle } from '../../learn/types';
import { BoardView } from '../BoardView';
import type { LastMoveAnim } from '../Board';
import { CardBack, CardFace } from '../Card';
import { Piece } from '../pieces';
import { sfx } from '../sound';
import { BoardBox, prefersReducedMotion, Rich, type BoardEnv } from './shared';
import { Icon } from '../icons';

interface Props {
  puzzle: Puzzle;
  env: BoardEnv;
  onMistake: () => void;
  onHint: () => void;
  /** Continue pressed after the puzzle is finished. */
  onDone: () => void;
}

const SUCCESS = ['Brilliant!', 'Correct!', 'Nicely done!', 'Great move!'];

/** One interactive puzzle: a real Chess Uno game with a fixed position and fixed cards. */
export function PuzzleView({ puzzle, env, onMistake, onHint, onDone }: Props) {
  const fresh = () => createPuzzleGame(puzzle);
  const [s, setS] = useState<GameState>(fresh);
  const start = useRef<GameState>(s);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const [fails, setFails] = useState(0);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  const [anim, setAnim] = useState<LastMoveAnim | null>(null);
  const animKey = useRef(0);
  const praise = useMemo(() => SUCCESS[Math.floor(Math.random() * SUCCESS.length)], []);

  const act = (next: GameState) => {
    const before = s.events.length;
    const mv = [...next.events.slice(before)].reverse().find((e) => e.type === 'move');
    if (mv && mv.type === 'move') {
      setAnim({ key: ++animKey.current, from: mv.move.from, to: mv.move.to });
      const evs = next.events.slice(before);
      if (evs.some((e) => e.type === 'turnEnd' && e.reason === 'check')) sfx.check();
      else if (mv.move.flags & 1) sfx.capture();
      else sfx.move();
    } else if (next.events.slice(before).some((e) => e.type === 'draw')) {
      sfx.draw();
    }
    setS(next);
  };

  // Draw automatically when there is nothing to decide.
  useEffect(() => {
    if (verdict || revealing || segmentOver(s) || !needsDraw(s) || playableCards(s).length) return;
    const id = setTimeout(() => act(applyAction(s, { type: 'draw', player: LEARNER }, 0)), prefersReducedMotion() ? 0 : 450);
    return () => clearTimeout(id);
  }, [s, verdict, revealing]);

  // Judge once the learner's turn(s) are over.
  useEffect(() => {
    if (verdict || !segmentOver(s) || s === start.current) return;
    const v = judge(puzzle, start.current, s);
    const id = setTimeout(() => {
      setVerdict(v);
      if (revealing) return;
      if (v.ok) sfx.win(); else sfx.lose();
      if (!v.ok) { setFails((f) => f + 1); onMistake(); }
    }, revealing ? 500 : 350);
    return () => clearTimeout(id);
  }, [s, verdict]);

  const reset = () => {
    const g = fresh();
    start.current = g;
    setS(g);
    setVerdict(null);
    setPromo(null);
    setAnim(null);
  };

  const reveal = () => {
    reset();
    setRevealing(true);
    setRevealed(true);
    onMistake();
    let g = start.current;
    puzzle.solution.forEach((t, i) => {
      setTimeout(() => {
        const before = g;
        g = applyToken(g, t);
        const mv = [...g.events.slice(before.events.length)].reverse().find((e) => e.type === 'move');
        if (mv && mv.type === 'move') setAnim({ key: ++animKey.current, from: mv.move.from, to: mv.move.to });
        setS(g);
        if (i === puzzle.solution.length - 1) setRevealing(false);
      }, 700 + i * 950);
    });
  };

  const move = (from: number, to: number, promotion?: PromotionPiece) => {
    try {
      act(applyAction(s, { type: 'move', player: LEARNER, from, to, promotion }, 0));
    } catch { /* ignore illegal taps */ }
  };

  const playCard = (kind: ActionKind) => {
    const card = s.hands[LEARNER].find((c) => c.kind === kind);
    if (!card) return;
    if (kind === 'skip') sfx.skip(); else sfx.reverse();
    act(applyAction(s, { type: 'playCard', player: LEARNER, cardId: card.id }, 0));
  };

  const interactive = s.phase === 'moving' && s.current === LEARNER && !verdict && !revealing && !promo;
  const me = s.colorOf[LEARNER];
  const choosing = !verdict && !revealing && needsDraw(s) && playableCards(s).length > 0;
  const hand = s.hands[LEARNER];

  return (
    <div className="puzzle" data-testid="puzzle">
      <div className="puzzle-head">
        <p className="puzzle-prompt" data-testid="puzzle-prompt"><Rich text={puzzle.prompt} /></p>
        <button
          className={`btn ghost small hint-btn ${hint ? 'on' : ''}`}
          onClick={() => { if (!hint) onHint(); setHint(true); }}
          disabled={!!verdict?.ok || revealing}
          data-testid="hint"
        ><Icon name="lightbulb" size={15} /> Hint</button>
      </div>
      {hint && <div className="hint-bubble" data-testid="hint-text"><Rich text={puzzle.hint} /></div>}

      <div className="turn-strip">
        <div className="turn-card">
          {s.phase === 'moving' && s.card ? <CardFace kind={s.card.kind} size="sm" /> : <CardBack size="sm" />}
        </div>
        <div className="turn-info">
          {s.phase === 'moving' && s.current === LEARNER ? (
            <>
              <b>Move {Math.min(s.movesMade + 1, s.movesAllowed)} of {s.movesAllowed}</b>
              <div className="pips">{Array.from({ length: s.movesAllowed }, (_, i) => <span key={i} className={`pip ${i < s.movesMade ? 'done' : i === s.movesMade ? 'now' : ''}`} />)}</div>
            </>
          ) : choosing ? (
            <b>Play a card from your hand, or draw</b>
          ) : verdict || segmentOver(s) ? (
            <b>Turn over</b>
          ) : (
            <b>Drawing…</b>
          )}
          <small>You play {me === 'w' ? 'White' : 'Black'}{puzzle.cards.length > 1 ? ` · cards: ${puzzle.cards.join(', then ')}` : ''}</small>
        </div>
        {hand.length > 0 && (
          <div className="turn-hand">
            {hand.map((c) => {
              const blocked = cardBlockReason(s, LEARNER, c.kind as ActionKind);
              const canPlay = choosing && !blocked;
              return (
                <button key={c.id} className={`hand-play ${canPlay ? 'playable' : ''}`} disabled={!canPlay} onClick={() => playCard(c.kind as ActionKind)}
                  title={blocked ?? `Play ${c.kind}`} data-testid={`play-${c.kind}`}>
                  <CardFace kind={c.kind} size="xs" />
                  {blocked && s.phase === 'start' ? <span className="hand-lock"><Icon name="lock" size={14} label="Locked" /></span> : null}
                </button>
              );
            })}
          </div>
        )}
        {choosing && <button className="btn primary small" onClick={() => act(applyAction(s, { type: 'draw', player: LEARNER }, 0))} data-testid="draw">Draw</button>}
      </div>
      {hand.some((c) => c.kind === 'reverse') && s.phase === 'start' && cardBlockReason(s, LEARNER, 'reverse') && (
        <div className="lock-note"><Icon name="lock" size={13} /> {cardBlockReason(s, LEARNER, 'reverse')}</div>
      )}

      <BoardBox>
        <BoardView
          mode={env.boardMode} onUnavailable={env.onBoardUnavailable}
          state={s} bottomColor={me} topColor={me === 'w' ? 'b' : 'w'} faceTopPieces={false}
          interactive={interactive} pieceSet={env.pieceSet} anim={anim}
          onMove={(f, t) => move(f, t)} onPromotion={(f, t) => setPromo({ from: f, to: t })}
        />
        {promo && (
          <div className="promo-pop">
            <span>Promote to…</span>
            {(['q', 'r', 'b', 'n'] as PromotionPiece[]).map((p) => (
              <button key={p} className="promo-btn" onClick={() => { setPromo(null); move(promo.from, promo.to, p); }} data-testid={`promo-${p}`}>
                <Piece piece={me === 'w' ? p.toUpperCase() : p} set={env.pieceSet} />
              </button>
            ))}
          </div>
        )}
      </BoardBox>

      <div className="puzzle-tools">
        <button className="btn ghost small" onClick={reset} disabled={revealing || s === start.current} data-testid="reset"><Icon name="rotate-ccw" size={15} /> Reset</button>
        <button className="btn ghost small" onClick={env.onToggleBoard} data-testid="learn-toggle-board">{env.boardMode === '3d' ? '2D board' : '3D board'}</button>
      </div>

      {verdict && (
        <div className={`feedback ${verdict.ok ? 'good' : 'bad'}`} data-testid={verdict.ok ? 'feedback-correct' : 'feedback-wrong'} role="status">
          <div className="feedback-head">
            <span className="feedback-icon"><Icon name={verdict.ok ? 'check' : 'x'} size={18} strokeWidth={3} /></span>
            <b>{verdict.ok ? (revealed ? 'Here’s one way' : praise) : 'Not quite'}</b>
          </div>
          <p><Rich text={verdict.ok ? puzzle.explain : verdict.reason ?? 'That didn’t reach the goal.'} /></p>
          <div className="feedback-actions">
            {verdict.ok ? (
              <button className="btn primary wide" onClick={onDone} data-testid="continue">Continue</button>
            ) : (
              <>
                {fails >= 1 && <button className="btn ghost" onClick={reveal} data-testid="show-solution">Show solution</button>}
                <button className="btn primary" onClick={reset} data-testid="try-again">Try again</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
