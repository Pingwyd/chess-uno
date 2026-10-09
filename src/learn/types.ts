/** Data model for the learning path (design doc §8). Content is plain data so it can be validated by tests. */
import type { ActionKind, CardKind, NumberKind } from '../rules/cards';
import type { PieceType } from '../rules/chess';

/**
 * What a puzzle asks for. Every goal is checked against the real rules engine at the end of the
 * learner's turn(s), so any line that meets the goal is accepted — not just the authored solution.
 */
export type Goal =
  /** Checkmate by the end of your turn(s). */
  | { type: 'mate' }
  /** Leave the opponent in check. */
  | { type: 'check' }
  /** Pieces standing on squares, e.g. `{ g1: 'K', f1: 'R' }` (FEN letters, case = colour). */
  | { type: 'occupy'; squares: Record<string, string> }
  /** The enemy piece that started on this square has been captured. */
  | { type: 'capture'; square: string }
  /** The opponent has `count` (default 1) fewer pieces of this type. */
  | { type: 'captureType'; piece: PieceType; count?: number }
  /** You have gained a piece of this type (default queen) by promotion. */
  | { type: 'promote'; piece?: PieceType }
  /** Whatever the opponent does next turn with an N card, they cannot checkmate you. */
  | { type: 'safe'; oppCard: 1 | 2 | 3 }
  /** Whatever the opponent does next turn with an N card, they cannot capture your piece of this type. */
  | { type: 'keep'; piece: PieceType; oppCard: 1 | 2 | 3 }
  /** You are still holding this action card afterwards. */
  | { type: 'keepCard'; card: ActionKind }
  /** The side you control afterwards is ahead by at least `min` points of material. */
  | { type: 'lead'; min: number }
  /** The opponent's king is NOT in check afterwards (you kept your moves). */
  | { type: 'noCheck' };

/** Scripted board animation: tokens are UCI moves (`e2e4`, `e7e8q`), `skip`, `reverse` or `draw`. */
export interface Demo {
  fen: string;
  /** Draw pile, top first. Padded with 1s. */
  deck?: CardKind[];
  /** Action cards already in each player's hand [side to move, other]. */
  hands?: [ActionKind[], ActionKind[]];
  actions: string[];
  /** Board orientation (default: side to move at the bottom). */
  bottom?: 'w' | 'b';
  reverseProtection?: number;
  /** Reverses already played by [side to move, other] (rules v2: one per player per game). */
  reversesUsed?: [number, number];
}

export interface Puzzle {
  id: string;
  /** Short instruction shown above the board. */
  prompt: string;
  fen: string;
  /**
   * Number card(s) you will draw, in order (more than one when you hold a Skip). The opponent's
   * cards are never needed — puzzles end when your turn(s) end.
   */
  cards: NumberKind[];
  /** Action cards in your hand at the start. */
  hand?: ActionKind[];
  /** Opponent move(s) played first (e.g. the double push for en passant). Uses a card of that length. */
  prelude?: string[];
  goals: Goal[];
  /** One verified solution (tokens like Demo.actions). Shown via "Show solution". */
  solution: string[];
  hint: string;
  /** Shown after solving. */
  explain: string;
  /** Turns each player must finish before Reverse is allowed. Default 0 in puzzles. */
  reverseProtection?: number;
  /** Turns already finished by [you, opponent] (for the Reverse protection lesson). */
  turnsDone?: [number, number];
}

export type Step =
  | { kind: 'explain'; title: string; text: string; demo?: Demo; cards?: CardKind[] }
  | { kind: 'mcq'; question: string; options: string[]; answer: number; explain: string; demo?: Demo; cards?: CardKind[] }
  | { kind: 'puzzle'; puzzle: Puzzle };

export interface Lesson {
  id: string;
  title: string;
  /** Glyph for the path node. */
  /** Lucide icon name (see src/ui/icons.tsx). */
  icon: string;
  minutes: number;
  steps: Step[];
}

export interface Unit {
  id: string;
  index: number;
  title: string;
  blurb: string;
  /** Accent colour for the unit band and nodes. */
  color: string;
  lessons: Lesson[];
  /** Optional test-out quiz that completes the whole unit (Chess basics). */
  placement?: Lesson;
}
