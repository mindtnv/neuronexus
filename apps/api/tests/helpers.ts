// Shared helpers for Elysia integration tests.
//
//   * `resetTestDb()` wipes every domain + auth table between tests, keeping
//     the schema intact. Cheap — a single TRUNCATE over the known set.
//   * `callApp(app, req)` wraps `app.handle(req)` with JSON body serialization
//     and convenient cookie extraction for session-based tests.
//   * `signUpAndCookie(app, email)` registers a fresh user and returns a
//     Cookie header that subsequent requests can pass through.
//
// Safety: `resetTestDb` refuses to run unless the connection string points at
// a database whose name contains "test". The `NODE_ENV=test` branch in
// packages/db/src/env.ts already enforces this at DB-client construction.

import { db } from '@neuronexus/db/client';
import { sql } from 'drizzle-orm';

const TABLES = [
  'reviews',
  'cards',
  'decks',
  'profile',
  'account',
  'session',
  'verification',
  '"user"', // `user` is a reserved word in Postgres and must be quoted
];

export async function resetTestDb() {
  const url = process.env.TEST_DATABASE_URL ?? '';
  if (!/test/.test(url)) {
    throw new Error(`Refusing to reset DB — TEST_DATABASE_URL must contain "test" (got: ${url})`);
  }
  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`));
}

export type Call = {
  status: number;
  headers: Record<string, string>;
  setCookies: string[];
  json: <T = unknown>() => Promise<T>;
  text: () => Promise<string>;
};

/**
 * Invoke an Elysia app in-process and normalize the Response into a handy
 * envelope. `body` can be a plain object (auto-serialized to JSON) or a
 * string; pass `cookie` to attach a session cookie.
 */
export async function callApp(
  app: { handle: (req: Request) => Promise<Response> },
  method: string,
  path: string,
  opts: {
    body?: unknown;
    cookie?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<Call> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(opts.cookie ? { cookie: opts.cookie } : {}),
    ...(opts.headers ?? {}),
  };
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const res = await app.handle(req);
  const flatHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    if (flatHeaders[k]) flatHeaders[k] += `, ${v}`;
    else flatHeaders[k] = v;
  });
  // Bun's Headers#getSetCookie works; some older runtimes don't — fall back
  // to the comma-joined set-cookie string.
  const setCookies =
    typeof (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (res.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : (flatHeaders['set-cookie'] ? [flatHeaders['set-cookie']] : []);
  return {
    status: res.status,
    headers: flatHeaders,
    setCookies,
    json: <T,>() => res.clone().json() as Promise<T>,
    text: () => res.clone().text(),
  };
}

/** Pull the bare `name=value` pairs out of Set-Cookie strings for re-sending. */
export function extractCookie(setCookies: string[]): string {
  return setCookies
    .map((c) => c.split(';')[0]?.trim())
    .filter((x): x is string => Boolean(x))
    .join('; ');
}

export async function signUpAndCookie(
  app: { handle: (req: Request) => Promise<Response> },
  email: string,
  password = 'testtest123',
  name = 'Tester',
): Promise<{ cookie: string; userId: string }> {
  const res = await callApp(app, 'POST', '/api/auth/sign-up/email', {
    body: { email, password, name },
  });
  if (res.status !== 200) {
    throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json<{ user: { id: string } }>();
  const cookie = extractCookie(res.setCookies);
  if (!cookie) throw new Error('sign-up returned no Set-Cookie');
  return { cookie, userId: data.user.id };
}

export function uniqueEmail(prefix = 't'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.dev`;
}
