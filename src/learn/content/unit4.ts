import type { Unit } from '../types';

/** Unit 4 — Skip & Reverse (design doc §2.4, §2.8). */
export const unit4: Unit = {
  id: 'actions',
  index: 4,
  title: 'Skip & Reverse',
  blurb: 'Hold action cards and play them at the perfect moment.',
  color: '#8a5cff',
  lessons: [
    {
      id: 'e1', title: 'Holding cards', icon: 'layers', minutes: 2,
      steps: [
        {
          kind: 'explain', title: 'Action cards go to your hand',
          text: 'Draw a **Skip** or **Reverse** and it goes into your **hand**; you keep drawing until a number card comes up. Watch White draw a Skip, then a 2.',
          demo: { fen: '4k3/pppp4/8/8/8/8/PPPP4/4K3 w - - 0 1', deck: ['skip', '2'], actions: ['draw', 'a2a3', 'b2b4'] },
          cards: ['skip', 'reverse'],
        },
        {
          kind: 'explain', title: 'Hand limit: two',
          text: 'You can hold **up to 2** action cards. Draw a third and you must **discard one or play the new card** right away. Your opponent sees **how many** you hold, but not which.',
          cards: ['skip', 'reverse', 'skip'],
        },
        {
          kind: 'mcq', question: 'You draw a Skip. What happens next?',
          options: ['Your turn ends', 'It goes to your hand and you draw again', 'Your opponent is skipped immediately', 'You must play it now'], answer: 1,
          explain: 'Action cards are saved for later. You keep drawing until a number card.',
        },
        {
          kind: 'mcq', question: 'What can your opponent see about your hand?',
          options: ['Nothing', 'How many action cards you hold', 'Exactly which cards you hold', 'Only your Reverses'], answer: 1,
          explain: 'They see the count — not whether it’s a Skip or a Reverse.',
        },
      ],
    },
    {
      id: 'e2', title: 'Playing Skip', icon: 'skip', minutes: 3,
      steps: [
        {
          kind: 'explain', title: 'Two turns in a row',
          text: 'Play a Skip at the **start of your turn, before drawing**. You take your turn, your opponent’s next turn is **skipped**, and you draw again for another turn. One catch: **check cancels Skip** — if they are in check when their skipped turn begins, they play normally.',
          demo: { fen: '6rk/6pp/8/8/8/8/6PP/1N4K1 w - - 0 1', deck: ['2', '2'], hands: [['skip'], []], actions: ['skip', 'b1d2', 'd2f3', 'f3g5', 'g5f7'] },
          cards: ['skip'],
        },
        { kind: 'puzzle', puzzle: {
          id: 'e2-four', prompt: 'You hold a Skip and will draw 2 and 2. Checkmate before your opponent moves.',
          fen: '6rk/6pp/8/8/8/8/6PP/1N4K1 w - - 0 1', hand: ['skip'], cards: ['2', '2'], goals: [{ type: 'mate' }],
          solution: ['skip', 'b1d2', 'd2f3', 'f3g5', 'g5f7'], hint: 'Play the Skip first. Your knight needs four hops to reach f7.',
          explain: 'Skip turned two 2-move turns into one 4-move attack: Nd2, Nf3, Ng5, Nf7#.',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'e2-ones', prompt: 'You hold a Skip and will draw two 1s. Mate in two turns.',
          fen: '4k3/8/8/4K3/8/8/7P/R7 w - - 0 1', hand: ['skip'], cards: ['1', '1'], goals: [{ type: 'mate' }],
          solution: ['skip', 'e5e6', 'a1a8'], hint: 'King first (to e6), then the rook mates — and the Skip stops Black from escaping in between.',
          explain: 'Ke6, (Black is skipped), Ra8#.',
        } },
        {
          kind: 'mcq', question: 'You played Skip and your turn ends with a check. What happens to the Skip?',
          options: ['They are skipped anyway', 'Check cancels Skip — they play normally', 'You get a third turn', 'The Skip returns to your hand'], answer: 1,
          explain: 'A player in check is never skipped. Finish a Skip turn quietly if you want the extra turn.',
        },
      ],
    },
    {
      id: 'e3', title: 'When to save a Skip', icon: 'gem', minutes: 2,
      steps: [
        {
          kind: 'explain', title: 'Don’t waste it',
          text: 'A Skip is most valuable when **two turns in a row** finish something one turn can’t: a long mating attack, a pawn race, or escaping a big threat. If one turn is enough, **keep it** for later.',
          cards: ['skip'],
        },
        { kind: 'puzzle', puzzle: {
          id: 'e3-save', prompt: 'You hold a Skip and drew a 3. Mate this turn — and keep the Skip.',
          fen: '6rk/6pp/8/8/8/2N5/6PP/6K1 w - - 0 1', hand: ['skip'], cards: ['3'], goals: [{ type: 'mate' }, { type: 'keepCard', card: 'skip' }],
          solution: ['c3e4', 'e4g5', 'g5f7'], hint: 'Just draw. Three knight hops are enough.',
          explain: 'One turn was enough — the Skip stays in your hand.',
        } },
        {
          kind: 'mcq', question: 'Which is usually the best moment for a Skip?',
          options: ['On your first turn', 'When two turns in a row win the game or a race', 'Whenever you draw a 1', 'Right after giving check'], answer: 1,
          explain: 'Spend it when the double turn changes the outcome.',
        },
      ],
    },
    {
      id: 'e4', title: 'Reverse', icon: 'reverse', minutes: 3,
      steps: [
        {
          kind: 'explain', title: 'Swap sides',
          text: '**Reverse** swaps colours: you take over your opponent’s army and they take yours. It **uses your turn** (no draw). The position stays the same and the **same colour moves next — now controlled by your opponent**. Each player gets **only one Reverse per game**, so make it count.',
          demo: { fen: '1r2k3/8/8/8/8/3q4/6PP/7K w - - 0 1', hands: [['reverse'], []], actions: ['reverse', 'h2h3'] },
          cards: ['reverse'],
        },
        { kind: 'puzzle', puzzle: {
          id: 'e4-steal', prompt: 'You are White and hopelessly behind. You hold a Reverse. Take over the stronger army.',
          fen: '1r2k3/8/8/8/8/3q4/6PP/7K w - - 0 1', hand: ['reverse'], cards: ['1'], goals: [{ type: 'lead', min: 5 }],
          solution: ['reverse'], hint: 'Tap the Reverse card instead of drawing.',
          explain: 'Now you play Black — a queen and rook up!',
        } },
        { kind: 'puzzle', puzzle: {
          id: 'e4-dont', prompt: 'You hold a Reverse and drew a 1. Should you play it? Win the game.',
          fen: '6k1/5ppp/8/8/8/8/5PPP/1R4K1 w - - 0 1', hand: ['reverse'], cards: ['1'], goals: [{ type: 'mate' }],
          solution: ['b1b8'], hint: 'You are the one with the mate. Keep your side!',
          explain: 'Rb8#. Reversing would have handed this position to your opponent.',
        } },
        {
          kind: 'mcq', question: 'After you play Reverse, who moves next?',
          options: ['You, with your new colour', 'Your opponent, with the colour you just gave them', 'Nobody — draw again', 'White, always'], answer: 1,
          explain: 'Reverse uses your turn. The same colour is to move, but your opponent now controls it.',
        },
      ],
    },
    {
      id: 'e5', title: 'Reverse timing', icon: 'rotate-ccw', minutes: 2,
      steps: [
        {
          kind: 'explain', title: 'Rules of the swap',
          text: '**Opening protection:** no Reverse until **each player has finished 5 turns**. **No ping-pong:** you can’t Reverse on the turn right after your opponent did. **Clocks and hands stay with players**, not colours, and a pending Skip still targets the same player.',
          cards: ['reverse'],
        },
        {
          kind: 'explain', title: 'One Reverse per game',
          text: 'Each player may play **one Reverse per game**. Once yours is used, any other Reverse in your hand is discarded, and any Reverse you **draw** later is discarded too — you simply **draw again** until you get a number. Your opponent still has their own Reverse to use.',
          demo: { fen: '6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1', deck: ['reverse', '2'], reversesUsed: [1, 0], actions: ['draw', 'g1f1', 'f1e1'] },
          cards: ['reverse'],
        },
        { kind: 'puzzle', puzzle: {
          id: 'e5-locked', prompt: 'Only 3 turns each so far — your Reverse is still locked. You drew a 2: mate the old-fashioned way.',
          fen: '7k/8/5K2/8/8/8/8/1Q6 w - - 0 1', hand: ['reverse'], cards: ['2'], reverseProtection: 5, turnsDone: [3, 3], goals: [{ type: 'mate' }],
          solution: ['f6g6', 'b1b8'], hint: 'Kg6 covers h7. Then mate on the back rank.',
          explain: 'Kg6, Qb8#. Reverse unlocks after 5 turns each.',
        } },
        {
          kind: 'mcq', question: 'Your opponent just played Reverse. Can you Reverse straight back on your next turn?',
          options: ['Yes', 'No — no Reverse right after theirs', 'Only with a Skip', 'Only if in check'], answer: 1,
          explain: 'The anti-ping-pong rule. Wait one turn.',
        },
        {
          kind: 'mcq', question: 'You already played your Reverse earlier this game, then draw another Reverse. What happens?',
          options: ['It is discarded and you draw again', 'It goes into your hand for later', 'You must play it now', 'Your opponent gets it'], answer: 0,
          explain: 'One Reverse per player per game. Extra Reverses are dead cards: discarded, and you draw again.', cards: ['reverse'],
        },
        {
          kind: 'mcq', question: 'You had 4:00 on your clock and Reverse. How much time do you have now?',
          options: ['4:00 — clocks belong to players', 'Your opponent’s time', '10:00', 'Half of each'], answer: 0,
          explain: 'Clocks and held cards stay with their owner.',
        },
        {
          kind: 'mcq', question: 'When is a Reverse usually strongest?',
          options: ['When the side NOT to move is clearly better', 'When you are winning', 'On your first turn', 'When you hold a Skip too'], answer: 0,
          explain: 'After a Reverse your opponent moves the side to move — so you want the other, stronger side.',
        },
      ],
    },
  ],
};
