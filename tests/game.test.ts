import { describe, expect, it } from 'vitest';
import { applyAction, createGame, formatTurn, remainingMs, canPlayCard, cardBlockReason, currentLegalMoves, reverseExhausted, type GameState, type GameAction } from '../src/rules/game';
import { buildDeck, DECK_COMPOSITION, DECKS, expectedMoves, numberOdds, shuffle, type CardKind } from '../src/rules/cards';
import { parseSquare, type PromotionPiece } from '../src/rules/chess';

const sq = parseSquare;
const act = (s: GameState, a: GameAction, now = 0) => applyAction(s, a, now);
const draw = (s: GameState, now = 0) => act(s, { type: 'draw', player: s.current }, now);
const mv = (s: GameState, uci: string, now = 0) =>
  act(s, { type: 'move', player: s.current, from: sq(uci.slice(0, 2)), to: sq(uci.slice(2, 4)), promotion: (uci[4] as PromotionPiece) || undefined }, now);
const play = (s: GameState, uci: string[], now = 0) => uci.reduce((st, u) => mv(st, u, now), s);
const ones = (n: number): CardKind[] => Array(n).fill('1');

describe('deck', () => {
  it('has the 52-card proposed mix', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(52);
    for (const [kind, count] of Object.entries(DECK_COMPOSITION)) {
      expect(deck.filter((c) => c.kind === kind)).toHaveLength(count);
    }
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
  });
  it('shuffles deterministically by seed', () => {
    const a = shuffle(buildDeck(), 42)[0].map((c) => c.id);
    const b = shuffle(buildDeck(), 42)[0].map((c) => c.id);
    const c = shuffle(buildDeck(), 43)[0].map((c) => c.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it('reshuffles the discard pile when the draw pile runs out', () => {
    let s = createGame({ deckOrder: ['1', '1'] });
    s = mv(draw(s), 'e2e4');
    s = mv(draw(s), 'e7e5');
    expect(s.drawPile).toHaveLength(0);
    s = draw(s);
    expect(s.events.some((e) => e.type === 'reshuffle')).toBe(true);
    expect(s.phase).toBe('moving');
  });
  it('a full random game never loses or duplicates cards', () => {
    let s = createGame({ seed: 7 });
    for (let i = 0; i < 400 && s.phase !== 'over'; i++) {
      if (s.phase === 'start') s = draw(s);
      else if (s.phase === 'overflow') s = act(s, { type: 'resolveOverflow', player: s.current, choice: { discardId: s.overflowCard!.id } });
      else {
        const moves = currentLegalMoves(s);
        const m = moves[(i * 7) % moves.length];
        s = act(s, { type: 'move', player: s.current, from: m.from, to: m.to, promotion: m.promotion });
      }
      const all = [...s.drawPile, ...s.discard, ...s.hands[0], ...s.hands[1], ...(s.card ? [s.card] : []), ...(s.overflowCard ? [s.overflowCard] : [])];
      expect(all).toHaveLength(52);
      expect(new Set(all.map((c) => c.id)).size).toBe(52);
    }
  });
});


describe('turn structure', () => {
  it('White moves first and the first turn is capped at 1 move', () => {
    let s = createGame({ deckOrder: ['3', '2'] });
    expect(s.current).toBe(0);
    expect(s.colorOf[0]).toBe('w');
    s = draw(s);
    expect(s.card?.kind).toBe('3');
    expect(s.movesAllowed).toBe(1);
    s = mv(s, 'e2e4');
    expect(s.current).toBe(1);
    expect(s.history[0].capped).toBe(true);
    s = draw(s);
    expect(s.movesAllowed).toBe(2); // Black is not capped
  });
  it('the cap applies only to the opening turn', () => {
    let s = createGame({ deckOrder: ['1', '1', '3'] });
    s = mv(draw(s), 'e2e4');
    s = mv(draw(s), 'e7e5');
    s = draw(s);
    expect(s.movesAllowed).toBe(3);
  });
  it('a number card gives that many consecutive moves and then passes the turn', () => {
    let s = createGame({ deckOrder: ['1', '3', '2'] });
    s = mv(draw(s), 'e2e4');
    s = draw(s);
    s = play(s, ['e7e5', 'g8f6']);
    expect(s.current).toBe(1);
    expect(s.movesMade).toBe(2);
    s = mv(s, 'b8c6');
    expect(s.current).toBe(0);
    expect(formatTurn(s.history[1])).toBe('[3] e5 Nf6 Nc6');
  });
  it('rejects moves of the wrong player or before drawing', () => {
    const s = createGame({ deckOrder: ['1'] });
    expect(() => mv(s, 'e2e4')).toThrow();
    const d = draw(s);
    expect(() => act(d, { type: 'move', player: 1, from: sq('e7'), to: sq('e5') })).toThrow();
    expect(() => act(d, { type: 'draw', player: 0 })).toThrow();
  });
  it('giving check immediately ends the turn and forfeits remaining moves', () => {
    let s = createGame({ fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', deckOrder: ['3', '1'] });
    s = draw(s);
    s = mv(s, 'a1a8'); // check on move 1
    expect(s.current).toBe(1);
    expect(s.history[0].endedByCheck).toBe(true);
    expect(s.history[0].moves).toEqual(['Ra8+']);
  });
  it('quiet setup moves then mate on the last move wins at end of turn', () => {
    // Back-rank: two quiet moves, then mate.
    let s = createGame({ fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', deckOrder: ['3'] });
    s = draw(s);
    s = play(s, ['g1f1', 'f1e1', 'a1a8']);
    expect(s.phase).toBe('over');
    expect(s.result).toEqual({ winner: 0, reason: 'checkmate' });
  });
  it('a player in check must escape on the first move', () => {
    let s = createGame({ fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', deckOrder: ['1', '2'] });
    s = mv(draw(s), 'a1a8');
    s = draw(s);
    expect(() => mv(s, 'e8e7')).not.toThrow();
    expect(() => mv(s, 'e8d8')).toThrow(); // still attacked along rank 8
  });
  it('the king can never be captured: check ends the turn so the opponent always responds', () => {
    let s = createGame({ fen: '4k3/8/8/8/8/8/3Q4/4K3 w - - 0 1', deckOrder: ['3', '1'] });
    s = draw(s);
    s = mv(s, 'd2d7'); // check
    expect(s.current).toBe(1);
  });
  it('turn ends early when the mover runs out of legal moves', () => {
    // After h2-h3 White has no legal move left, so a 3 card ends after 1 move.
    let s = createGame({ fen: '8/8/8/8/7p/p7/P1k4P/K7 w - - 0 1', deckOrder: ['3', '1'] });
    s = draw(s);
    s = mv(s, 'h2h3');
    expect(s.current).toBe(1);
    expect(s.events.some((e) => e.type === 'turnEnd' && e.reason === 'no-moves')).toBe(true);
  });
});

describe('end of game', () => {
  it('stalemate at the start of a turn is a draw', () => {
    let s = createGame({ fen: '7k/8/5Q2/6K1/8/8/8/8 w - - 0 1', deckOrder: ['1'] });
    s = mv(draw(s), 'f6f7');
    expect(s.result).toEqual({ winner: null, reason: 'stalemate' });
  });
  it('insufficient material is a draw', () => {
    let s = createGame({ fen: '4k3/8/8/8/8/8/3r4/3QK3 w - - 0 1', deckOrder: ['1', '1'] });
    s = mv(draw(s), 'd1d2');
    expect(s.result?.reason).toBeUndefined();
    let t = createGame({ fen: '4k3/8/8/8/8/8/3r4/3NK3 w - - 0 1', deckOrder: ['1'] });
    t = mv(draw(t), 'e1d2');
    expect(t.result).toEqual({ winner: null, reason: 'insufficient' });
  });
  it('threefold repetition (same position, same player, same hands) is a draw', () => {
    let s = createGame({ fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', deckOrder: ones(20) });
    const cycle = ['a1a2', 'e8d8', 'a2a1', 'd8e8'];
    for (let i = 0; i < 8 && s.phase !== 'over'; i++) s = mv(draw(s), cycle[i % 4]);
    expect(s.result).toEqual({ winner: null, reason: 'threefold' });
  });
  it('50-move rule: 50 turns each without capture or pawn move', () => {
    let s = createGame({ fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', deckOrder: ones(200) });
    s = { ...s, noProgressTurns: 98, repetition: {} };
    s = mv(draw(s), 'a1a2');
    expect(s.phase).not.toBe('over');
    s = mv(draw(s), 'e8d8');
    expect(s.result).toEqual({ winner: null, reason: 'fifty-move' });
  });
  it('resignation', () => {
    const s = act(createGame(), { type: 'resign', player: 0 });
    expect(s.result).toEqual({ winner: 1, reason: 'resign' });
  });
});

describe('clock', () => {
  it('runs only for the current player, with grace after the card reveal', () => {
    let s = createGame({ deckOrder: ['1', '1'], clockMs: 60_000, graceMs: 1000 }, 0);
    s = draw(s, 2000); // 2s before drawing counts
    expect(remainingMs(s, 0, 2000)).toBe(58_000);
    expect(remainingMs(s, 0, 2500)).toBe(58_000); // grace
    expect(remainingMs(s, 0, 4000)).toBe(57_000);
    s = mv(s, 'e2e4', 4000);
    expect(s.clocks[0]).toBe(57_000);
    expect(remainingMs(s, 1, 10_000)).toBe(54_000);
    expect(remainingMs(s, 0, 10_000)).toBe(57_000);
  });
  it('flag fall loses', () => {
    let s = createGame({ clockMs: 5000 }, 0);
    s = act(s, { type: 'tick' }, 6000);
    expect(s.result).toEqual({ winner: 1, reason: 'timeout' });
  });
  it('flag fall is a draw when the opponent cannot mate', () => {
    let s = createGame({ fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', clockMs: 5000 }, 0);
    s = act(s, { type: 'tick' }, 6000);
    expect(s.result).toEqual({ winner: null, reason: 'timeout-vs-insufficient' });
  });
  it('pause stops the clock', () => {
    let s = createGame({ clockMs: 10_000 }, 0);
    s = act(s, { type: 'pause' }, 1000);
    expect(remainingMs(s, 0, 50_000)).toBe(9000);
    s = act(s, { type: 'resume' }, 50_000);
    expect(remainingMs(s, 0, 51_000)).toBe(8000);
  });
});

describe('en passant in multi-move turns (§2.7)', () => {
  const fen = 'rnbqkbnr/pppppppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  it('allowed on the first move if the double push was the last move of the previous turn', () => {
    let s = createGame({ fen, deckOrder: ['1', '2'] });
    s = mv(draw(s), 'd7d5');
    s = draw(s);
    expect(() => mv(s, 'e5d6')).not.toThrow();
  });
  it('not allowed if the double push was not the last move of that turn', () => {
    let s = createGame({ fen, deckOrder: ['2', '1'] });
    s = play(draw(s), ['d7d5', 'g8f6']);
    s = draw(s);
    expect(() => mv(s, 'e5d6')).toThrow();
  });
  it('not allowed on the second move of a turn', () => {
    let s = createGame({ fen, deckOrder: ['1', '2'] });
    s = mv(draw(s), 'd7d5');
    s = draw(s);
    s = mv(s, 'a2a3');
    expect(() => mv(s, 'e5d6')).toThrow();
  });
});

describe('promotion', () => {
  it('happens immediately and the new piece can move in the same turn', () => {
    let s = createGame({ fen: 'k7/4P3/8/8/8/8/7P/4K3 w - - 0 1', deckOrder: ['2'] });
    s = draw(s);
    s = mv(s, 'e7e8n');
    expect(s.pos.board[sq('e8')]).toBe('N');
    s = mv(s, 'e8c7'); // knight check on a8? c7 attacks a8 -> check ends turn
    expect(s.current).toBe(1);
  });
});

describe('action cards: hold and play (§2.4)', () => {
  it('drawn action cards go to hand and drawing continues', () => {
    let s = createGame({ deckOrder: ['skip', 'reverse', '2'] });
    s = draw(s);
    expect(s.hands[0].map((c) => c.kind)).toEqual(['skip', 'reverse']);
    expect(s.card?.kind).toBe('2');
    expect(formatTurn({ ...s.history[0] })).toBe('[Skip→hand] [Reverse→hand] [2→1]');
  });
  it('held cards cannot be played on White\'s first turn', () => {
    const s = createGame({ deckOrder: ['skip', '1'] });
    expect(canPlayCard(s, 0, 'skip')).toBe(false);
  });
  it('hand limit 2: a third action card must be discarded or played', () => {
    let s = createGame({ deckOrder: ['1', 'skip', 'skip', '1', 'skip', '1'] });
    s = mv(draw(s), 'e2e4');
    s = draw(s);
    expect(s.hands[1]).toHaveLength(2);
    s = mv(s, 'e7e5');
    s = draw(s); // white draws Skip -> fine (white hand empty)... white gets it in hand
    expect(s.hands[0]).toHaveLength(1);
    let t = createGame({ deckOrder: ['1', 'skip', 'skip', 'skip', '1'] });
    t = mv(draw(t), 'e2e4');
    t = draw(t);
    expect(t.phase).toBe('overflow');
    const keepId = t.hands[1][0].id;
    t = act(t, { type: 'resolveOverflow', player: 1, choice: { discardId: t.overflowCard!.id } });
    expect(t.phase).toBe('moving');
    expect(t.hands[1].map((c) => c.id)).toContain(keepId);
    expect(t.discard.some((c) => c.kind === 'skip')).toBe(true);
  });
  it('Skip: draw and play your turn, opponent is skipped, you go again', () => {
    let s = createGame({ deckOrder: ['skip', '1', '1', '1', '1'] });
    s = mv(draw(s), 'e2e4'); // white holds Skip
    s = mv(draw(s), 'e7e5');
    expect(canPlayCard(s, 0, 'skip')).toBe(true);
    s = act(s, { type: 'playCard', player: 0, cardId: s.hands[0][0].id });
    s = mv(draw(s), 'g1f3');
    expect(s.current).toBe(0); // black skipped
    expect(s.events.some((e) => e.type === 'skipped' && e.player === 1)).toBe(true);
    s = mv(draw(s), 'b1c3');
    expect(s.current).toBe(1);
  });
  it('Check cancels Skip', () => {
    let s = createGame({ fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', deckOrder: ['skip', '1', '1', '1', '1'], openingCap: false });
    s = mv(draw(s), 'a1a2');
    s = mv(draw(s), 'e8d8');
    s = act(s, { type: 'playCard', player: 0, cardId: s.hands[0][0].id });
    s = mv(draw(s), 'a2a8'); // check
    expect(s.current).toBe(1);
    expect(s.events.some((e) => e.type === 'skipCancelled')).toBe(true);
  });
  it('only one action card per turn', () => {
    let s = createGame({ deckOrder: ['skip', 'skip', '1', '1', '1'] });
    s = mv(draw(s), 'e2e4');
    s = mv(draw(s), 'e7e5');
    s = act(s, { type: 'playCard', player: 0, cardId: s.hands[0][0].id });
    expect(() => act(s, { type: 'playCard', player: 0, cardId: s.hands[0][0].id })).toThrow();
  });
});

describe('Reverse (§2.8)', () => {
  const setup = () => {
    // 5 turns each of knight shuffling, White holds a Reverse.
    const order: CardKind[] = ['reverse', ...ones(10), ...ones(6)];
    let s = createGame({ deckOrder: order, clockMs: 60_000 }, 0);
    const dance = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'b1c3', 'b8c6', 'c3b1', 'c6b8', 'g1h3', 'g8h6'];
    let t = 0;
    for (const m of dance) s = mv(draw(s, t), m, (t += 1000));
    return s;
  };
  it('is blocked until each player has finished 5 turns', () => {
    let s = createGame({ deckOrder: ['reverse', ...ones(10)] });
    s = mv(draw(s), 'g1f3');
    s = mv(draw(s), 'g8f6');
    expect(canPlayCard(s, 0, 'reverse')).toBe(false);
    expect(() => act(s, { type: 'playCard', player: 0, cardId: s.hands[0][0].id })).toThrow(/Reverse unlocks/);
  });
  it('swaps sides, uses up the turn, keeps clocks and hands with the players', () => {
    let s = setup();
    expect(s.current).toBe(0);
    expect(s.turnsCompleted).toEqual([5, 5]);
    const clocksBefore = [...s.clocks];
    s = act(s, { type: 'playCard', player: 0, cardId: s.hands[0][0].id }, 20_000);
    expect(s.colorOf).toEqual(['b', 'w']);
    expect(s.current).toBe(1); // opponent now controls White, which moves next
    expect(s.pos.board[sq('h3')]).toBe('N'); // position unchanged
    expect(s.clocks[1]).toBe(clocksBefore[1]);
    expect(s.clocks[0]).toBeLessThan(clocksBefore[0]);
    expect(s.hands[0]).toHaveLength(0);
    s = draw(s, 20_000);
    s = mv(s, 'h3g1', 21_000); // player 1 moves the White pieces
    expect(s.current).toBe(0);
    s = draw(s, 21_000);
    expect(() => mv(s, 'h6g8', 21_000)).not.toThrow(); // player 0 now plays Black
  });
  it('anti ping-pong: cannot Reverse straight back', () => {
    let s = createGame({ deckOrder: ['reverse', '1', 'reverse', ...ones(30)] });
    const dance = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'b1c3', 'b8c6', 'c3b1', 'c6b8', 'g1h3', 'g8h6'];
    for (const m of dance) s = mv(draw(s), m);
    s = act(s, { type: 'playCard', player: 0, cardId: s.hands[0][0].id });
    expect(s.current).toBe(1);
    expect(canPlayCard(s, 1, 'reverse')).toBe(false);
    s = mv(draw(s), 'h3g1');
    s = mv(draw(s), 'h6g8');
    expect(canPlayCard(s, 1, 'reverse')).toBe(true);
  });
});

describe('rules v2: deck mix', () => {
  it('has fewer 3s but still 42 number cards in 52', () => {
    expect(DECK_COMPOSITION).toEqual({ '1': 19, '2': 18, '3': 5, skip: 6, reverse: 4 });
    expect(Object.values(DECK_COMPOSITION).reduce((a, b) => a + b, 0)).toBe(52);
    expect(buildDeck()).toHaveLength(52);
    expect(buildDeck().filter((c) => c.kind === '3')).toHaveLength(5);
    expect(expectedMoves()).toBeCloseTo(70 / 42, 6); // ≈1.67 moves per number card (v1: 1.79)
    expect(expectedMoves(1)).toBeCloseTo(75 / 42, 6);
    expect(numberOdds()['3']).toBeCloseTo(5 / 42, 6);
  });
  it('keeps the v1 deck for old games', () => {
    expect(Object.values(DECKS[1]).reduce((a, b) => a + b, 0)).toBe(52);
    expect(buildDeck(1).filter((c) => c.kind === '3')).toHaveLength(9);
    expect(createGame({ rules: 1, seed: 3 }).drawPile.filter((c) => c.kind === '3')).toHaveLength(9);
    expect(createGame({ seed: 3 }).drawPile.filter((c) => c.kind === '3')).toHaveLength(5);
  });
});

describe('rules v2: one Reverse per player per game', () => {
  const dance = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'b1c3', 'b8c6', 'c3b1', 'c6b8', 'g1h3', 'g8h6'];
  const play = (order: CardKind[], rules?: 1 | 2) => {
    let s = createGame({ deckOrder: order, rules });
    for (const m of dance) s = mv(draw(s), m);
    return s;
  };
  it('a second Reverse held in hand is discarded when the first is played', () => {
    let s = play(['reverse', 'reverse', ...ones(40)]);
    expect(s.hands[0].map((c) => c.kind)).toEqual(['reverse', 'reverse']);
    s = act(s, { type: 'playCard', player: 0, cardId: s.hands[0][0].id });
    expect(s.reversesUsed).toEqual([1, 0]);
    expect(reverseExhausted(s, 0)).toBe(true);
    expect(s.hands[0]).toHaveLength(0);
    expect(s.events.some((e) => e.type === 'burnCard' && e.player === 0 && e.from === 'hand')).toBe(true);
    const turn = s.history.find((t) => t.played.includes('reverse'))!;
    expect(turn.burned).toEqual(['reverse']);
    expect(formatTurn(turn)).toBe('{Reverse} [Reverse✕]');
  });
  it('a Reverse drawn after yours is used is discarded and you draw again', () => {
    let s = play(['reverse', ...ones(10), '1', 'reverse', '2', ...ones(20)]);
    s = act(s, { type: 'playCard', player: 0, cardId: s.hands[0][0].id });
    s = mv(draw(s), 'h3g1'); // opponent (now White)
    const before = s.events.length;
    s = draw(s); // player 0 draws the dead Reverse, then a 2
    const fresh = s.events.slice(before);
    expect(fresh.find((e) => e.type === 'burnCard')).toMatchObject({ player: 0, from: 'deck', card: { kind: 'reverse' } });
    expect(s.hands[0]).toHaveLength(0);
    expect(s.card?.kind).toBe('2');
    expect(s.movesAllowed).toBe(2);
    expect(s.discard.some((c) => c.kind === 'reverse')).toBe(true);
    expect(formatTurn(s.history[s.history.length - 1])).toBe('[Reverse✕] [2]');
  });
  it('the reducer (and so the server) rejects a second Reverse', () => {
    let s = play(['reverse', ...ones(40)]);
    s = act(s, { type: 'playCard', player: 0, cardId: s.hands[0][0].id });
    s = mv(draw(s), 'h3g1'); // opponent's turn; now it's player 0 again
    // Force a Reverse into the hand (can't happen in play: it would have been discarded).
    s = { ...s, hands: [[{ id: 9999, kind: 'reverse' }], s.hands[1]] };
    expect(s.current).toBe(0);
    expect(canPlayCard(s, 0, 'reverse')).toBe(false);
    expect(cardBlockReason(s, 0, 'reverse')).toMatch(/used your Reverse/);
    expect(() => act(s, { type: 'playCard', player: 0, cardId: 9999 })).toThrow(/used your Reverse/);
  });
  it('the limit is per player: the opponent still has theirs', () => {
    let t = createGame({ deckOrder: ['1', 'reverse', ...ones(40)] });
    for (const m of dance) t = mv(draw(t), m);
    t = mv(draw(t), 'h3g1');
    expect(t.hands[1].map((c) => c.kind)).toEqual(['reverse']);
    t = act(t, { type: 'playCard', player: 1, cardId: t.hands[1][0].id });
    expect(t.reversesUsed).toEqual([0, 1]);
    expect(reverseExhausted(t, 0)).toBe(false);
    expect(reverseExhausted(t, 1)).toBe(true);
  });
  it('rules v1 games keep unlimited Reverses', () => {
    let s = play(['reverse', 'reverse', ...ones(40)], 1);
    s = act(s, { type: 'playCard', player: 0, cardId: s.hands[0][0].id });
    expect(s.config.reverseLimit).toBeNull();
    expect(s.hands[0].map((c) => c.kind)).toEqual(['reverse']);
  });
});
