import type { Unit } from '../types';

/** Unit 2 — The cards: drawing, multi-move turns, quiet setups. */
export const unit2: Unit = {
  id: 'cards',
  index: 2,
  title: 'The cards',
  blurb: 'Draw a card, make that many moves in a row.',
  color: '#2fe6d6',
  lessons: [
    {
      id: 'c1', title: 'Drawing a card', icon: '🂠', minutes: 2,
      steps: [
        {
          kind: 'explain', title: 'Every turn starts with a card',
          text: 'Tap the deck at the start of your turn. A **1, 2 or 3** means you make **that many moves in a row**. Low cards are more common: the 52-card deck has eighteen 1s, fifteen 2s and nine 3s, plus Skip and Reverse cards.',
          cards: ['1', '2', '3'],
        },
        {
          kind: 'mcq', question: 'You draw a 3. What happens?',
          options: ['You make 3 moves in a row', 'You and your opponent make 3 moves each', 'You move 3 different pieces', 'Your opponent loses 3 moves'], answer: 0,
          explain: 'Three moves in a row — the same piece can move more than once.', cards: ['3'],
        },
        {
          kind: 'explain', title: 'White’s first turn',
          text: 'To keep openings fair, **White’s very first turn is capped at 1 move**, whatever card is drawn. After that every card counts in full.',
          cards: ['3'],
        },
        {
          kind: 'mcq', question: 'White draws a 3 on the very first turn of the game. How many moves?',
          options: ['3', '2', '1', 'None — draw again'], answer: 2,
          explain: 'The opening turn is always one move.',
        },
        { kind: 'puzzle', puzzle: {
          id: 'c1-two', prompt: 'You drew a 2. Use both moves to capture the queen.',
          fen: '7q/8/4k3/8/8/8/5PPP/R5K1 w - - 0 1', cards: ['2'], goals: [{ type: 'captureType', piece: 'q' }],
          solution: ['a1a8', 'a8h8'], hint: 'The queen can’t move between your two moves. Get the rook onto the 8th rank first.',
          explain: 'Ra8 and Rxh8. Your opponent can’t react in the middle of your turn.',
        } },
      ],
    },
    {
      id: 'c2', title: 'Moves in a row', icon: '⇶', minutes: 3,
      steps: [
        {
          kind: 'explain', title: 'Plan the whole turn',
          text: 'Your opponent can’t move until your turn is over, so a piece can travel several squares, capture twice, or set up an attack. Numbered badges show the order of your moves.',
          demo: { fen: '4k3/pppp4/8/8/8/8/PPPP4/1N2K3 w - - 0 1', deck: ['3'], actions: ['b1c3', 'c3d5', 'd5c7'] },
          cards: ['3'],
        },
        { kind: 'puzzle', puzzle: {
          id: 'c2-knight', prompt: 'You drew a 3. Hop the knight over and capture the rook.',
          fen: '7k/8/5r2/8/8/8/PP6/1N4K1 w - - 0 1', cards: ['3'], goals: [{ type: 'captureType', piece: 'r' }],
          solution: ['b1d2', 'd2e4', 'e4f6'], hint: 'b1 → d2 → e4, and the rook on f6 is a knight’s jump away.',
          explain: 'Three hops, one capture. Any route that gets there works.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'c2-sprint', prompt: 'You drew a 3. Promote the pawn this turn.',
          fen: 'k7/p7/8/4P3/8/8/7P/7K w - - 0 1', cards: ['3'], goals: [{ type: 'promote', piece: 'q' }],
          solution: ['e5e6', 'e6e7', 'e7e8q'], hint: 'Three steps forward: e6, e7, e8.',
          explain: 'A pawn sprint! With a 3 a pawn can run three squares in one turn.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'c2-spree', prompt: 'You drew a 2. Capture both knights.',
          fen: '7k/6pp/8/n2n4/8/8/5PPP/3Q2K1 w - - 0 1', cards: ['2'], goals: [{ type: 'captureType', piece: 'n', count: 2 }],
          solution: ['d1d5', 'd5a5'], hint: 'Take the closer knight first, then look along the 5th rank.',
          explain: 'Qxd5 and Qxa5. Defended or not, nothing can recapture mid-turn.',
        } },
        {
          kind: 'mcq', question: 'In the middle of your 3-move turn, can your opponent capture the piece you just moved?',
          options: ['Yes, immediately', 'No — they only move when your turn is over', 'Only with a Skip card', 'Only if it gives check'], answer: 1,
          explain: 'Your whole turn happens first. They answer afterwards — so end the turn safely!',
        },
      ],
    },
    {
      id: 'c3', title: 'Every move counts', icon: '⚖', minutes: 2,
      steps: [
        {
          kind: 'explain', title: 'Moves are mandatory',
          text: 'You **must make all N moves** (unless you give check or run out of legal moves). Each move must be legal on its own — you can never leave your own king in check, even between moves. So plan where your pieces **end** the turn.',
          cards: ['2'],
        },
        { kind: 'puzzle', puzzle: {
          id: 'c3-safe', prompt: 'You drew a 2. Win the rook — and don’t leave your queen where a pawn or king can take it.',
          fen: '4k3/2p1p3/3r4/8/8/8/5PPP/3Q2K1 w - - 0 1', cards: ['2'],
          goals: [{ type: 'captureType', piece: 'r' }, { type: 'keep', piece: 'q', oppCard: 1 }],
          solution: ['d1d6', 'd6c7'], hint: 'After Qxd6 the queen sits between two pawns. Your second move can take one of them safely.',
          explain: 'Qxd6 then Qxc7 — two captures and the queen ends safe.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'c3-two', prompt: 'You drew a 2. Take the bishop, then bring your rook to safety.',
          fen: '3rk3/8/8/8/3b4/8/5PPP/3R2K1 w - - 0 1', cards: ['2'],
          goals: [{ type: 'captureType', piece: 'b' }, { type: 'keep', piece: 'r', oppCard: 1 }],
          solution: ['d1d4', 'd4a4'], hint: 'After Rxd4 the black rook on d8 attacks yours. Step off the d-file.',
          explain: 'Rxd4, then move off the d-file. Always check how the turn ends.',
        } },
        {
          kind: 'mcq', question: 'You drew a 3, but after 2 moves you have no legal move left. What happens?',
          options: ['You lose the game', 'Your turn simply ends', 'You draw another card', 'Your opponent gets 3 moves'], answer: 1,
          explain: 'If no legal move remains, the turn ends early.',
        },
      ],
    },
    {
      id: 'c4', title: 'Quiet setup, then mate', icon: '✦', minutes: 3,
      steps: [
        {
          kind: 'explain', title: 'Two quiet moves, then mate',
          text: 'With a **3** you can make two quiet setup moves and deliver mate on the third. A “quiet” move doesn’t give check — so your turn keeps going.',
          demo: { fen: '7k/p7/8/8/3P4/3R4/2R5/4K3 w - - 0 1', deck: ['3'], actions: ['c2c7', 'd3e3', 'e3e8'] },
          cards: ['3'],
        },
        { kind: 'puzzle', puzzle: {
          id: 'c4-ladder', prompt: 'You drew a 3. Checkmate this turn.',
          fen: '7k/p7/8/8/3P4/3R4/2R5/1K6 w - - 0 1', cards: ['3'], goals: [{ type: 'mate' }],
          solution: ['c2c7', 'd3e3', 'e3e8'], hint: 'One rook seals the 7th rank. The other needs a free file to reach the 8th.',
          explain: 'Rc7, Re3, Re8#. Checking too early (Rc8+) would have ended your turn.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'c4-bishop', prompt: 'You drew a 3. Find the checkmate — it needs all three moves.',
          fen: '6k1/5p1p/6p1/4P3/8/B7/5PPP/3R2K1 w - - 0 1', cards: ['3'], goals: [{ type: 'mate' }],
          solution: ['a3c1', 'c1h6', 'd1d8'], hint: 'Rd8+ right now fails: the king slips out to g7. Take g7 away first — the bishop needs two moves to get to h6.',
          explain: 'Bc1, Bh6 (covering g7 and f8), then Rd8#. With a 2 there is no mate here — the 3 makes it possible.',
        } },
        {
          kind: 'mcq', question: 'You drew a 3 and checkmate on your 2nd move. What happens?',
          options: ['You still make the 3rd move', 'You win — checkmate ends the game', 'The mate doesn’t count', 'Your opponent gets one move'], answer: 1,
          explain: 'A check ends your turn, and if it is mate the game is over.',
        },
      ],
    },
    {
      id: 'c5', title: 'Escape, then strike', icon: '↯', minutes: 2,
      steps: [
        {
          kind: 'explain', title: 'Start of turn in check',
          text: 'If you start your turn in check, your **first move must get out of check**. After that your remaining moves are yours — counterattack!',
          cards: ['2'],
        },
        { kind: 'puzzle', puzzle: {
          id: 'c5-block', prompt: 'You’re in check and drew a 2. Escape — then checkmate.',
          fen: '3q2k1/5ppp/8/8/3R4/2N5/5PPP/r5K1 w - - 0 1', cards: ['2'], goals: [{ type: 'mate' }],
          solution: ['c3d1', 'd4d8'], hint: 'Block with the knight, not the rook — a piece that blocks on the 1st rank gets pinned there.',
          explain: 'Nd1 blocks, then Rxd8#. Blocking with the rook would have pinned it to your king.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'c5-queen', prompt: 'Check from the bishop! You drew a 2. Escape, then win the queen.',
          fen: '4k3/8/8/8/1b5q/5N2/5PPP/4K3 w - - 0 1', cards: ['2'], goals: [{ type: 'captureType', piece: 'q' }],
          solution: ['e1f1', 'f3h4'], hint: 'Step the king out of the diagonal. Keep the knight where it is.',
          explain: 'Kf1 (or Ke2), then Nxh4. The first move must answer the check.',
        } },
        {
          kind: 'mcq', question: 'You start your turn in check with a 3. Which is true?',
          options: ['Your first move must escape check', 'You can ignore it if you mate on move 3', 'You must give check back', 'You draw again'], answer: 0,
          explain: 'Escape first. The other moves can then be used freely.',
        },
      ],
    },
  ],
};
