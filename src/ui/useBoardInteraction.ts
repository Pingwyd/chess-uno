import { useEffect, useMemo, useState } from 'react';
import { type Color, type Move, colorOfPiece, inCheck, kingSquare } from '../rules/chess';
import { currentColor, currentLegalMoves, type GameState } from '../rules/game';

/** Selection, legal targets, move badges and check squares — shared by the 2D and 3D boards. */
export function useBoardInteraction(
  state: GameState,
  interactive: boolean,
  onMove: (from: number, to: number) => void,
  onPromotion: (from: number, to: number) => void,
) {
  const [selected, setSelected] = useState<number | null>(null);
  const legal = useMemo(() => (interactive ? currentLegalMoves(state) : []), [state, interactive]);
  const mover = currentColor(state);
  useEffect(() => setSelected(null), [state.movesMade, state.turnNumber, state.phase]);

  const targets = useMemo(() => {
    const map = new Map<number, Move[]>();
    if (selected === null) return map;
    for (const m of legal) if (m.from === selected) map.set(m.to, [...(map.get(m.to) ?? []), m]);
    return map;
  }, [legal, selected]);

  const movable = useMemo(() => new Set(legal.map((m) => m.from)), [legal]);

  const shownMoves = state.turnMoves.length ? state.turnMoves : state.lastTurnMoves;
  const moveBadge = new Map<number, number>();
  const fromSquares = new Set<number>();
  shownMoves.forEach((m, i) => { moveBadge.set(m.to, i + 1); fromSquares.add(m.from); });
  const badgeColor: Color = shownMoves[0] ? colorOfPiece(shownMoves[0].piece) : 'w';

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
    if (piece && colorOfPiece(piece) === mover && movable.has(sq)) setSelected(sq === selected ? null : sq);
    else setSelected(null);
  };

  return { selected, targets, movable, mover, moveBadge, fromSquares, badgeColor, checked, click };
}
