import type { Puzzle } from '../types';

/**
 * Daily puzzle pool (design doc §8: "a new one every day, the same for everyone"). The puzzle of the
 * day is picked by UTC date, so every player worldwide gets the same one.
 */
export const DAILY_PUZZLES: Puzzle[] = [
  {
    id: 'dly-backrank', prompt: 'You drew a 3. The back rank is guarded — find a mate anyway.',
    fen: '5rk1/5ppp/8/8/8/8/5PPP/1Q2R1K1 w - - 0 1', cards: ['3'], goals: [{ type: 'mate' }],
    solution: ['b1b8', 'e1e8', 'e8f8'], hint: 'Pile up on the 8th rank — queen and rook together outnumber the rook on f8.',
    explain: 'Qb8 and Re8 overload f8, then Rxf8#. Other quiet routes (Re3–h3 and Qh7#) work too.',
  },
  {
    id: 'dly-doubled', prompt: 'You drew a 2. Checkmate.',
    fen: '2kr4/ppp5/8/8/8/8/5PPP/3QR1K1 w - - 0 1', cards: ['2'], goals: [{ type: 'mate' }],
    solution: ['e1e8', 'd1d8'], hint: 'Re8 isn’t check — your opponent’s rook on d8 is in the way. Then pile onto d8.',
    explain: 'Re8 is quiet (the rook on d8 blocks), then Qxd8# or Rxd8#.',
  },
  {
    id: 'dly-knightq', prompt: 'You drew a 2. Mate the cornered king.',
    fen: 'r6k/6pp/7N/8/8/8/6PP/5QK1 w - - 0 1', cards: ['2'], goals: [{ type: 'mate' }],
    solution: ['f1a6', 'a6a8'], hint: 'The knight on h6 already guards g8. Get the queen to the 8th rank — through the rook.',
    explain: 'Qa6 (or Qa1/Qf3) and Qxa8#. The knight seals the king in.',
  },
  {
    id: 'dly-longknight', prompt: 'You hold a Skip and will draw a 2 then a 3. Mate before Black moves.',
    fen: '6rk/6pp/8/8/8/8/6PP/N5K1 w - - 0 1', hand: ['skip'], cards: ['2', '3'], goals: [{ type: 'mate' }],
    solution: ['skip', 'a1b3', 'b3c5', 'c5e6', 'e6g5', 'g5f7'], hint: 'Skip, then walk the knight towards f7 — five hops.',
    explain: 'A five-hop knight tour ending in a smothered mate, thanks to the Skip.',
  },
  {
    id: 'dly-defend', prompt: 'You drew a 1. Black’s queen is in your camp. Survive a 3-move turn.',
    fen: '6k1/5ppp/8/8/8/2q5/5PPP/3R2K1 w - - 0 1', cards: ['1'], goals: [{ type: 'safe', oppCard: 3 }],
    solution: ['h2h3'], hint: 'Give your king air, or guard the back rank.',
    explain: 'Your king now has a flight square (or the rook covers the rank). No 3-move mate exists.',
  },
  {
    id: 'dly-promo', prompt: 'You drew a 1. Promote with style.',
    fen: '1r5k/P5pp/8/8/8/8/6PP/6K1 w - - 0 1', cards: ['1'], goals: [{ type: 'mate' }],
    solution: ['a7b8q'], hint: 'Pawns capture diagonally — even when promoting.',
    explain: 'axb8=Q#. Capture and promote in one move.',
  },
  {
    id: 'dly-reverse', prompt: 'You are White, a queen and rook down. You hold a Reverse.',
    fen: '3qk3/3r4/8/8/8/8/6PP/6K1 w - - 0 1', hand: ['reverse'], cards: ['1'], goals: [{ type: 'lead', min: 5 }],
    solution: ['reverse'], hint: 'Swap armies!', explain: 'Reverse — and the big army is yours.',
  },
  {
    id: 'dly-quiet', prompt: 'You drew a 2. Win the queen without wasting a move on check.',
    fen: '4k3/8/8/q7/8/8/PPP5/1K5R w - - 0 1', cards: ['2'], goals: [{ type: 'captureType', piece: 'q' }],
    solution: ['h1h5', 'h5a5'], hint: 'Rh8+ ends your turn. Line the rook up on the 5th rank instead.',
    explain: 'Rh5 then Rxa5 — quiet first, capture second.',
  },
];
