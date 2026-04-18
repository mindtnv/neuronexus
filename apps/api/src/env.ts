function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

export const env = {
  PORT: Number(process.env.API_PORT ?? 3000),
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? 'http://localhost:3001',
  DATABASE_URL: required('DATABASE_URL'),
  BETTER_AUTH_URL: required('BETTER_AUTH_URL'),
  BETTER_AUTH_SECRET: required('BETTER_AUTH_SECRET'),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
};
