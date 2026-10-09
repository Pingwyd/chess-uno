export interface ServerConfig {
  port: number;
  /** `sqlite:<path>` / plain path / `:memory:` for SQLite, or `postgres://…` for Postgres. */
  databaseUrl: string;
  jwtSecret: string;
  /** Per-player clock (ms). 10 minutes in production. */
  clockMs: number;
  /** How long a disconnected player has to come back before forfeiting. */
  disconnectGraceMs: number;
  /** Comma-separated allowed CORS origins, or '*'. */
  corsOrigin: string;
  /** Matchmaking: base rating window and widening per second waited. */
  matchWindow: number;
  matchWidenPerSec: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const jwtSecret = env.JWT_SECRET ?? 'dev-insecure-secret-change-me';
  if (!env.JWT_SECRET && env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return {
    port: Number(env.PORT ?? 8787),
    databaseUrl: env.DATABASE_URL ?? 'sqlite:./data/chess-uno.db',
    jwtSecret,
    clockMs: Number(env.CLOCK_MS ?? 10 * 60 * 1000),
    disconnectGraceMs: Number(env.DISCONNECT_GRACE_MS ?? 60_000),
    corsOrigin: env.CORS_ORIGIN ?? '*',
    matchWindow: Number(env.MATCH_WINDOW ?? 100),
    matchWidenPerSec: Number(env.MATCH_WIDEN_PER_SEC ?? 25),
  };
}
