import { useEffect, useMemo, useState } from 'react';
import { demoFrames } from '../../learn/engine';
import type { Demo } from '../../learn/types';
import { BoardView } from '../BoardView';
import type { LastMoveAnim } from '../Board';
import { CardFace } from '../Card';
import { BoardBox, prefersReducedMotion, type BoardEnv } from './shared';
import { Icon } from '../icons';

/** Auto-playing board animation for explainer steps, driven by the real rules engine. */
export function DemoBoard({ demo, env }: { demo: Demo; env: BoardEnv }) {
  const frames = useMemo(() => demoFrames(demo), [demo]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(!prefersReducedMotion());
  useEffect(() => {
    if (!playing) return;
    const last = i >= frames.length - 1;
    const id = setTimeout(() => setI(last ? 0 : i + 1), i === 0 ? 1200 : last ? 2600 : 1150);
    return () => clearTimeout(id);
  }, [i, playing, frames.length]);

  const s = frames[i];
  const prev = frames[Math.max(0, i - 1)];
  const lastMove = i > 0 && s.events.length > prev.events.length ? [...s.events].reverse().find((e) => e.type === 'move') : undefined;
  const anim: LastMoveAnim | null = lastMove && lastMove.type === 'move' ? { key: i, from: lastMove.move.from, to: lastMove.move.to } : null;
  const bottom = demo.bottom ?? frames[0].colorOf[0];
  const reversed = s.colorOf[0] !== frames[0].colorOf[0];
  const fresh = i > 0 ? s.events.slice(prev.events.length) : [];
  const mover = prev.colorOf[prev.current] === 'w' ? 'White' : 'Black';
  const drawn = [...s.events].reverse().find((e) => e.type === 'draw' && !e.toHand);
  const card = s.phase === 'moving' ? s.card?.kind : prev.phase === 'moving' ? prev.card?.kind : drawn && drawn.type === 'draw' ? drawn.card.kind : undefined;
  let caption = 'Watch…';
  if (fresh.some((e) => e.type === 'gameOver')) caption = s.result?.reason === 'checkmate' ? 'Checkmate!' : 'Game over';
  else if (fresh.some((e) => e.type === 'reverse')) caption = 'Reverse! The players swap sides.';
  else if (fresh.some((e) => e.type === 'turnEnd' && e.reason === 'check')) caption = `Check! ${mover}’s turn ends right here.`;
  else if (fresh.some((e) => e.type === 'playCard' && e.card.kind === 'skip')) caption = `${mover} plays Skip — two turns in a row.`;
  else if (fresh.some((e) => e.type === 'skipped')) caption = 'Opponent skipped — go again!';
  else if (fresh.some((e) => e.type === 'draw' && e.toHand)) caption = `${mover} drew an action card into their hand and draws again.`;
  else {
    const mv = fresh.find((e) => e.type === 'move');
    if (mv && mv.type === 'move') {
      const rec = [...s.history].reverse().find((t) => t.player === mv.player && t.card);
      caption = `${mover}: move ${mv.index} of ${rec?.capped ? 1 : Number(rec?.card ?? 1)}`;
    } else if (i > 0) caption = `${mover} draws a card`;
  }

  return (
    <div className="demo">
      <BoardBox>
        <BoardView
          mode={env.boardMode} onUnavailable={env.onBoardUnavailable}
          state={s} bottomColor={reversed ? (bottom === 'w' ? 'b' : 'w') : bottom} topColor={bottom === 'w' ? 'b' : 'w'} faceTopPieces={false}
          interactive={false} pieceSet={env.pieceSet} anim={anim} onMove={() => {}} onPromotion={() => {}}
        />
      </BoardBox>
      <div className="demo-bar">
        {card ? <CardFace kind={card} size="xs" /> : <span className="demo-dot" />}
        <span className="demo-caption" data-testid="demo-caption">{caption}</span>
        <button className="btn ghost small" onClick={() => { setPlaying(true); setI(0); }} aria-label="Replay demo"><Icon name="rotate-cw" size={15} /> Replay</button>
      </div>
    </div>
  );
}
