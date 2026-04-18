import { defineConfig } from 'drizzle-kit';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// drizzle-kit spawns a Node subprocess and doesn't inherit Bun's auto-loaded
// env. Walk up from packages/db and load the root .env manually.
function loadRootEnv() {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      const content = readFileSync(candidate, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
      return;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
}
loadRootEnv();

const DATABASE_URL =
  process.env.NODE_ENV === 'test'
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    process.env.NODE_ENV === 'test'
      ? 'TEST_DATABASE_URL is not set — add it to .env'
      : 'DATABASE_URL is not set — copy .env.example to .env in repo root',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './src/migrations',
  dbCredentials: { url: DATABASE_URL },
  strict: true,
  verbose: true,
});
