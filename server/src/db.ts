/**
 * Typed persistence with Kysely. SQLite (better-sqlite3) for local dev/tests,
 * Postgres (pg) in production — the schema only uses portable column types.
 */
import { Kysely, SqliteDialect, PostgresDialect, sql } from 'kysely';
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface UsersTable {
  id: string;
  name: string;
  email: string | null;
  password_hash: string | null;
  is_guest: number;
  rating: number;
  rated_games: number;
  wins: number;
  losses: number;
  draws: number;
  created_at: string;
  /** Profile avatar symbol (src/net/protocol.ts AVATARS) or null for the initial. */
  avatar: string | null;
  /** 1 once the account is deleted: anonymised, can't sign in, hidden from search. */
  deleted: number;
}

/**
 * One row per pair of users (user_a < user_b). `pending` until the other side accepts;
 * `requested_by` is who sent the request.
 */
export interface FriendshipsTable {
  user_a: string;
  user_b: string;
  status: 'pending' | 'accepted';
  requested_by: string;
  created_at: string;
  updated_at: string;
}

export interface GamesTable {
  id: string;
  code: string;
  rated: number;
  status: 'active' | 'finished';
  player0_id: string;
  player1_id: string;
  player0_color: 'w' | 'b';
  seed: number;
  /** Winning seat (0/1), or null for a draw / unfinished. */
  winner: number | null;
  reason: string | null;
  rating0_before: number | null;
  rating0_after: number | null;
  rating1_before: number | null;
  rating1_after: number | null;
  /** JSON: full action log with server timestamps + turn history, for replay/review. */
  log: string | null;
  created_at: string;
  ended_at: string | null;
}

/** Learning-path progress for signed-in accounts (JSON from src/learn/progress.ts). */
export interface LearnTable {
  user_id: string;
  data: string;
  updated_at: string;
}

/** Cached review-bot analysis of a finished online game (src/engine/review.ts). */
export interface ReviewsTable {
  game_id: string;
  version: number;
  data: string;
  created_at: string;
}

export interface Database {
  users: UsersTable;
  games: GamesTable;
  learn_progress: LearnTable;
  game_reviews: ReviewsTable;
  friendships: FriendshipsTable;
}

const migrations: Record<string, Migration> = {
  '001_init': {
    async up(db: Kysely<any>) {
      await db.schema.createTable('users')
        .addColumn('id', 'varchar(36)', (c) => c.primaryKey())
        .addColumn('name', 'varchar(32)', (c) => c.notNull())
        .addColumn('email', 'varchar(254)', (c) => c.unique())
        .addColumn('password_hash', 'varchar(100)')
        .addColumn('is_guest', 'integer', (c) => c.notNull().defaultTo(1))
        .addColumn('rating', 'integer', (c) => c.notNull().defaultTo(1200))
        .addColumn('rated_games', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('wins', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('losses', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('draws', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('created_at', 'varchar(32)', (c) => c.notNull())
        .execute();
      await db.schema.createIndex('users_rating_idx').on('users').column('rating').execute();
      await db.schema.createTable('games')
        .addColumn('id', 'varchar(36)', (c) => c.primaryKey())
        .addColumn('code', 'varchar(12)', (c) => c.notNull())
        .addColumn('rated', 'integer', (c) => c.notNull())
        .addColumn('status', 'varchar(16)', (c) => c.notNull())
        .addColumn('player0_id', 'varchar(36)', (c) => c.notNull().references('users.id'))
        .addColumn('player1_id', 'varchar(36)', (c) => c.notNull().references('users.id'))
        .addColumn('player0_color', 'varchar(1)', (c) => c.notNull())
        .addColumn('seed', 'bigint', (c) => c.notNull())
        .addColumn('winner', 'integer')
        .addColumn('reason', 'varchar(32)')
        .addColumn('rating0_before', 'integer')
        .addColumn('rating0_after', 'integer')
        .addColumn('rating1_before', 'integer')
        .addColumn('rating1_after', 'integer')
        .addColumn('log', 'text')
        .addColumn('created_at', 'varchar(32)', (c) => c.notNull())
        .addColumn('ended_at', 'varchar(32)')
        .execute();
      await db.schema.createIndex('games_p0_idx').on('games').column('player0_id').execute();
      await db.schema.createIndex('games_p1_idx').on('games').column('player1_id').execute();
    },
  },
  '002_learn': {
    async up(db: Kysely<any>) {
      await db.schema.createTable('learn_progress')
        .addColumn('user_id', 'varchar(36)', (c) => c.primaryKey().references('users.id'))
        .addColumn('data', 'text', (c) => c.notNull())
        .addColumn('updated_at', 'varchar(32)', (c) => c.notNull())
        .execute();
    },
  },
  '003_reviews': {
    async up(db: Kysely<any>) {
      await db.schema.createTable('game_reviews')
        .addColumn('game_id', 'varchar(36)', (c) => c.primaryKey().references('games.id'))
        .addColumn('version', 'integer', (c) => c.notNull())
        .addColumn('data', 'text', (c) => c.notNull())
        .addColumn('created_at', 'varchar(32)', (c) => c.notNull())
        .execute();
      await db.schema.createIndex('games_ended_idx').on('games').column('ended_at').execute();
    },
  },
  '004_social': {
    async up(db: Kysely<any>) {
      await db.schema.alterTable('users').addColumn('avatar', 'varchar(16)').execute();
      await db.schema.alterTable('users').addColumn('deleted', 'integer', (c) => c.notNull().defaultTo(0)).execute();
      await db.schema.createIndex('users_name_idx').on('users').column('name').execute();
      await db.schema.createTable('friendships')
        .addColumn('user_a', 'varchar(36)', (c) => c.notNull().references('users.id'))
        .addColumn('user_b', 'varchar(36)', (c) => c.notNull().references('users.id'))
        .addColumn('status', 'varchar(16)', (c) => c.notNull())
        .addColumn('requested_by', 'varchar(36)', (c) => c.notNull())
        .addColumn('created_at', 'varchar(32)', (c) => c.notNull())
        .addColumn('updated_at', 'varchar(32)', (c) => c.notNull())
        .addPrimaryKeyConstraint('friendships_pk', ['user_a', 'user_b'])
        .execute();
      await db.schema.createIndex('friendships_b_idx').on('friendships').column('user_b').execute();
    },
  },
};

class StaticProvider implements MigrationProvider {
  async getMigrations() { return migrations; }
}

export async function createDb(url: string): Promise<Kysely<Database>> {
  let db: Kysely<Database>;
  if (/^postgres(ql)?:\/\//.test(url)) {
    const pg = await import('pg');
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new pg.default.Pool({ connectionString: url }) }) });
  } else {
    const Sqlite = (await import('better-sqlite3')).default;
    const path = url.replace(/^sqlite:/, '');
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    const conn = new Sqlite(path);
    conn.pragma('journal_mode = WAL');
    conn.pragma('foreign_keys = ON');
    db = new Kysely<Database>({ dialect: new SqliteDialect({ database: conn }) });
  }
  const { error } = await new Migrator({ db, provider: new StaticProvider() }).migrateToLatest();
  if (error) throw error;
  await sql`select 1`.execute(db);
  return db;
}
