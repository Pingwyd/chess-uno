/**
 * Friends, user search and profiles (DB side). Live presence and notifications are pushed by
 * the Hub (src/hub.ts); this module only reads and writes the `friendships` table.
 */
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database, UsersTable } from './db';
import { AuthError, NAME_RE, toPublicUser } from './auth';
import { START_RATING } from './rating';
import { isAvatar, type FriendInfo, type FriendsList, type ProfileInfo, type RatingPoint, type Relation, type UserSearchHit } from '../../src/net/protocol';

export const MAX_FRIENDS = 200;
const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);
const nowIso = () => new Date().toISOString();
const ms = (iso: string | null) => (iso ? new Date(iso as never).getTime() : 0);

export const friendInfo = (u: UsersTable): FriendInfo => ({
  id: u.id, name: u.name, avatar: u.avatar ?? null, rating: u.rating, ratedGames: u.rated_games,
});

/** Social features need a real account (guests are prompted to sign up). */
export function requireAccount(user: UsersTable | null): UsersTable {
  if (!user) throw new AuthError(401, 'Not signed in');
  if (user.is_guest) throw new AuthError(403, 'Create a free account to add friends');
  return user;
}

export class Social {
  constructor(private db: Kysely<Database>) {}

  private row(a: string, b: string) {
    const [x, y] = pair(a, b);
    return this.db.selectFrom('friendships').selectAll().where('user_a', '=', x).where('user_b', '=', y).executeTakeFirst();
  }

  async relation(me: string, other: string): Promise<Relation> {
    if (me === other) return 'self';
    const r = await this.row(me, other);
    if (!r) return 'none';
    if (r.status === 'accepted') return 'friends';
    return r.requested_by === me ? 'outgoing' : 'incoming';
  }

  async friendIds(userId: string): Promise<string[]> {
    const rows = await this.db.selectFrom('friendships').select(['user_a', 'user_b']).where('status', '=', 'accepted')
      .where((eb) => eb.or([eb('user_a', '=', userId), eb('user_b', '=', userId)])).execute();
    return rows.map((r) => (r.user_a === userId ? r.user_b : r.user_a));
  }

  async list(userId: string): Promise<FriendsList> {
    const rows = await this.db.selectFrom('friendships').selectAll()
      .where((eb) => eb.or([eb('user_a', '=', userId), eb('user_b', '=', userId)])).execute();
    const ids = rows.map((r) => (r.user_a === userId ? r.user_b : r.user_a));
    const users = ids.length ? await this.db.selectFrom('users').selectAll().where('id', 'in', ids).where('deleted', '=', 0).execute() : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const out: FriendsList = { friends: [], incoming: [], outgoing: [] };
    for (const r of rows) {
      const u = byId.get(r.user_a === userId ? r.user_b : r.user_a);
      if (!u) continue;
      const info = friendInfo(u);
      if (r.status === 'accepted') out.friends.push(info);
      else if (r.requested_by === userId) out.outgoing.push(info);
      else out.incoming.push(info);
    }
    for (const l of [out.friends, out.incoming, out.outgoing]) l.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  /** Case-insensitive name search over accounts (guests and deleted accounts are never listed). */
  async search(me: UsersTable, q: string): Promise<UserSearchHit[]> {
    const term = String(q ?? '').trim().slice(0, 20);
    if (term.length < 2) return [];
    const like = `%${term.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const users = await this.db.selectFrom('users').selectAll()
      .where('is_guest', '=', 0).where('deleted', '=', 0).where('id', '!=', me.id)
      .where(sql<boolean>`lower(name) like ${like} escape '\\'`)
      .orderBy('rating', 'desc').limit(20).execute();
    const rels = await Promise.all(users.map((u) => this.relation(me.id, u.id)));
    return users.map((u, i) => ({ ...friendInfo(u), relation: rels[i] }));
  }

  private async target(id: unknown): Promise<UsersTable> {
    const u = typeof id === 'string' ? await this.db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst() : undefined;
    if (!u || u.deleted) throw new AuthError(404, 'Player not found');
    return u;
  }

  /** Send a request. If they already asked you, this accepts it. Returns the resulting relation. */
  async request(me: UsersTable, otherId: unknown): Promise<{ other: UsersTable; relation: Relation }> {
    const other = await this.target(otherId);
    if (other.id === me.id) throw new AuthError(400, 'You can’t add yourself');
    if (other.is_guest) throw new AuthError(400, 'Guests can’t receive friend requests');
    const existing = await this.row(me.id, other.id);
    if (existing?.status === 'accepted') return { other, relation: 'friends' };
    if (existing && existing.requested_by === me.id) return { other, relation: 'outgoing' };
    const [a, b] = pair(me.id, other.id);
    if (existing) {
      await this.db.updateTable('friendships').set({ status: 'accepted', updated_at: nowIso() }).where('user_a', '=', a).where('user_b', '=', b).execute();
      return { other, relation: 'friends' };
    }
    const mine = await this.db.selectFrom('friendships').select((eb) => eb.fn.countAll<number>().as('n'))
      .where((eb) => eb.or([eb('user_a', '=', me.id), eb('user_b', '=', me.id)])).executeTakeFirst();
    if (Number(mine?.n ?? 0) >= MAX_FRIENDS) throw new AuthError(400, `Friend list is full (${MAX_FRIENDS})`);
    await this.db.insertInto('friendships').values({ user_a: a, user_b: b, status: 'pending', requested_by: me.id, created_at: nowIso(), updated_at: nowIso() }).execute();
    return { other, relation: 'outgoing' };
  }

  async accept(me: UsersTable, otherId: unknown): Promise<UsersTable> {
    const other = await this.target(otherId);
    const r = await this.row(me.id, other.id);
    if (!r || r.status !== 'pending' || r.requested_by !== other.id) throw new AuthError(404, 'No request from that player');
    await this.db.updateTable('friendships').set({ status: 'accepted', updated_at: nowIso() }).where('user_a', '=', r.user_a).where('user_b', '=', r.user_b).execute();
    return other;
  }

  /** decline (their request), cancel (your request) or remove (a friend). */
  async drop(me: UsersTable, otherId: unknown, kind: 'decline' | 'cancel' | 'remove'): Promise<UsersTable> {
    const other = await this.target(otherId);
    const r = await this.row(me.id, other.id);
    const ok = r && (kind === 'remove' ? r.status === 'accepted'
      : kind === 'decline' ? r.status === 'pending' && r.requested_by === other.id
        : r.status === 'pending' && r.requested_by === me.id);
    if (!ok) throw new AuthError(404, kind === 'remove' ? 'Not on your friends list' : 'No such request');
    await this.db.deleteFrom('friendships').where('user_a', '=', r!.user_a).where('user_b', '=', r!.user_b).execute();
    return other;
  }

  // ------------------------------------------------------------ profiles

  async updateProfile(me: UsersTable, body: Record<string, unknown>): Promise<UsersTable> {
    const patch: Partial<UsersTable> = {};
    if ('name' in body) {
      if (me.is_guest) throw new AuthError(403, 'Create an account to choose a name');
      const name = String(body.name ?? '').trim();
      if (!NAME_RE.test(name)) throw new AuthError(400, 'Name must be 3–20 letters, numbers, spaces, _ or -');
      patch.name = name;
    }
    if ('avatar' in body) {
      if (body.avatar !== null && !isAvatar(body.avatar)) throw new AuthError(400, 'Unknown avatar');
      patch.avatar = (body.avatar as string | null) ?? null;
    }
    if (!Object.keys(patch).length) return me;
    await this.db.updateTable('users').set(patch).where('id', '=', me.id).execute();
    return { ...me, ...patch };
  }

  async profile(userId: string): Promise<ProfileInfo | null> {
    const u = await this.db.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirst();
    if (!u || u.deleted) return null;
    const games = await this.db.selectFrom('games')
      .select(['player0_id', 'winner', 'rated', 'rating0_before', 'rating0_after', 'rating1_before', 'rating1_after', 'ended_at'])
      .where('status', '=', 'finished')
      .where((eb) => eb.or([eb('player0_id', '=', userId), eb('player1_id', '=', userId)]))
      .orderBy('ended_at', 'asc').execute();
    const history: RatingPoint[] = [];
    let cur = 0, best = 0;
    for (const g of games) {
      const seat = g.player0_id === userId ? 0 : 1;
      if (g.rated) {
        const before = seat === 0 ? g.rating0_before : g.rating1_before;
        const after = seat === 0 ? g.rating0_after : g.rating1_after;
        if (!history.length) history.push({ t: ms(g.ended_at) - 1, r: before ?? START_RATING });
        if (after != null) history.push({ t: ms(g.ended_at), r: after });
      }
      cur = g.winner === seat ? cur + 1 : 0;
      best = Math.max(best, cur);
    }
    return {
      user: { ...toPublicUser(u), email: undefined },
      memberSince: ms(u.created_at),
      ratingHistory: history.slice(-120),
      streak: { current: cur, best },
      games: games.length,
    };
  }
}
