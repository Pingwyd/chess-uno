import type { Unit } from '../types';

/** Unit 3 — Check ends your turn (design doc §2.5, confirmed rule). */
export const unit3: Unit = {
  id: 'check',
  index: 3,
  title: 'Check ends your turn',
  blurb: 'Giving check forfeits your remaining moves. Time it!',
  color: '#ff5470',
  lessons: [
    {
      id: 'd1', title: 'Check ends your turn', icon: 'hand', minutes: 2,
      steps: [
        {
          kind: 'explain', title: 'The big rule',
          text: '**Giving check ends your turn immediately.** Any moves you had left are lost. Watch: White drew a 3, checked on move 1 — and the turn was over.',
          demo: { fen: '4k3/8/8/8/8/8/5PPP/R5K1 w - - 0 1', deck: ['3', '1'], actions: ['a1a8', 'e8e7'] },
          cards: ['3'],
        },
        {
          kind: 'mcq', question: 'You drew a 3 and give check with your first move. What happens?',
          options: ['You make your other 2 moves', 'Your turn ends — the 2 extra moves are lost', 'Your opponent loses a turn', 'You must take back the check'], answer: 1,
          explain: 'Check ends the turn. This is why kings can never be captured.',
        },
        { kind: 'puzzle', puzzle: {
          id: 'd1-hold', prompt: 'You drew a 2. Win the queen — a check now would waste your second move.',
          fen: '4k3/8/8/7q/8/8/5PPP/R5K1 w - - 0 1', cards: ['2'], goals: [{ type: 'captureType', piece: 'q' }],
          solution: ['a1a5', 'a5h5'], hint: 'Ra8+ ends your turn. A quiet rook lift to the 5th rank lines up the queen.',
          explain: 'Ra5 then Rxh5. A quiet first move kept the second move alive.',
        } },
        {
          kind: 'mcq', question: 'Why can a king never be captured in Chess Uno?',
          options: ['Kings are immune to multi-move turns', 'Check ends the turn, so the opponent always gets to respond', 'Kings can only be captured with a Skip', 'The deck has no 4s'], answer: 1,
          explain: 'As soon as you give check your turn stops — they always get a chance to escape.',
        },
      ],
    },
    {
      id: 'd2', title: 'Hold back the check', icon: 'hourglass', minutes: 3,
      steps: [
        {
          kind: 'explain', title: 'Mate on the last move',
          text: 'With several moves, make the **quiet** ones first and save the check for **last**. An early check that isn’t mate just hands the turn back.',
          cards: ['3'],
        },
        { kind: 'puzzle', puzzle: {
          id: 'd2-knight', prompt: 'You drew a 3. Checkmate with the knight.',
          fen: '6rk/6pp/8/8/8/2N5/6PP/6K1 w - - 0 1', cards: ['3'], goals: [{ type: 'mate' }],
          solution: ['c3e4', 'e4g5', 'g5f7'], hint: 'The king is smothered. Which square gives a knight check on h8? Get there in three hops.',
          explain: 'Ne4, Ng5, Nf7# — a three-hop smothered mate.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'd2-king', prompt: 'You drew a 3. Ra8+ is tempting — but it isn’t mate yet. Find the real mate.',
          fen: '4k3/8/8/4K3/8/8/7P/R7 w - - 0 1', cards: ['3'], goals: [{ type: 'mate' }],
          solution: ['e5e6', 'a1a8'], hint: 'Bring your king up first so it guards the 7th rank.',
          explain: 'Ke6, then Ra8#. The king takes away d7, e7 and f7.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'd2-queen', prompt: 'You drew a 3. Checkmate — without checking too early.',
          fen: '7k/8/5K2/8/8/8/8/Q7 w - - 0 1', cards: ['3'], goals: [{ type: 'mate' }],
          solution: ['a1b1', 'f6g6', 'b1b8'], hint: 'Your king wants g6 — but moving it now uncovers the queen’s diagonal and gives check. Move the queen first.',
          explain: 'Qb1, Kg6, Qb8#. Even a discovered check ends your turn!',
        } },
      ],
    },
    {
      id: 'd3', title: 'Check as the final move', icon: 'target', minutes: 2,
      steps: [
        {
          kind: 'explain', title: 'Grab first, check last',
          text: 'A check is a great **last** move: collect material with your early moves, then finish with check so your opponent has to spend their next move escaping.',
          cards: ['2', '3'],
        },
        { kind: 'puzzle', puzzle: {
          id: 'd3-grab', prompt: 'You drew a 2. Capture the knight, then give check.',
          fen: '7k/6pp/8/3n4/8/8/6PP/3R2K1 w - - 0 1', cards: ['2'], goals: [{ type: 'capture', square: 'd5' }, { type: 'check' }],
          solution: ['d1d5', 'd5d8'], hint: 'Take on d5 first. Then the back rank is right there.',
          explain: 'Rxd5 and Rd8 — that check is even mate!',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'd3-sweep', prompt: 'You drew a 3. Take both pawns, then finish with a check.',
          fen: '4k3/1p3p2/8/8/8/8/6PP/1R4K1 w - - 0 1', cards: ['3'], goals: [{ type: 'captureType', piece: 'p', count: 2 }, { type: 'check' }],
          solution: ['b1b7', 'b7f7', 'f7e7'], hint: 'Rxb7 and Rxf7 are both quiet. The third move can check.',
          explain: 'Rxb7, Rxf7, then check. Two pawns and the opponent must react.',
        } },
      ],
    },
    {
      id: 'd4', title: 'When checks waste moves', icon: 'recycle', minutes: 2,
      steps: [
        {
          kind: 'explain', title: 'Count before you check',
          text: 'Before giving check, count your remaining moves. A check is worth it when it **mates**, wins something **big**, or you have no better use for the moves. Otherwise keep collecting quietly.',
          cards: ['3'],
        },
        { kind: 'puzzle', puzzle: {
          id: 'd4-both', prompt: 'You drew a 3. Win the rook AND the knight — careful, a check would end your turn.',
          fen: '4k3/3p1p2/8/7n/r7/8/5PPP/3Q2K1 w - - 0 1', cards: ['3'], goals: [{ type: 'captureType', piece: 'r' }, { type: 'captureType', piece: 'n' }],
          solution: ['d1h5', 'h5d1', 'd1a4'], hint: 'Qxh5 first. Then find a quiet route for the queen to reach a4.',
          explain: 'Both pieces fall. Routes that checked on the way would have cost you the second capture.',
        } },
        {
          kind: 'mcq', question: 'You drew a 3. Move 1 can give a check that is NOT mate, or you can quietly win a rook over 3 moves. Usually best?',
          options: ['Check — it’s always strongest', 'Win the rook quietly', 'Make random moves', 'Resign'], answer: 1,
          explain: 'A non-mating check on move 1 throws away two moves.',
        },
        {
          kind: 'mcq', question: 'When is checking on move 1 of a 3-card turn a good idea?',
          options: ['When it is checkmate', 'Never', 'Only with a knight', 'Only on White’s first turn'], answer: 0,
          explain: 'Mate wins on the spot. Big wins (like forking the queen) can also justify it.',
        },
      ],
    },
  ],
};
