import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useBoardInteraction } from './useBoardInteraction';
import { reducedMotion } from './settings/store';
import { type Color, colorOfPiece, fileOf, rankOf, squareName } from '../rules/chess';
import type { GameState } from '../rules/game';
import { Piece, type PieceSet } from './pieces';

export interface LastMoveAnim {
  key: number;
  from: number;
  to: number;
}

/** An analysis arrow (replay/review): the engine's better line, the move played, or a threat. */
export interface BoardArrow {
  from: number;
  to: number;
  tone: 'best' | 'played' | 'threat';
  /** Small number/label at the arrow head (e.g. move order 1, 2, 3). */
  label?: string;
}

export interface BoardProps {
  state: GameState;
  bottomColor: Color;
  /** Pass & Play: pieces of the top player face them (rotated 180°). */
  faceTopPieces: boolean;
  topColor: Color;
  interactive: boolean;
  pieceSet: PieceSet;
  anim: LastMoveAnim | null;
  onMove: (from: number, to: number) => void;
  onPromotion: (from: number, to: number) => void;
  arrows?: BoardArrow[];
}

export function Board({ state, bottomColor, faceTopPieces, topColor, interactive, pieceSet, anim, onMove, onPromotion, arrows }: BoardProps) {
  // Cumulative rotation so the board always spins the same way on Reverse.
  const [angle, setAngle] = useState(bottomColor === 'w' ? 0 : 180);
  const prevBottom = useRef(bottomColor);
  useEffect(() => {
    if (prevBottom.current !== bottomColor) {
      prevBottom.current = bottomColor;
      setAngle((a) => a + 180);
    }
  }, [bottomColor]);

  const { selected, hintTargets: targets, mover, moveBadge, fromSquares, badgeColor, checked, click } = useBoardInteraction(state, interactive, onMove, onPromotion);

  const squares = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const sq = (7 - row) * 8 + col;
      const piece = state.pos.board[sq];
      const light = (fileOf(sq) + rankOf(sq)) % 2 === 1;
      const pieceAngle = -angle + (faceTopPieces && piece && colorOfPiece(piece) === topColor ? 180 : 0);
      const target = targets.has(sq);
      const fileLabel = rankOf(sq) === (bottomColor === 'w' ? 0 : 7);
      const rankLabel = fileOf(sq) === (bottomColor === 'w' ? 0 : 7);
      squares.push(
        <div
          key={sq}
          className={[
            'sq', light ? 'sq-light' : 'sq-dark',
            selected === sq && 'sq-selected',
            fromSquares.has(sq) && 'sq-from',
            moveBadge.has(sq) && 'sq-to',
            checked.has(sq) && 'sq-check',
            target && (piece ? 'sq-target-capture' : 'sq-target'),
            interactive && piece && colorOfPiece(piece) === mover && 'sq-movable',
          ].filter(Boolean).join(' ')}
          data-square={squareName(sq)}
          onClick={() => click(sq)}
        >
          {(fileLabel || rankLabel) && (
            <span className="coords" style={{ transform: `rotate(${-angle}deg)` }}>
              {rankLabel && <span className="coord-rank">{rankOf(sq) + 1}</span>}
              {fileLabel && <span className="coord-file">{'abcdefgh'[fileOf(sq)]}</span>}
            </span>
          )}
          {piece && (
            <PieceSlot key={`${sq}-${piece}`} anim={anim && anim.to === sq ? anim : null}>
              <div className="piece-face" style={{ transform: `rotate(${pieceAngle}deg)` }}>
                <Piece piece={piece} set={pieceSet} />
              </div>
            </PieceSlot>
          )}
          {moveBadge.has(sq) && (
            <span className="badge-layer" style={{ transform: `rotate(${-angle}deg)` }}>
              <span className={`move-badge badge-${badgeColor}`}>{moveBadge.get(sq)}</span>
            </span>
          )}
        </div>,
      );
    }
  }

  return (
    <div className="board-frame">
      <div className="board" style={{ transform: `rotate(${angle}deg)` }}>
        {squares}
        {arrows && arrows.length > 0 && <ArrowLayer arrows={arrows} angle={angle} />}
      </div>
    </div>
  );
}

function PieceSlot({ anim, children }: { anim: LastMoveAnim | null; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!anim || !ref.current || done.current === anim.key) return;
    done.current = anim.key;
    if (reducedMotion()) return;
    const dx = (fileOf(anim.from) - fileOf(anim.to)) * 100;
    const dy = (rankOf(anim.to) - rankOf(anim.from)) * 100;
    ref.current.animate(
      [{ transform: `translate(${dx}%, ${dy}%) scale(1.08)`, zIndex: 5 }, { transform: 'translate(0,0) scale(1)', zIndex: 5 }],
      { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  }, [anim]);
  return <div ref={ref} className="piece-slot">{children}</div>;
}

const center = (sq: number): [number, number] => [fileOf(sq) + 0.5, 7 - rankOf(sq) + 0.5];

/** SVG arrows over the squares (rotates with the board; labels stay upright). */
export function ArrowLayer({ arrows, angle }: { arrows: BoardArrow[]; angle: number }) {
  return (
    <svg className="board-arrows" viewBox="0 0 8 8" aria-hidden="true" data-testid="board-arrows">
      <defs>
        {(['best', 'played', 'threat'] as const).map((t) => (
          <marker key={t} id={`ah-${t}`} viewBox="0 0 10 10" refX="5.5" refY="5" markerWidth="3.1" markerHeight="3.1" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className={`arrow-head arrow-${t}`} />
          </marker>
        ))}
      </defs>
      {arrows.map((a, i) => {
        const [x1, y1] = center(a.from);
        const [x2, y2] = center(a.to);
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
        // Start just off the piece, stop short so the head sits on the target square.
        const sx = x1 + ux * 0.22, sy = y1 + uy * 0.22, ex = x2 - ux * 0.3, ey = y2 - uy * 0.3;
        const lx = x2 - ux * 0.08, ly = y2 - uy * 0.08;
        return (
          <g key={i} className={`arrow arrow-${a.tone}`} style={{ animationDelay: `${i * 0.08}s` }}>
            <line x1={sx} y1={sy} x2={ex} y2={ey} markerEnd={`url(#ah-${a.tone})`} />
            {a.label && (
              <g transform={`rotate(${-angle} ${lx} ${ly})`}>
                <circle cx={lx + 0.27} cy={ly - 0.27} r="0.2" className="arrow-label-bg" />
                <text x={lx + 0.27} y={ly - 0.27} className="arrow-label">{a.label}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
