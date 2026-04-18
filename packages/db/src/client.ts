import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema/index.ts';
import { getDatabaseUrl } from './env.ts';

// Keep one pool per process. With `bun --watch` the module is fully reloaded
// on file change, so a singleton here is fine — no HMR state leaks.
const client = postgres(getDatabaseUrl(), {
  max: 10,
  // postgres.js treats timestamptz columns as `Date` — consistent with Drizzle.
});

export const db = drizzle(client, { schema });
export type Db = typeof db;
export { schema };

/** Run a trivial round-trip to prove the DB is reachable. Used by /health. */
export async function dbPing(): Promise<{ ok: true; latencyMs: number }> {
  const started = performance.now();
  await db.execute(sql`select 1`);
  return { ok: true, latencyMs: Math.round(performance.now() - started) };
}

/** Graceful close of the underlying pool. Called from the api SIGTERM handler. */
export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}
