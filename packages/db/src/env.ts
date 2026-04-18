export function getDatabaseUrl(): string {
  // In `bun test`, Bun sets NODE_ENV=test automatically. Prefer the test URL
  // so integration tests can't accidentally wipe the dev database.
  if (process.env.NODE_ENV === 'test') {
    const testUrl = process.env.TEST_DATABASE_URL;
    if (!testUrl) {
      throw new Error(
        'NODE_ENV=test but TEST_DATABASE_URL is not set — add it to your .env',
      );
    }
    return testUrl;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  return url;
}
