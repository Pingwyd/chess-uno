/**
 * Wire protocol shared by the browser client and the authoritative game server.
 * Messages are JSON over a single WebSocket per client.
 */
import type { GameAction, GameState, PlayerId } from '../rules/game';

export const EMOTES = {
  gg: 'GG',
  clap: '👏',
  wow: '😮',
  lol: '😂',
  niceReverse: 'Nice Reverse!',
} as const;
export type EmoteId = keyof typeof EMOTES;

export const CHAT_MAX_LENGTH = 200;

export interface PublicUser {
  id: string;
  name: string;
  guest: boolean;
  email?: string | null;
  rating: number;
  ratedGames: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface SeatInfo {
  userId: string;
  name: string;
  rating: number;
  guest: boolean;
  connected: boolean;
  /** Server timestamp when an absent player forfeits, or null when connected. */
  graceUntil: number | null;
}

export interface ChatMessage {
  id: number;
  userId: string;
  name: string;
  seat: PlayerId | null;
  text?: string;
  emote?: EmoteId;
  at: number;
}

export interface RoomResultInfo {
  /** Rating delta per seat for rated games. */
  ratingChange: [number, number] | null;
  ratingAfter: [number, number] | null;
  /** Deck seed published after the game so the shuffle can be verified. */
  seed: number;
  note?: 'abandoned';
}

export interface RoomSnapshot {
  code: string;
  gameId: string;
  rated: boolean;
  /** Your seat, or null for spectators. */
  you: PlayerId | null;
  /** True when this is a delayed spectator view (ranked games, one turn behind). */
  delayed: boolean;
  seats: [SeatInfo, SeatInfo];
  /** Redacted game state (no deck order, no hidden hands). */
  state: GameState;
  /** Card ids whose faces are hidden from this viewer (opponent's held cards). */
  hiddenCardIds: number[];
  spectators: number;
  serverNow: number;
  result: RoomResultInfo | null;
}

export type ClientMsg =
  | { t: 'hello'; token: string }
  | { t: 'queue' }
  | { t: 'cancelQueue' }
  | { t: 'createRoom' }
  | { t: 'joinRoom'; code: string }
  | { t: 'spectate'; code: string }
  | { t: 'action'; action: GameAction }
  | { t: 'chat'; text?: string; emote?: EmoteId }
  | { t: 'leave' }
  | { t: 'ping'; at: number };

export type ServerMsg =
  | { t: 'welcome'; user: PublicUser; activeRoom: string | null }
  | { t: 'queued'; rated: boolean }
  | { t: 'queueCancelled' }
  | { t: 'roomCreated'; code: string }
  | { t: 'room'; snap: RoomSnapshot }
  | { t: 'chat'; msg: ChatMessage }
  | { t: 'chatHistory'; msgs: ChatMessage[] }
  | { t: 'actionRejected'; message: string }
  | { t: 'error'; code: string; message: string }
  | { t: 'left' }
  | { t: 'pong'; at: number; serverNow: number };

/** Normalise an invite code typed or pasted by a user (accepts full links too). */
export function normalizeCode(input: string): string {
  const m = input.match(/[?&](?:join|watch)=([A-Za-z0-9]+)/);
  return (m ? m[1] : input).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
}
