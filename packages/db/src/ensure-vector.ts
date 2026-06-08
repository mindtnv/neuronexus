// pgvector bootstrap. `CREATE EXTENSION vector` is PER-DATABASE and is NOT run
// by initdb or by `drizzle-kit push` — so the extension must be created before
// any `vector(N)` column is pushed/migrated. This helper opens its OWN
// short-lived connection (not the shared pool) so it can run as a standalone
// pre-script (`predb:push` / `predb:push:test`) before the schema is touched.
// Kept as defense-in-depth in the test bootstrap too.

import postgres from 'postgres';
import { getDatabaseUrl } from './env.ts';

/**
 * Ensure the pgvector `vector` extension exists on the target database.
 * Idempotent (`IF NOT EXISTS`). Defaults to the env-selected DB
 * (`getDatabaseUrl()` → TEST_DATABASE_URL when NODE_ENV=test, else
 * DATABASE_URL), but a `url` override lets callers target a specific DB.
 */
export async function ensureVectorExtension(url?: string): Promise<void> {
  const target = url ?? getDatabaseUrl();
  const client = postgres(target, { max: 1 });
  try {
    await client`CREATE EXTENSION IF NOT EXISTS vector`;
  } finally {
    await client.end({ timeout: 5 });
  }
}
