// Programmatic migrator. Runs the committed SQL migrations under
// src/migrations/ against the current DATABASE_URL. Invoked from:
//   - CI  : `bun run db:migrate:apply`  (before tests / before deploy)
//   - Prod: Docker entrypoint / release task
//
// Dev loop still uses `drizzle-kit push --force` for speed, but the committed
// migrations are the source of truth for any long-lived environment.

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getDatabaseUrl } from './env.ts';

async function main() {
  const url = getDatabaseUrl();
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = resolve(here, 'migrations');

  // eslint-disable-next-line no-console
  console.log(`[db] applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  // eslint-disable-next-line no-console
  console.log('[db] migrations applied');

  await client.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[db] migration failed', err);
  process.exit(1);
});
