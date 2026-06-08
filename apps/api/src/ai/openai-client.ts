// OpenAI(-compatible) client — thin `fetch` wrapper (Decision 3, plan §46-52).
//
// Two surfaces:
//   * `embed(texts)`     → POST /v1/embeddings (OPENAI_API_KEY, EMBEDDING_MODEL).
//                          Batched by the caller; retry/backoff on 429/5xx;
//                          usage logged. Throws `AiDisabledError` when
//                          `!embeddingEnabled`.
//   * `chatStream(...)`  → POST /v1/chat/completions with `stream:true`, reads
//                          the SSE `data:` lines, yields token deltas (Slice 4).
//                          Throws `AiDisabledError` when `!chatEnabled`.
//
// Test seam (plan §257-259, CRITICAL): the two surfaces are read indirectly
// through a swappable client so tests can inject a deterministic fake WITHOUT
// real API keys. `__setAiClientForTests(fake)` overrides `embed`/`chatStream`
// AND flips the effective enabled-flags for the injected path, so the index
// queue / retrieve / chat all operate under tests with no env configured.
// Mirrors how the suite pins `now`/fuzz today.

import type { Logger } from 'pino';
import { env, embeddingEnabled, chatEnabled } from '../env.ts';
import { rootLogger } from '../logger.ts';

/** Thrown when an AI surface is invoked while its feature flag is off. */
export class AiDisabledError extends Error {
  constructor(public readonly surface: 'embedding' | 'chat') {
    super(`ai_disabled:${surface}`);
    this.name = 'AiDisabledError';
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatStreamOpts {
  /** Overrides env.ai.CHAT_MODEL when set. */
  model?: string;
  /** Optional per-request child logger for usage lines. */
  log?: Logger;
}

/** The injectable surface. A fake (tests) provides either/both members. */
export interface AiClient {
  embed?: (texts: string[]) => Promise<number[][]>;
  chatStream?: (messages: ChatMessage[], opts?: ChatStreamOpts) => AsyncIterable<string>;
}

// ── Test-seam state ──────────────────────────────────────────────────────────
// When a fake is injected, the injected surface is treated as enabled REGARDLESS
// of env (so indexing/chat work in tests with no OPENAI_API_KEY). The real path
// still gates on the env-derived flags.

let injected: AiClient | null = null;

/**
 * Inject a deterministic fake client for tests. Pass `{ embed }` and/or
 * `{ chatStream }`. Call with `null` (or `__resetAiClientForTests`) to restore
 * the real `fetch`-backed client. Only intended for `NODE_ENV=test`.
 */
export function __setAiClientForTests(fake: AiClient | null): void {
  injected = fake;
}

export function __resetAiClientForTests(): void {
  injected = null;
}

/** Effective embedding switch: env flag OR an injected fake `embed`. */
export function isEmbeddingEnabled(): boolean {
  return embeddingEnabled || Boolean(injected?.embed);
}

/** Effective chat switch: env flag OR an injected fake `chatStream`. */
export function isChatEnabled(): boolean {
  return chatEnabled || Boolean(injected?.chatStream);
}

// ── Backoff helper ───────────────────────────────────────────────────────────

const MAX_RETRIES = 4;

function backoffMs(attempt: number): number {
  // 250ms, 500, 1000, 2000 (+ up to 250ms jitter). Bounded, never a hard stall.
  return Math.min(2000, 250 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

// ── Embeddings ───────────────────────────────────────────────────────────────

interface EmbeddingResponse {
  data: { embedding: number[]; index: number }[];
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

/**
 * Embed a batch of texts → one vector per input (same order). Retries on
 * 429/5xx with exponential backoff. Usage (count, tokens, latency) is logged.
 *
 * Throws `AiDisabledError('embedding')` when embeddings are not enabled and no
 * fake is injected. Empty input short-circuits to `[]` (no network call).
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (injected?.embed) return injected.embed(texts);
  if (!embeddingEnabled) throw new AiDisabledError('embedding');
  if (texts.length === 0) return [];

  const apiKey = env.ai.OPENAI_API_KEY!;
  const url = `${env.ai.CHAT_BASE_URL.replace(/\/$/, '')}/embeddings`;
  const log = rootLogger;
  const started = performance.now();

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: env.ai.EMBEDDING_MODEL, input: texts }),
      });
    } catch (err) {
      // Network error — retry with backoff.
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw err;
    }

    if (res.ok) {
      const json = (await res.json()) as EmbeddingResponse;
      // Sort by index defensively — the API returns in-order, but don't rely on it.
      const vectors = json.data
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
      log.info(
        {
          model: env.ai.EMBEDDING_MODEL,
          count: texts.length,
          tokens: json.usage?.total_tokens,
          latencyMs: Math.round(performance.now() - started),
        },
        'ai.embed',
      );
      return vectors;
    }

    if (isRetryable(res.status) && attempt < MAX_RETRIES) {
      log.warn({ status: res.status, attempt }, 'ai.embed.retry');
      await sleep(backoffMs(attempt));
      continue;
    }

    const detail = await res.text().catch(() => '');
    log.error({ status: res.status, detail }, 'ai.embed.failed');
    throw new Error(`embed_failed:${res.status}`);
  }
  throw lastErr instanceof Error ? lastErr : new Error('embed_failed');
}

// ── Chat completion (SSE stream) ──────────────────────────────────────────────

interface ChatChunk {
  choices?: { delta?: { content?: string } }[];
}

/**
 * Stream a chat completion as token deltas. Reads the OpenAI-compatible SSE
 * response (`data: {json}\n\n`, terminated by `data: [DONE]`) and yields each
 * `choices[0].delta.content` fragment as it arrives.
 *
 * Throws `AiDisabledError('chat')` when chat is not enabled and no fake is
 * injected. Errors after the first byte are the caller's concern (Slice 4 wraps
 * this in its own terminal `event: error` frame — see plan SHOULD-FIX #7).
 */
export async function* chatStream(
  messages: ChatMessage[],
  opts: ChatStreamOpts = {},
): AsyncIterable<string> {
  if (injected?.chatStream) {
    yield* injected.chatStream(messages, opts);
    return;
  }
  if (!chatEnabled) throw new AiDisabledError('chat');

  const apiKey = env.ai.CHAT_API_KEY!;
  const model = opts.model ?? env.ai.CHAT_MODEL;
  const url = `${env.ai.CHAT_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const log = opts.log ?? rootLogger;
  const started = performance.now();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    log.error({ status: res.status, detail }, 'ai.chat.failed');
    throw new Error(`chat_failed:${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  // Count of streamed SSE content deltas — NOT model tokens (no usage parsing in
  // streaming mode). Named `deltas` so the observability log isn't misleading.
  let deltas = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line. Process complete frames; keep
      // the trailing partial in the buffer.
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const rawLine of frame.split('\n')) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') {
            log.info(
              { model, deltas, latencyMs: Math.round(performance.now() - started) },
              'ai.chat',
            );
            return;
          }
          try {
            const chunk = JSON.parse(payload) as ChatChunk;
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              deltas += 1;
              yield delta;
            }
          } catch {
            // Skip a malformed/partial JSON line — the next read may complete it.
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  log.info(
    { model, deltas, latencyMs: Math.round(performance.now() - started) },
    'ai.chat',
  );
}
