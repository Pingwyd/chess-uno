/**
 * Wire protocol shared by the browser client and the authoritative game server.
 * Messages are JSON over a single WebSocket per client.
 */
import type { GameAction, GameState, PlayerId } from '../rules/game';
import type { TimeControl } from '../rules/timeControl';

/** Quick emotes: id → label. The client draws each with a Lucide icon (no emoji). Old ids stay valid. */
export const EMOTES = {
  gg: 'GG',
  clap: 'Nice move',
  wow: 'Wow',
  lol: 'Haha',
  fire: 'On fire',
  oops: 'Oops',
  respect: 'Respect',
  niceReverse: 'Nice Reverse!',
} as const;
export type EmoteId = keyof typeof EMOTES;

export const CHAT_MAX_LENGTH = 200;

/** How long a friend challenge stays open before it expires (server default; `CHALLENGE_TTL_MS` env overrides). */
export const CHALLENGE_TTL_MS = 5 * 60_000;

/** Profile avatars: a Lucide icon name from this list, or null for the name's initial. */
export const AVATARS = ['knight', 'queen', 'rook', 'bishop', 'king', 'pawn', 'spade', 'flame', 'waves', 'zap', 'moon', 'star', 'cat', 'gem', 'bird', 'crown'] as const;
export type AvatarId = (typeof AVATARS)[number];
export const isAvatar = (v: unknown): v is AvatarId => typeof v === 'string' && (AVATARS as readonly string[]).includes(v);
/** Avatars saved before the switch to icons were emoji/chess symbols; map them to the new ids. */
const LEGACY_AVATARS: Record<string, AvatarId> = {
  '\u265E': 'knight', '\u265B': 'queen', '\u265C': 'rook', '\u265D': 'bishop', '\u265A': 'king', '\u265F': 'pawn',
  '\u{1F0CF}': 'spade', '\u{1F525}': 'flame', '\u{1F30A}': 'waves', '\u26A1': 'zap', '\u{1F319}': 'moon', '\u2B50': 'star',
  '\u{1F98A}': 'cat', '\u{1F409}': 'gem', '\u{1F989}': 'bird', '\u{1F451}': 'crown',
};
export const normalizeAvatar = (v: unknown): AvatarId | null => (isAvatar(v) ? v : typeof v === 'string' ? LEGACY_AVATARS[v] ?? null : null);

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
  /** Clock for the game (absent from old servers = rapid). */
  tc?: TimeControl;
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
  tc?: TimeControl;
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
  tc?: TimeControl;
  /** Open rematch offer after the game (seat that offered), or null. */
  rematchBy?: PlayerId | null;
}

export type ClientMsg =
  | { t: 'hello'; token: string }
  | { t: 'queue'; tc?: TimeControl }
  | { t: 'cancelQueue' }
  | { t: 'createRoom'; tc?: TimeControl }
  | { t: 'joinRoom'; code: string }
  | { t: 'spectate'; code: string }
  | { t: 'action'; action: GameAction }
  | { t: 'chat'; text?: string; emote?: EmoteId }
  | { t: 'leave' }
  | { t: 'ping'; at: number }
  | { t: 'challenge'; userId: string; tc?: TimeControl }
  /** Offer a rematch after a finished game (or accept the opponent's offer). Colours swap. */
  | { t: 'rematch'; code: string }
  /** Decline the opponent's offer, or withdraw your own. */
  | { t: 'rematchDecline'; code: string }
  | { t: 'challengeReply'; id: string; accept: boolean }
  | { t: 'live'; on: boolean };

export type ServerMsg =
  | { t: 'welcome'; user: PublicUser; activeRoom: string | null }
  | { t: 'queued'; rated: boolean; tc?: TimeControl }
  | { t: 'queueCancelled' }
  | { t: 'roomCreated'; code: string; invitee?: FriendInfo; tc?: TimeControl }
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
  | { t: 'liveGames'; games: LiveGame[] }
  | { t: 'rematch'; code: string; status: 'offered' | 'declined' | 'cancelled'; by: PlayerId };

/** Normalise an invite code typed or pasted by a user (accepts full links too). */
export function normalizeCode(input: string): string {
  const m = input.match(/[?&](?:join|watch)=([A-Za-z0-9]+)/);
  return (m ? m[1] : input).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
}
