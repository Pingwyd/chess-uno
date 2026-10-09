/** A plain Staunton-style set for purists and accessibility (design doc §5). */
import type { PieceType } from '../../rules/chess';

const PATHS: Record<PieceType, string> = {
  p: 'M50 22 a10 10 0 1 0 0.01 0 Z M40 46 Q50 40 60 46 L57 50 Q62 64 66 74 L34 74 Q38 64 43 50 Z M30 76 H70 V86 H30 Z',
  r: 'M30 18 H38 V25 H46 V18 H54 V25 H62 V18 H70 V34 L64 38 L66 72 H34 L36 38 L30 34 Z M28 74 H72 V86 H28 Z',
  n: 'M34 74 C34 62 40 56 46 50 C40 50 34 54 28 54 C22 54 20 48 24 42 C30 34 34 26 38 20 L38 12 L45 18 C58 18 68 30 68 46 C68 58 66 66 66 74 Z M28 76 H72 V86 H28 Z',
  b: 'M50 12 a4 4 0 1 0 0.01 0 Z M50 18 C60 26 64 34 62 44 C60 50 56 52 50 52 C44 52 40 50 38 44 C36 34 40 26 50 18 Z M42 54 H58 L62 74 H38 Z M30 76 H70 V86 H30 Z',
  q: 'M28 26 a4 4 0 1 0 0.01 0 Z M40 18 a4 4 0 1 0 0.01 0 Z M50 14 a4 4 0 1 0 0.01 0 Z M60 18 a4 4 0 1 0 0.01 0 Z M72 26 a4 4 0 1 0 0.01 0 Z M28 30 L36 56 L64 56 L72 30 L60 44 L56 24 L50 42 L44 24 L40 44 Z M36 58 H64 L68 74 H32 Z M28 76 H72 V86 H28 Z',
  k: 'M47 6 H53 V12 H59 V18 H53 V24 H47 V18 H41 V18 V12 H47 Z M50 26 C62 26 70 32 68 42 L64 56 H36 L32 42 C30 32 38 26 50 26 Z M36 58 H64 L68 74 H32 Z M28 76 H72 V86 H28 Z',
};

export function ClassicPiece({ type, white }: { type: PieceType; white: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className="piece-svg" aria-hidden="true">
      <path d={PATHS[type]} fill={white ? '#fbfaf6' : '#1d1d22'} stroke={white ? '#1d1d22' : '#e8e8ea'} strokeWidth="3" strokeLinejoin="round" fillRule="nonzero" />
      {type === 'n' && <circle cx="44" cy="30" r="2.5" fill={white ? '#1d1d22' : '#e8e8ea'} />}
    </svg>
  );
}
