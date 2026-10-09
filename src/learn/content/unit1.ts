import type { Unit } from '../types';

/** Unit 1 — Chess basics. Classic chess, one move per turn (every card here is a 1). */
export const unit1: Unit = {
  id: 'basics',
  index: 1,
  title: 'Chess basics',
  blurb: 'How the pieces move, check, mate and the special moves.',
  color: '#ffb347',
  lessons: [
    {
      id: 'b1', title: 'Rooks, bishops & queens', icon: '♜', minutes: 2,
      steps: [
        {
          kind: 'explain', title: 'Straight lines and diagonals',
          text: 'A **rook** slides any distance in a straight line. A **bishop** slides along diagonals. The **queen** does both. None of them can jump over pieces.',
          demo: { fen: '4k3/pp6/8/8/8/8/6PP/R1B1Q1K1 w - - 0 1', deck: ['1', '1', '1', '1', '1'], actions: ['a1a6', 'e8d8', 'c1g5', 'd8c7', 'e1e5'] },
        },
        { kind: 'puzzle', puzzle: {
          id: 'b1-rook', prompt: 'Capture the knight with your rook.',
          fen: '7k/7p/3n4/8/8/8/7P/3R3K w - - 0 1', cards: ['1'], goals: [{ type: 'capture', square: 'd6' }],
          solution: ['d1d6'], hint: 'Rooks move up and down files. The knight is on the same file.',
          explain: 'The rook slid straight up the d-file and captured.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'b1-bishop', prompt: 'Capture the rook with your bishop.',
          fen: '7k/7p/8/8/8/2r5/7P/B6K w - - 0 1', cards: ['1'], goals: [{ type: 'capture', square: 'c3' }],
          solution: ['a1c3'], hint: 'Bishops travel diagonally. Follow the long diagonal from a1.',
          explain: 'Bishops stay on one colour of square for the whole game.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'b1-queen', prompt: 'Your queen can move like a rook or a bishop. Capture the black rook.',
          fen: '6k1/5pp1/7p/8/r7/8/5PPP/3Q2K1 w - - 0 1', cards: ['1'], goals: [{ type: 'captureType', piece: 'r' }],
          solution: ['d1a4'], hint: 'Look along the diagonal from d1 towards the a-file.',
          explain: 'Qxa4 — the queen used a bishop-style diagonal.',
        } },
        {
          kind: 'mcq', question: 'Which piece can move both diagonally and in straight lines?',
          options: ['Rook', 'Bishop', 'Queen', 'Knight'], answer: 2,
          explain: 'The queen combines the rook and the bishop.',
        },
      ],
    },
    {
      id: 'b2', title: 'Knights & pawns', icon: '♞', minutes: 2,
      steps: [
        {
          kind: 'explain', title: 'Jumps and marches',
          text: 'A **knight** moves in an L: two squares one way, one square to the side — and it can **jump** over pieces. A **pawn** moves straight forward one square (two on its first move) but **captures diagonally**.',
          demo: { fen: '4k3/3p4/8/8/8/8/4P3/1N2K3 w - - 0 1', deck: ['1', '1', '1', '1'], actions: ['b1c3', 'd7d5', 'e2e4', 'd5e4'] },
        },
        { kind: 'puzzle', puzzle: {
          id: 'b2-knight', prompt: 'Jump your knight onto the black queen.',
          fen: '4k3/pppp4/8/6q1/8/5N2/PPPP4/4K3 w - - 0 1', cards: ['1'], goals: [{ type: 'captureType', piece: 'q' }],
          solution: ['f3g5'], hint: 'Count two squares up and one across from f3.',
          explain: 'Nxg5 — the knight’s L-jump reached the queen.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'b2-pawn', prompt: 'Pawns capture diagonally. Take the knight with your pawn.',
          fen: '4k3/7p/8/3n4/4P3/8/7P/4K3 w - - 0 1', cards: ['1'], goals: [{ type: 'capture', square: 'd5' }],
          solution: ['e4d5'], hint: 'The pawn on e4 attacks the two squares diagonally in front of it.',
          explain: 'exd5. Pawns move straight but capture on the diagonal.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'b2-double', prompt: 'On its first move a pawn may jump two squares. Push the e-pawn to e4.',
          fen: '4k3/7p/8/8/8/8/4P3/4K3 w - - 0 1', cards: ['1'], goals: [{ type: 'occupy', squares: { e4: 'P' } }],
          solution: ['e2e4'], hint: 'Pick up the e2 pawn and move it two squares straight ahead.',
          explain: 'e4! Only a pawn on its starting square may move two.',
        } },
        {
          kind: 'mcq', question: 'How does a pawn capture?',
          options: ['Straight forward one square', 'Diagonally forward one square', 'In an L-shape', 'Sideways'], answer: 1,
          explain: 'Pawns capture one square diagonally forward — never straight ahead.',
        },
      ],
    },
    {
      id: 'b3', title: 'Check', icon: '♚', minutes: 2,
      steps: [
        {
          kind: 'explain', title: 'The king is under attack',
          text: 'When a king is attacked it is in **check**. Its owner must fix that right away: **move** the king, **block** the attack, or **capture** the attacker. You may never make a move that leaves your own king in check.',
          demo: { fen: '4k3/8/8/8/8/8/3PPP2/R3K3 w - - 0 1', deck: ['1', '1'], actions: ['a1a8', 'e8e7'] },
        },
        { kind: 'puzzle', puzzle: {
          id: 'b3-give', prompt: 'Give check with your rook.',
          fen: '4k3/pp6/8/8/8/8/6PP/R5K1 w - - 0 1', cards: ['1'], goals: [{ type: 'check' }],
          solution: ['a1e1'], hint: 'Put the rook on the same file or rank as the black king.',
          explain: 'Check! The black king must now deal with the rook.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'b3-escape', prompt: 'You are in check from the queen. Escape by capturing it!',
          fen: '6k1/5ppp/8/8/8/8/5PqP/R5K1 w - - 0 1', cards: ['1'], goals: [{ type: 'capture', square: 'g2' }],
          solution: ['g1g2'], hint: 'Nothing defends the queen. Your king can take it.',
          explain: 'Kxg2. Kings can capture too — as long as the piece isn’t defended.',
        } },
        {
          kind: 'mcq', question: 'Your king is in check. Which of these is NOT allowed?',
          options: ['Move the king to a safe square', 'Block the check with a piece', 'Capture the checking piece', 'Ignore it and attack their queen'], answer: 3,
          explain: 'Check must always be answered. Every other move is illegal.',
        },
      ],
    },
    {
      id: 'b4', title: 'Checkmate', icon: '♛', minutes: 3,
      steps: [
        {
          kind: 'explain', title: 'No way out',
          text: '**Checkmate** is check with no escape: the king can’t move, the check can’t be blocked and the attacker can’t be captured. Checkmate wins the game.',
          demo: { fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', deck: ['1'], actions: ['a1a8'] },
        },
        { kind: 'puzzle', puzzle: {
          id: 'b4-backrank', prompt: 'Checkmate in one move.',
          fen: '6k1/5ppp/8/8/8/8/5PPP/1R4K1 w - - 0 1', cards: ['1'], goals: [{ type: 'mate' }],
          solution: ['b1b8'], hint: 'The black king is trapped behind its own pawns.',
          explain: 'Rb8# — the classic back-rank mate.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'b4-queen', prompt: 'Checkmate in one move with the queen.',
          fen: 'k7/8/1K6/8/8/8/8/7Q w - - 0 1', cards: ['1'], goals: [{ type: 'mate' }],
          solution: ['h1h8'], hint: 'Your king already guards a7, b7 and c7.',
          explain: 'The king and queen work together. Qh8# and Qb7# both work.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'b4-smother', prompt: 'Checkmate with the knight.',
          fen: '6rk/6pp/8/6N1/8/8/6PP/6K1 w - - 0 1', cards: ['1'], goals: [{ type: 'mate' }],
          solution: ['g5f7'], hint: 'The king is boxed in by its own pieces. Which square does a knight check from?',
          explain: 'Nf7# — a smothered mate. The king’s own pieces trap it.',
        } },
        {
          kind: 'mcq', question: 'What is the difference between check and checkmate?',
          options: ['There is none', 'Checkmate is a check that cannot be escaped', 'Check can only be given by the queen', 'Checkmate means you captured the king'], answer: 1,
          explain: 'Kings are never captured. Checkmate means there is no legal way out of check.',
        },
      ],
    },
    {
      id: 'b5', title: 'Castling & promotion', icon: '♖', minutes: 2,
      steps: [
        {
          kind: 'explain', title: 'Two special moves',
          text: '**Castling**: the king steps two squares towards a rook and the rook hops over it — one move. Only if neither has moved, the squares between are empty and the king isn’t in, through or into check. **Promotion**: a pawn reaching the last rank becomes a queen, rook, bishop or knight.',
          demo: { fen: 'r3k2r/pppp1ppp/8/8/8/8/PPPP1PPP/R3K2R w KQkq - 0 1', deck: ['1', '1'], actions: ['e1g1', 'e8c8'] },
        },
        { kind: 'puzzle', puzzle: {
          id: 'b5-castle', prompt: 'Castle kingside: tap the king, then the square two to its right.',
          fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', cards: ['1'], goals: [{ type: 'occupy', squares: { g1: 'K', f1: 'R' } }],
          solution: ['e1g1'], hint: 'Move the king from e1 to g1. The rook follows by itself.',
          explain: 'O-O. Your king is tucked away and the rook joins the game.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'b5-promote', prompt: 'Promote your pawn to a queen.',
          fen: '8/4P1k1/8/8/8/8/6K1/8 w - - 0 1', cards: ['1'], goals: [{ type: 'promote', piece: 'q' }],
          solution: ['e7e8q'], hint: 'Push the pawn to the last rank and choose the queen.',
          explain: 'e8=Q. A new queen!',
        } },
        {
          kind: 'mcq', question: 'When are you NOT allowed to castle?',
          options: ['When your king is in check', 'When it is your first move', 'When the opponent has castled', 'On a Skip turn'], answer: 0,
          explain: 'You can’t castle out of, through or into check, or after the king or that rook has moved.',
        },
      ],
    },
    {
      id: 'b6', title: 'En passant', icon: '♟', minutes: 2,
      steps: [
        {
          kind: 'explain', title: 'Capturing in passing',
          text: 'If an enemy pawn jumps two squares and lands **beside** your pawn, you may capture it as if it had moved only one. In Chess Uno you may do this only on the **first move** of your turn, and only if the double jump was the **last move** of their turn.',
          demo: { fen: '4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1', deck: ['1', '1'], actions: ['d7d5', 'e5d6'] },
        },
        { kind: 'puzzle', puzzle: {
          id: 'b6-ep', prompt: 'Black just jumped d7–d5. Capture it en passant!',
          fen: '4k3/3p4/8/4P3/8/8/7P/4K3 b - - 0 1', prelude: ['d7d5'], cards: ['1'], goals: [{ type: 'capture', square: 'd5' }],
          solution: ['e5d6'], hint: 'Your e5 pawn moves diagonally to d6 — the square the black pawn skipped.',
          explain: 'exd6 en passant. The black pawn disappears from d5.',
        } },
        {
          kind: 'mcq', question: 'You draw a 2. Can you capture en passant with your second move?',
          options: ['Yes, any time this turn', 'No — only on the first move of your turn', 'Only if you drew a 3', 'Only with a Skip'], answer: 1,
          explain: 'En passant is only available on the first move of your turn, right after their double push.',
        },
      ],
    },
  ],
  placement: {
    id: 'b-test', title: 'Placement check', icon: '⤼', minutes: 2,
    steps: [
      { kind: 'puzzle', puzzle: {
        id: 'bt-mate', prompt: 'Checkmate in one.',
        fen: '6k1/5p1p/5Bp1/8/8/8/5PPP/3Q2K1 w - - 0 1', cards: ['1'], goals: [{ type: 'mate' }],
        solution: ['d1d8'], hint: 'Your bishop already guards g7. Look at the back rank.',
        explain: 'Qd8# — the bishop on f6 covers the king’s only escape square.',
      } },
      {
        kind: 'mcq', question: 'Which piece can jump over other pieces?',
        options: ['Bishop', 'Knight', 'Rook', 'Queen'], answer: 1, explain: 'Only the knight jumps.',
      },
      { kind: 'puzzle', puzzle: {
        id: 'bt-ep', prompt: 'Black just played f7–f5. Take it en passant.',
        fen: '4k3/5p2/8/4P3/8/8/7P/4K3 b - - 0 1', prelude: ['f7f5'], cards: ['1'], goals: [{ type: 'capture', square: 'f5' }],
        solution: ['e5f6'], hint: 'Capture onto the square the pawn passed over.', explain: 'exf6 en passant — the pawn lands on f6 and the f5 pawn is removed.',
      } },
      {
        kind: 'mcq', question: 'A pawn reaches the last rank. What can it become?',
        options: ['Only a queen', 'Queen, rook, bishop or knight', 'Any piece including a king', 'Nothing, it is stuck'], answer: 1,
        explain: 'Any piece except a king (and it can’t stay a pawn).',
      },
      { kind: 'puzzle', puzzle: {
        id: 'bt-escape', prompt: 'You are in check. Block it — and win the rook.',
        fen: '6k1/5ppp/8/8/8/8/2N2PPP/r5K1 w - - 0 1', cards: ['1'], goals: [{ type: 'capture', square: 'a1' }],
        solution: ['c2a1'], hint: 'Your knight can do better than block.', explain: 'Nxa1 captures the attacker.',
      } },
    ],
  },
};
