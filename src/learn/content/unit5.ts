import type { Unit } from '../types';

/** Unit 5 — Strategy. Finishing it unlocks ranked play (design doc §4, §8). */
export const unit5: Unit = {
  id: 'strategy',
  index: 5,
  title: 'Strategy',
  blurb: 'Defend against big turns, manage the clock, find Chess Uno tactics.',
  color: '#ffd98a',
  lessons: [
    {
      id: 'f1', title: 'Defending vs 3-move turns', icon: '🛡', minutes: 3,
      steps: [
        {
          kind: 'explain', title: 'Ask: what if they draw a 3?',
          text: 'Before ending your turn, imagine your opponent drawing a **3**. Quiet setups can mate in one turn, so weak back ranks and loose kings are much more dangerous than in normal chess.',
          cards: ['3'],
        },
        { kind: 'puzzle', puzzle: {
          id: 'f1-luft', prompt: 'You drew a 1. Make sure Black can’t mate you even with a 3.',
          fen: 'r1b3k1/5ppp/8/8/8/8/5PPP/2R3K1 w - - 0 1', cards: ['1'], goals: [{ type: 'safe', oppCard: 3 }],
          solution: ['h2h3'], hint: 'Your king needs an escape square — but watch the bishop’s diagonals.',
          explain: 'A pawn move gives the king air. g3/g4 lose to bishop ideas — the engine checked every reply.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'f1-bishop', prompt: 'You drew a 1. Black threatens Ra1 mate ideas. Stay safe against a 3.',
          fen: 'r5k1/5ppp/8/8/8/4B3/5PPP/6K1 w - - 0 1', cards: ['1'], goals: [{ type: 'safe', oppCard: 3 }],
          solution: ['h2h3'], hint: 'Give the king air, or step it towards the centre.',
          explain: 'Luft! Your king now has a square when the rook arrives.',
        } },
        {
          kind: 'mcq', question: 'Why are back-rank weaknesses worse in Chess Uno?',
          options: ['They aren’t', 'Multi-move turns let a rook or queen set up and mate in one turn', 'Rooks move further', 'Kings can be captured'], answer: 1,
          explain: 'Two quiet moves plus a mate is one turn with a 3.',
        },
      ],
    },
    {
      id: 'f2', title: 'Check to cut plans short', icon: '✂', minutes: 2,
      steps: [
        {
          kind: 'explain', title: 'Spend their moves for them',
          text: 'A check ends **your** turn — but it also forces your opponent to spend their **first move** escaping. Against a big threat, a check can leave them too few moves to finish their plan.',
          cards: ['3'],
        },
        { kind: 'puzzle', puzzle: {
          id: 'f2-cut', prompt: 'You drew a 1. Black’s queen and rook are lined up for a 3-move attack. Stop it.',
          fen: '4r1k1/5ppp/3q4/8/8/8/5PPP/R4RK1 w - - 0 1', cards: ['1'], goals: [{ type: 'safe', oppCard: 3 }],
          solution: ['a1a8'], hint: 'Quiet moves aren’t enough. Make Black answer you first.',
          explain: 'Ra8+! Black must spend a move on the check, and two moves can’t finish the attack.',
        } },
        {
          kind: 'mcq', question: 'You give check on your last move. What does it cost your opponent?',
          options: ['Nothing', 'Their first move must deal with the check', 'Their whole turn', 'A card from their hand'], answer: 1,
          explain: 'They still get all their moves — but the first one is forced.',
        },
      ],
    },
    {
      id: 'f3', title: 'King safety & the clock', icon: '⌛', minutes: 2,
      steps: [
        {
          kind: 'explain', title: 'Ten minutes each',
          text: 'Each player has **10 minutes**. Your clock starts once your card is revealed (about a second of grace for the animation). **Run out and you lose** — unless your opponent can’t possibly mate, then it’s a draw. Big turns take longer to plan, so save time for them.',
          cards: ['3'],
        },
        { kind: 'puzzle', puzzle: {
          id: 'f3-guard', prompt: 'You drew a 1. Black’s queen and knight are eyeing h2. Survive a 2-move turn.',
          fen: '6k1/5ppp/5n2/8/7q/8/5PPP/R2Q1RK1 w - - 0 1', cards: ['1'], goals: [{ type: 'safe', oppCard: 2 }],
          solution: ['d1h5'], hint: 'Trade off the attacker, give check — or make room for your king.',
          explain: 'Several moves work; the engine verified every Black reply with a 2.',
        } },
        {
          kind: 'mcq', question: 'Your clock hits 0:00 but your opponent only has a king left. Result?',
          options: ['You lose', 'Draw — they can’t checkmate', 'You win', 'Replay the turn'], answer: 1,
          explain: 'Timeout against insufficient mating material is a draw.',
        },
        {
          kind: 'mcq', question: 'When does your clock start?',
          options: ['When your opponent’s turn ends', 'After your card is revealed (short grace)', 'Only on your second move', 'It never stops'], answer: 1,
          explain: 'A short grace covers the card animation, then your time runs.',
        },
      ],
    },
    {
      id: 'f4', title: 'Chess Uno tactics', icon: '✷', minutes: 3,
      steps: [
        {
          kind: 'explain', title: 'Tricks normal chess doesn’t have',
          text: 'A promoted queen can move **in the same turn**. Several captures in a row can’t be answered. And a Reverse can steal a winning army. Let’s use them.',
          cards: ['2', '3', 'reverse'],
        },
        { kind: 'puzzle', puzzle: {
          id: 'f4-promo', prompt: 'You drew a 2. Promote, then use the new queen.',
          fen: '3r3k/1P4pp/8/8/8/8/6PP/6K1 w - - 0 1', cards: ['2'], goals: [{ type: 'mate' }],
          solution: ['b7b8q', 'b8d8'], hint: 'b8=Q doesn’t give check (the rook blocks). Then take it.',
          explain: 'b8=Q, Qxd8#. Promotion happens immediately — the queen can move again this turn.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'f4-spree', prompt: 'You drew a 3. Collect all three black pieces.',
          fen: '4k3/8/1n3b2/8/3r4/8/6PP/3Q2K1 w - - 0 1', cards: ['3'],
          goals: [{ type: 'captureType', piece: 'r' }, { type: 'captureType', piece: 'n' }, { type: 'captureType', piece: 'b' }],
          solution: ['d1d4', 'd4b6', 'b6f6'], hint: 'Rook first, then follow the diagonal and the rank.',
          explain: 'Qxd4, Qxb6, Qxf6. A three-capture spree — none of it could be answered.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'f4-steal', prompt: 'You are Black and White is crushing you. You hold a Reverse.',
          fen: '4k3/8/8/8/8/8/PPP5/1K1R3R b - - 0 1', hand: ['reverse'], cards: ['1'], goals: [{ type: 'lead', min: 5 }],
          solution: ['reverse'], hint: 'Swap sides!', explain: 'Now you play White with two rooks extra.',
        } },
      ],
    },
  ],
};
