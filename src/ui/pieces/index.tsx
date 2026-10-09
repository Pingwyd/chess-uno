import { colorOfPiece, typeOf } from '../../rules/chess';
import { ArcanePiece } from './ArcanePieces';
import { ClassicPiece } from './ClassicPieces';

export type PieceSet = 'arcane' | 'classic';

export function Piece({ piece, set }: { piece: string; set: PieceSet }) {
  const white = colorOfPiece(piece) === 'w';
  const type = typeOf(piece);
  return set === 'classic' ? <ClassicPiece type={type} white={white} /> : <ArcanePiece type={type} white={white} />;
}

export { PieceDefs } from './PieceDefs';
