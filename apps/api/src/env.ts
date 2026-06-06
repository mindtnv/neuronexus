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
  // ── Media storage (M2) — S3-compatible (MinIO local / R2-S3 prod) ──────────
  S3_ENDPOINT: required('S3_ENDPOINT'),
  S3_REGION: process.env.S3_REGION ?? 'us-east-1',
  S3_BUCKET: required('S3_BUCKET'),
  S3_ACCESS_KEY_ID: required('S3_ACCESS_KEY_ID'),
  S3_SECRET_ACCESS_KEY: required('S3_SECRET_ACCESS_KEY'),
  // Public read base for serving objects: `${S3_PUBLIC_BASE_URL}/${key}`.
  S3_PUBLIC_BASE_URL: required('S3_PUBLIC_BASE_URL'),
  // MinIO needs path-style addressing; real S3/R2 use virtual-hosted by default.
  S3_FORCE_PATH_STYLE: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
  // Hard upload ceiling (bytes). Default 5 MiB.
  MAX_MEDIA_BYTES: Number(process.env.MAX_MEDIA_BYTES ?? 5 * 1024 * 1024),
};
