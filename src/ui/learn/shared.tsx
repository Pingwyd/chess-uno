import { reducedMotion } from '../settings/store';
import { Fragment, type ReactNode } from 'react';
import type { CardKind } from '../../rules/cards';
import { CardFace } from '../Card';
import type { PieceSet } from '../pieces';
import type { BoardMode } from '../BoardView';
import { Icon } from '../icons';

export interface BoardEnv {
  pieceSet: PieceSet;
  boardMode: BoardMode;
  onToggleBoard: () => void;
  onBoardUnavailable: () => void;
}

/** Tiny formatter: **bold** spans, nothing else. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <Fragment key={i}>{p}</Fragment>))}</>;
}

export function CardRow({ cards }: { cards: CardKind[] }) {
  return (
    <div className="learn-cards">
      {cards.map((c, i) => <CardFace key={i} kind={c} size="sm" className="learn-card" />)}
    </div>
  );
}

/** Reduced motion: the Settings choice, or the OS preference when set to "system". */
export const prefersReducedMotion = () => reducedMotion();

export function Stars({ n, size = 'md', animate = false }: { n: number; size?: 'sm' | 'md' | 'lg'; animate?: boolean }) {
  return (
    <span className={`stars stars-${size} ${animate ? 'stars-anim' : ''}`} aria-label={`${n} of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`star ${i <= n ? 'on' : ''}`} style={{ animationDelay: `${0.25 + i * 0.28}s` }}><Icon name="star" size="1em" className="star-svg" /></span>
      ))}
    </span>
  );
}

/** A square board area sized for lessons (mobile-first). */
export function BoardBox({ children }: { children: ReactNode }) {
  return <div className="learn-board">{children}</div>;
}
