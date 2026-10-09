import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { randomInt, randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database, UsersTable } from './db';
import type { PublicUser } from '../../src/net/protocol';
import { START_RATING } from './rating';

const ADJ = ['Swift', 'Arcane', 'Golden', 'Tidal', 'Bold', 'Clever', 'Lucky', 'Silent', 'Ember', 'Royal', 'Mystic', 'Brave'];
const NOUN = ['Knight', 'Bishop', 'Rook', 'Pawn', 'Queen', 'King', 'Gambit', 'Castle', 'Reverse', 'Skip'];

export function guestName(): string {
  return `${ADJ[randomInt(ADJ.length)]}${NOUN[randomInt(NOUN.length)]}${randomInt(100, 1000)}`;
}

export const toPublicUser = (u: UsersTable): PublicUser => ({
  id: u.id,
  name: u.name,
  guest: !!u.is_guest,
  email: u.email,
  rating: u.rating,
  ratedGames: u.rated_games,
  wins: u.wins,
  losses: u.losses,
  draws: u.draws,
});

export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const NAME_RE = /^[A-Za-z0-9 _-]{3,20}$/;

export class Auth {
  private key: Uint8Array;
  constructor(private db: Kysely<Database>, secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  async sign(userId: string): Promise<string> {
    return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime('30d').sign(this.key);
  }

  async verify(token: string | undefined | null): Promise<UsersTable | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      if (!payload.sub) return null;
      return (await this.db.selectFrom('users').selectAll().where('id', '=', payload.sub).executeTakeFirst()) ?? null;
    } catch {
      return null;
    }
  }

  async createGuest(): Promise<UsersTable> {
    const user: UsersTable = {
      id: randomUUID(), name: guestName(), email: null, password_hash: null, is_guest: 1,
      rating: START_RATING, rated_games: 0, wins: 0, losses: 0, draws: 0, created_at: new Date().toISOString(),
    };
    await this.db.insertInto('users').values(user).execute();
    return user;
  }

  /** Register. If `upgrade` is a guest, it becomes the account (keeps stats and history). */
  async signup(emailRaw: string, password: string, nameRaw: string | undefined, upgrade: UsersTable | null): Promise<UsersTable> {
    const email = String(emailRaw ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new AuthError(400, 'Please enter a valid email');
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new AuthError(400, 'Password must be 8–128 characters');
    const name = (nameRaw ?? '').trim() || upgrade?.name || guestName();
    if (!NAME_RE.test(name)) throw new AuthError(400, 'Name must be 3–20 letters, numbers, spaces, _ or -');
    const existing = await this.db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst();
    if (existing) throw new AuthError(409, 'That email is already registered');
    const password_hash = await bcrypt.hash(password, 10);
    if (upgrade && upgrade.is_guest) {
      await this.db.updateTable('users').set({ email, password_hash, name, is_guest: 0 }).where('id', '=', upgrade.id).execute();
      return { ...upgrade, email, password_hash, name, is_guest: 0 };
    }
    const user: UsersTable = {
      id: randomUUID(), name, email, password_hash, is_guest: 0,
      rating: START_RATING, rated_games: 0, wins: 0, losses: 0, draws: 0, created_at: new Date().toISOString(),
    };
    await this.db.insertInto('users').values(user).execute();
    return user;
  }

  async login(emailRaw: string, password: string): Promise<UsersTable> {
    const email = String(emailRaw ?? '').trim().toLowerCase();
    const user = await this.db.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst();
    // Always run bcrypt to keep timing similar for unknown emails.
    const ok = await bcrypt.compare(String(password ?? ''), user?.password_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    if (!user || !ok) throw new AuthError(401, 'Wrong email or password');
    return user;
  }
}
