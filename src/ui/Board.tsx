import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type Color, type Move, colorOfPiece, fileOf, inCheck, kingSquare, rankOf, squareName } from '../rules/chess';
import { currentColor, currentLegalMoves, type GameState } from '../rules/game';
import { Piece, type PieceSet } from './pieces';

export interface LastMoveAnim {
  key: number;
  from: number;
  to: number;
}

interface Props {
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
}

export function Board({ state, bottomColor, faceTopPieces, topColor, interactive, pieceSet, anim, onMove, onPromotion }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  // Cumulative rotation so the board always spins the same way on Reverse.
  const [angle, setAngle] = useState(bottomColor === 'w' ? 0 : 180);
  const prevBottom = useRef(bottomColor);
  useEffect(() => {
    if (prevBottom.current !== bottomColor) {
      prevBottom.current = bottomColor;
      setAngle((a) => a + 180);
    }
  }, [bottomColor]);

  const legal = useMemo(() => (interactive ? currentLegalMoves(state) : []), [state, interactive]);
  const mover = currentColor(state);
  useEffect(() => setSelected(null), [state.movesMade, state.turnNumber, state.phase]);

  const targets = useMemo(() => {
    const map = new Map<number, Move[]>();
    if (selected === null) return map;
    for (const m of legal) if (m.from === selected) map.set(m.to, [...(map.get(m.to) ?? []), m]);
    return map;
  }, [legal, selected]);

  const shownMoves = state.turnMoves.length ? state.turnMoves : state.lastTurnMoves;
  const moveBadge = new Map<number, number>();
  const fromSquares = new Set<number>();
  shownMoves.forEach((m, i) => { moveBadge.set(m.to, i + 1); fromSquares.add(m.from); });
  const badgeColor = shownMoves[0] ? colorOfPiece(shownMoves[0].piece) : 'w';

  const checked = new Set<number>();
  for (const c of ['w', 'b'] as Color[]) if (inCheck(state.pos, c)) checked.add(kingSquare(state.pos.board, c));

  const click = (sq: number) => {
    if (!interactive) return;
    const piece = state.pos.board[sq];
    if (selected !== null && targets.has(sq)) {
      const ms = targets.get(sq)!;
      if (ms.some((m) => m.promotion)) onPromotion(selected, sq);
      else onMove(selected, sq);
      setSelected(null);
      return;
    }
    if (piece && colorOfPiece(piece) === mover && legal.some((m) => m.from === sq)) setSelected(sq === selected ? null : sq);
    else setSelected(null);
  };

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
            <span className={`move-badge badge-${badgeColor}`} style={{ transform: `rotate(${-angle}deg)` }}>{moveBadge.get(sq)}</span>
          )}
        </div>,
      );
    }
  }

  return (
    <div className="board-frame">
      <div className="board" style={{ transform: `rotate(${angle}deg)` }}>
        {squares}
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
    const dx = (fileOf(anim.from) - fileOf(anim.to)) * 100;
    const dy = (rankOf(anim.to) - rankOf(anim.from)) * 100;
    ref.current.animate(
      [{ transform: `translate(${dx}%, ${dy}%) scale(1.08)`, zIndex: 5 }, { transform: 'translate(0,0) scale(1)', zIndex: 5 }],
      { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  }, [anim]);
  return <div ref={ref} className="piece-slot">{children}</div>;
}
