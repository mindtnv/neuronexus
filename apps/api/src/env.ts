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
  // ── AI / RAG (all OPTIONAL — degrade, never crash) ─────────────────────────
  // Two independent feature switches derived below. The whole block is optional:
  // absence must NOT crash the API or break existing tests (do NOT use
  // `required()` here). Secrets are server-only — never expose as NEXT_PUBLIC_*.
  ai: {
    // Embeddings (indexing side).
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    EMBEDDING_MODEL: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
    // Baked into the kb_chunk.embedding column dimension via the migration —
    // must match the embedding model. Changing it requires the reindex-on-
    // model-change runbook (see CLAUDE.md → AI / RAG).
    EMBEDDING_DIM: Number(process.env.EMBEDDING_DIM ?? 1536),
    // Chat (retrieval-grounded completion side). OpenAI-compatible base URL.
    CHAT_BASE_URL: process.env.CHAT_BASE_URL ?? 'https://api.openai.com/v1',
    CHAT_MODEL: process.env.CHAT_MODEL ?? 'gpt-4o-mini',
    CHAT_API_KEY: process.env.CHAT_API_KEY,
    // Lets ops pause indexing independently of chat (default on).
    INDEXING_ENABLED: process.env.INDEXING_ENABLED ?? 'true',
  },
};

// ── Derived AI feature flags (decoupled) ─────────────────────────────────────
// `embeddingEnabled` gates the index queue + write-hooks; `chatEnabled` gates
// the SSE stream endpoint. They are INDEPENDENT so indexing can be paused
// without breaking thread reads, and chat works (degraded retrieval) even when
// indexing is off, and vice-versa. `GET /ai/status` reports both.
export const embeddingEnabled =
  Boolean(env.ai.OPENAI_API_KEY) && env.ai.INDEXING_ENABLED !== 'false';
export const chatEnabled = Boolean(env.ai.CHAT_API_KEY);
