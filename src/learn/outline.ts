/**
 * Lightweight outline of the learning path (ids + titles) for the home and online screens, so the
 * full lesson content stays in the lazily loaded Learn chunk. tests/learn.test.ts keeps it in sync.
 */
export const PATH_OUTLINE: { id: string; title: string; lessons: [id: string, title: string][] }[] = [
  { id: 'basics', title: 'Chess basics', lessons: [['b1', 'Rooks, bishops & queens'], ['b2', 'Knights & pawns'], ['b3', 'Check'], ['b4', 'Checkmate'], ['b5', 'Castling & promotion'], ['b6', 'En passant']] },
  { id: 'cards', title: 'The cards', lessons: [['c1', 'Drawing a card'], ['c2', 'Moves in a row'], ['c3', 'Every move counts'], ['c4', 'Quiet setup, then mate'], ['c5', 'Escape, then strike']] },
  { id: 'check', title: 'Check ends your turn', lessons: [['d1', 'Check ends your turn'], ['d2', 'Hold back the check'], ['d3', 'Check as the final move'], ['d4', 'When checks waste moves']] },
  { id: 'actions', title: 'Skip & Reverse', lessons: [['e1', 'Holding cards'], ['e2', 'Playing Skip'], ['e3', 'When to save a Skip'], ['e4', 'Reverse'], ['e5', 'Reverse timing']] },
  { id: 'strategy', title: 'Strategy', lessons: [['f1', 'Defending vs 3-move turns'], ['f2', 'Check to cut plans short'], ['f3', 'King safety & the clock'], ['f4', 'Chess Uno tactics']] },
];

export const OUTLINE_SHAPE = { units: PATH_OUTLINE.map((u) => ({ id: u.id, lessons: u.lessons.map(([id]) => id) })) };
export const lessonTitle = (id: string) => PATH_OUTLINE.flatMap((u) => u.lessons).find(([l]) => l === id)?.[1] ?? id;
export const unitTitle = (id: string) => PATH_OUTLINE.find((u) => u.id === id)?.title ?? id;
