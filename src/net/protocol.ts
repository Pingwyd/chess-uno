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

/** Profile avatars: a symbol from this list, or null for the name's initial. */
export const AVATARS = ['♞', '♛', '♜', '♝', '♚', '♟', '🃏', '🔥', '🌊', '⚡', '🌙', '⭐', '🦊', '🐉', '🦉', '👑'] as const;
export type AvatarId = (typeof AVATARS)[number];
export const isAvatar = (v: unknown): v is AvatarId => typeof v === 'string' && (AVATARS as readonly string[]).includes(v);

export interface PublicUser {
  id: string;
  name: string;
  avatar?: string | null;
  guest: boolean;
  email?: string | null;
  rating: number;
  ratedGames: number;
  wins: number;
  losses: number;
  draws: number;
}

/** Where a friend is right now (live via the WebSocket). */
export type PresenceStatus = 'offline' | 'online' | 'playing';
export interface Presence {
  status: PresenceStatus;
  /** Room code of the game they are playing (only sent to friends), for spectating. */
  code?: string;
  rated?: boolean;
}

export interface FriendInfo {
  id: string;
  name: string;
  avatar: string | null;
  rating: number;
  ratedGames: number;
  presence?: Presence;
}

export interface FriendsList {
  friends: FriendInfo[];
  /** Requests sent to you. */
  incoming: FriendInfo[];
  /** Requests you sent. */
  outgoing: FriendInfo[];
}

export type Relation = 'none' | 'friends' | 'outgoing' | 'incoming' | 'self';

export interface UserSearchHit extends FriendInfo { relation: Relation }

export interface ChallengeInfo {
  id: string;
  from: FriendInfo;
  to: FriendInfo;
  code: string;
  /** Server time the challenge lapses. */
  expiresAt: number;
}

export type SocialEvent = 'request' | 'accepted' | 'declined' | 'cancelled' | 'removed';

export interface LiveGame {
  code: string;
  rated: boolean;
  /** Private room (invite link / friend challenge): only listed for the players' friends. */
  private: boolean;
  players: [FriendInfo, FriendInfo];
  /** One of the players is your friend. */
  friend: boolean;
  spectators: number;
  turn: number;
  startedAt: number;
}

export interface RatingPoint { t: number; r: number }

export interface ProfileInfo {
  user: PublicUser;
  memberSince: number;
  ratingHistory: RatingPoint[];
  streak: { current: number; best: number };
  games: number;
  relation?: Relation;
  presence?: Presence;
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
  | { t: 'ping'; at: number }
  | { t: 'challenge'; userId: string }
  | { t: 'challengeReply'; id: string; accept: boolean }
  | { t: 'live'; on: boolean };

export type ServerMsg =
  | { t: 'welcome'; user: PublicUser; activeRoom: string | null }
  | { t: 'queued'; rated: boolean }
  | { t: 'queueCancelled' }
  | { t: 'roomCreated'; code: string; invitee?: FriendInfo }
  | { t: 'room'; snap: RoomSnapshot }
  | { t: 'chat'; msg: ChatMessage }
  | { t: 'chatHistory'; msgs: ChatMessage[] }
  | { t: 'actionRejected'; message: string }
  | { t: 'error'; code: string; message: string }
  | { t: 'left' }
  | { t: 'pong'; at: number; serverNow: number }
  | { t: 'presence'; userId: string; presence: Presence }
  | { t: 'social'; event: SocialEvent; user: FriendInfo }
  | { t: 'challenge'; challenge: ChallengeInfo }
  | { t: 'challengeUpdate'; id: string; status: 'accepted' | 'declined' | 'cancelled' | 'expired'; by: string }
  | { t: 'liveGames'; games: LiveGame[] };

/** Normalise an invite code typed or pasted by a user (accepts full links too). */
export function normalizeCode(input: string): string {
  const m = input.match(/[?&](?:join|watch)=([A-Za-z0-9]+)/);
  return (m ? m[1] : input).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
}
