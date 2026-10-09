/**
 * "Arcane Forge" piece set (design doc §5): characterful little figures with
 * glowing eyes and gems. Ember = ivory/gold, Tide = obsidian/teal-violet.
 * Silhouettes stay close to classic shapes for instant recognition.
 */
import type { JSX } from 'react';
import type { PieceType } from '../../rules/chess';

type Side = 'ember' | 'tide';

interface Paint {
  body: string; trim: string; eye: string; shade: string; line: string; dark: string; glow: string;
}

const paint = (side: Side): Paint =>
  side === 'ember'
    ? { body: 'url(#cu-ember-body)', trim: 'url(#cu-ember-trim)', eye: 'url(#cu-ember-eye)', shade: 'url(#cu-ember-shade)', line: '#5b3a0e', dark: '#3a2208', glow: 'url(#cu-ember-glow)' }
    : { body: 'url(#cu-tide-body)', trim: 'url(#cu-tide-trim)', eye: 'url(#cu-tide-eye)', shade: 'url(#cu-tide-shade)', line: '#57e8dc', dark: '#05060c', glow: 'url(#cu-tide-glow)' };

const Eyes = ({ p, x1, x2, y, r = 3.2 }: { p: Paint; x1: number; x2: number; y: number; r?: number }) => (
  <g filter="url(#cu-eye-glow)">
    <ellipse cx={x1} cy={y} rx={r} ry={r * 1.15} fill={p.eye} />
    <ellipse cx={x2} cy={y} rx={r} ry={r * 1.15} fill={p.eye} />
  </g>
);

const Base = ({ p, w = 30 }: { p: Paint; w?: number }) => (
  <g>
    <path d={`M${50 - w} 92 Q${50 - w} 84 ${50 - w + 6} 82 L${50 + w - 6} 82 Q${50 + w} 84 ${50 + w} 92 Z`} fill={p.trim} stroke={p.line} strokeWidth="2" strokeLinejoin="round" />
    <path d={`M${50 - w + 5} 82 Q50 77 ${50 + w - 5} 82`} fill="none" stroke={p.line} strokeWidth="1.4" opacity="0.6" />
  </g>
);

function Pawn({ p }: { p: Paint }) {
  return (
    <g>
      <Base p={p} w={22} />
      {/* cloak */}
      <path d="M33 82 C33 66 38 56 44 50 L56 50 C62 56 67 66 67 82 Z" fill={p.body} stroke={p.line} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M33 82 C33 66 38 56 44 50 L56 50 C62 56 67 66 67 82 Z" fill={p.shade} />
      {/* collar */}
      <path d="M38 52 Q50 58 62 52 L60 47 Q50 51 40 47 Z" fill={p.trim} stroke={p.line} strokeWidth="1.6" strokeLinejoin="round" />
      {/* hooded head */}
      <path d="M50 16 C62 16 67 26 66 34 C65 42 58 47 50 47 C42 47 35 42 34 34 C33 26 38 16 50 16 Z" fill={p.body} stroke={p.line} strokeWidth="2.2" />
      <path d="M50 21 C58 21 61 28 61 33 C61 40 56 43 50 43 C44 43 39 40 39 33 C39 28 42 21 50 21 Z" fill={p.dark} opacity="0.92" />
      <Eyes p={p} x1={45} x2={55} y={33} r={2.8} />
      {/* gem on brow */}
      <path d="M50 12 L53 16 L50 20 L47 16 Z" fill={p.trim} stroke={p.line} strokeWidth="1.2" />
    </g>
  );
}

function Rook({ p }: { p: Paint }) {
  return (
    <g>
      <Base p={p} w={28} />
      {/* tower */}
      <path d="M30 82 L33 38 L67 38 L70 82 Z" fill={p.body} stroke={p.line} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M30 82 L33 38 L67 38 L70 82 Z" fill={p.shade} />
      {/* brick lines */}
      <g stroke={p.line} strokeWidth="1" opacity="0.35">
        <path d="M32 50 H68 M31.5 62 H68.5 M31 74 H69" />
        <path d="M42 38 V50 M58 38 V50 M50 50 V62 M40 62 V74 M60 62 V74" />
      </g>
      {/* battlements */}
      <path d="M27 40 L27 22 L36 22 L36 29 L45 29 L45 22 L55 22 L55 29 L64 29 L64 22 L73 22 L73 40 Z" fill={p.trim} stroke={p.line} strokeWidth="2.2" strokeLinejoin="round" />
      {/* arched window with eyes peeking out */}
      <path d="M40 66 L40 54 Q50 42 60 54 L60 66 Z" fill={p.dark} stroke={p.line} strokeWidth="1.8" />
      <Eyes p={p} x1={45.5} x2={54.5} y={56} r={2.6} />
      <path d="M43 66 Q50 62 57 66" fill="none" stroke={p.eye} strokeWidth="1.5" opacity="0.8" />
    </g>
  );
}

function Knight({ p }: { p: Paint }) {
  return (
    <g>
      <Base p={p} w={27} />
      {/* horse head + neck */}
      <path
        d="M31 82 C30 72 34 64 40 58 C35 58 30 60 25 62 C20 63 15 60 15 55 C15 50 18 46 22 42 C26 36 30 30 34 25 L32 14 L41 20 C48 17 58 18 64 25 C71 33 73 46 71 58 C70 68 69 76 69 82 Z"
        fill={p.body} stroke={p.line} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M31 82 C30 72 34 64 40 58 C35 58 30 60 25 62 C20 63 15 60 15 55 C15 50 18 46 22 42 C26 36 30 30 34 25 L32 14 L41 20 C48 17 58 18 64 25 C71 33 73 46 71 58 C70 68 69 76 69 82 Z" fill={p.shade} />
      {/* crested helm plume along the mane */}
      <path d="M41 20 C50 12 64 14 72 24 C78 32 80 44 77 56 L72 50 L74 42 L68 40 L69 33 L62 31 L61 25 L53 24 Z" fill={p.trim} stroke={p.line} strokeWidth="1.8" strokeLinejoin="round" />
      {/* helm face plate */}
      <path d="M27 37 C33 31 41 29 47 31 L44 40 C38 40 32 41 27 44 Z" fill={p.dark} stroke={p.line} strokeWidth="1.5" opacity="0.95" />
      <ellipse cx="38" cy="36" rx="3.3" ry="2.8" fill={p.eye} filter="url(#cu-eye-glow)" />
      {/* nostril + mouth */}
      <circle cx="20" cy="53" r="1.6" fill={p.line} opacity="0.8" />
      <path d="M18 58 Q24 60 29 57" fill="none" stroke={p.line} strokeWidth="1.4" opacity="0.7" />
      {/* chest strap */}
      <path d="M36 72 Q52 66 69 70" fill="none" stroke={p.trim} strokeWidth="4" strokeLinecap="round" />
      <circle cx="52" cy="68.5" r="2.6" fill={p.eye} filter="url(#cu-eye-glow)" />
    </g>
  );
}

function Bishop({ p }: { p: Paint }) {
  return (
    <g>
      <Base p={p} w={25} />
      {/* robe */}
      <path d="M32 82 C33 70 38 62 42 58 L58 58 C62 62 67 70 68 82 Z" fill={p.body} stroke={p.line} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M32 82 C33 70 38 62 42 58 L58 58 C62 62 67 70 68 82 Z" fill={p.shade} />
      <path d="M50 60 L50 82" stroke={p.trim} strokeWidth="4" />
      {/* collar */}
      <ellipse cx="50" cy="58" rx="12" ry="4" fill={p.trim} stroke={p.line} strokeWidth="1.6" />
      {/* mitre */}
      <path d="M50 10 C60 18 66 30 64 42 C63 50 57 55 50 55 C43 55 37 50 36 42 C34 30 40 18 50 10 Z" fill={p.body} stroke={p.line} strokeWidth="2.2" />
      <path d="M50 10 C60 18 66 30 64 42 C63 50 57 55 50 55 C43 55 37 50 36 42 C34 30 40 18 50 10 Z" fill={p.shade} />
      {/* glowing slit */}
      <path d="M56 17 L46 33" stroke={p.eye} strokeWidth="3.2" strokeLinecap="round" filter="url(#cu-eye-glow)" />
      {/* face shadow + eyes */}
      <path d="M40 41 Q50 35 60 41 Q58 51 50 52 Q42 51 40 41 Z" fill={p.dark} opacity="0.92" />
      <Eyes p={p} x1={45.5} x2={54.5} y={44} r={2.4} />
      <circle cx="50" cy="8" r="3.4" fill={p.trim} stroke={p.line} strokeWidth="1.3" />
    </g>
  );
}

function Queen({ p }: { p: Paint }) {
  return (
    <g>
      <Base p={p} w={29} />
      {/* gown */}
      <path d="M29 82 C31 68 37 58 42 52 L58 52 C63 58 69 68 71 82 Z" fill={p.body} stroke={p.line} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M29 82 C31 68 37 58 42 52 L58 52 C63 58 69 68 71 82 Z" fill={p.shade} />
      <path d="M38 70 Q50 64 62 70 M35 77 Q50 71 65 77" fill="none" stroke={p.trim} strokeWidth="2.4" strokeLinecap="round" />
      {/* head */}
      <circle cx="50" cy="42" r="12" fill={p.body} stroke={p.line} strokeWidth="2.2" />
      <path d="M40 41 Q50 34 60 41 Q59 51 50 53 Q41 51 40 41 Z" fill={p.dark} opacity="0.9" />
      <Eyes p={p} x1={45.5} x2={54.5} y={44} r={2.5} />
      {/* crown */}
      <path d="M33 33 L36 14 L43 25 L50 9 L57 25 L64 14 L67 33 Q50 28 33 33 Z" fill={p.trim} stroke={p.line} strokeWidth="2" strokeLinejoin="round" />
      <g filter="url(#cu-eye-glow)">
        <circle cx="36" cy="13" r="3" fill={p.eye} />
        <circle cx="50" cy="8" r="3.6" fill={p.eye} />
        <circle cx="64" cy="13" r="3" fill={p.eye} />
      </g>
      <path d="M50 27 L52.5 30 L50 33 L47.5 30 Z" fill={p.eye} />
    </g>
  );
}

function King({ p }: { p: Paint }) {
  return (
    <g>
      <Base p={p} w={30} />
      {/* armoured robe */}
      <path d="M28 82 C29 68 35 58 40 53 L60 53 C65 58 71 68 72 82 Z" fill={p.body} stroke={p.line} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M28 82 C29 68 35 58 40 53 L60 53 C65 58 71 68 72 82 Z" fill={p.shade} />
      <path d="M40 53 L50 66 L60 53" fill="none" stroke={p.trim} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="50" cy="70" r="3.4" fill={p.eye} filter="url(#cu-eye-glow)" />
      {/* head */}
      <path d="M37 38 L63 38 L62 49 Q50 58 38 49 Z" fill={p.body} stroke={p.line} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M40 40 L60 40 L59 47 Q50 53 41 47 Z" fill={p.dark} opacity="0.9" />
      <Eyes p={p} x1={45.5} x2={54.5} y={44} r={2.4} />
      {/* crown band + cross */}
      <path d="M34 39 L35 25 L42 30 L50 22 L58 30 L65 25 L66 39 Z" fill={p.trim} stroke={p.line} strokeWidth="2" strokeLinejoin="round" />
      <path d="M47 22 L47 15 L42 15 L42 10 L47 10 L47 5 L53 5 L53 10 L58 10 L58 15 L53 15 L53 22 Z" fill={p.trim} stroke={p.line} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="50" cy="12.5" r="2.2" fill={p.eye} filter="url(#cu-eye-glow)" />
      <rect x="35" y="34" width="30" height="4" rx="1.5" fill={p.dark} opacity="0.35" />
    </g>
  );
}

const SHAPES: Record<PieceType, (props: { p: Paint }) => JSX.Element> = {
  p: Pawn, r: Rook, n: Knight, b: Bishop, q: Queen, k: King,
};

export function ArcanePiece({ type, white }: { type: PieceType; white: boolean }) {
  const p = paint(white ? 'ember' : 'tide');
  const Shape = SHAPES[type];
  return (
    <svg viewBox="0 0 100 100" className="piece-svg" aria-hidden="true">
      <ellipse cx="50" cy="93" rx="30" ry="4" fill="#000" opacity="0.28" />
      <g filter={p.glow}>
        <Shape p={p} />
      </g>
    </svg>
  );
}
