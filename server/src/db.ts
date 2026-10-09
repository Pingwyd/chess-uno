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

export interface Database {
  users: UsersTable;
  games: GamesTable;
  learn_progress: LearnTable;
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
