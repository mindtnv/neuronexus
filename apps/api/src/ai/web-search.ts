// Web search provider — the `web_search` tool's data source (S3).
//
// One provider today (Brave), behind a small interface so a second is a clean
// drop-in later (no WEB_SEARCH_PROVIDER selector env — YAGNI). The provider MAY
// throw (timeout / 429 / quota); the `web_search` TOOL catches it and returns
// `{ ok:false, error }` so nothing throws into the agent loop (preserves the SSE
// single-error invariant — see tools.ts).
//
// Hard timeout via AbortController (WEB_SEARCH_TIMEOUT_MS, default 7s) + at most
// ONE bounded retry (Brave free tier is ~1 rps), so a single call can't stall
// the stream beyond ~7s.

import type { Logger } from 'pino';
import { env, webSearchEnabled } from '../env.ts';
import { rootLogger } from '../logger.ts';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchOpts {
  /** Max results to return (provider may return fewer). */
  count?: number;
  /** External cancel signal — combined with the provider's own timeout. */
  signal?: AbortSignal;
  /** Optional per-request child logger. */
  log?: Logger;
}

export interface WebSearchProvider {
  search(query: string, opts?: WebSearchOpts): Promise<WebSearchResult[]>;
}

// ── Brave provider ────────────────────────────────────────────────────────────

/** Subset of the Brave Web Search API response we map from. */
interface BraveResponse {
  web?: {
    results?: { title?: string; url?: string; description?: string }[];
  };
}

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

export class BraveWebSearchProvider implements WebSearchProvider {
  constructor(private readonly apiKey: string) {}

  async search(query: string, opts: WebSearchOpts = {}): Promise<WebSearchResult[]> {
    const log = opts.log ?? rootLogger;
    const count = Math.max(1, Math.min(opts.count ?? 5, 20));
    const url = `${BRAVE_ENDPOINT}?q=${encodeURIComponent(query)}&count=${count}`;

    // At most one retry — Brave free tier is ~1 rps, so a tight loop would just
    // burn the timeout budget. Total wall time is bounded by the per-attempt
    // AbortController timeout (so worst case ≈ timeout + a short backoff).
    const MAX_ATTEMPTS = 2;
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), env.ai.WEB_SEARCH_TIMEOUT_MS);
      // Honor an external cancel signal too.
      const onExternalAbort = () => controller.abort();
      opts.signal?.addEventListener('abort', onExternalAbort, { once: true });
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            accept: 'application/json',
            'x-subscription-token': this.apiKey,
          },
          signal: controller.signal,
        });
        if (res.ok) {
          const json = (await res.json()) as BraveResponse;
          const results = json.web?.results ?? [];
          return results
            .filter((r) => r.url)
            .map((r) => ({
              title: r.title ?? '',
              url: r.url!,
              snippet: r.description ?? '',
            }));
        }
        // 429 / 5xx → one bounded retry; other 4xx → fail fast.
        const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
        const detail = await res.text().catch(() => '');
        log.warn({ status: res.status, detail, attempt }, 'ai.web_search.http_error');
        lastErr = new Error(`web_search_failed:${res.status}`);
        if (!retryable || attempt === MAX_ATTEMPTS - 1) throw lastErr;
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        lastErr = err;
        // Abort (timeout/external) or network error. Retry once on the first
        // attempt; otherwise propagate (the tool's execute() catches it).
        if (attempt === MAX_ATTEMPTS - 1) throw err;
        log.warn({ err, attempt }, 'ai.web_search.retry');
        await new Promise((r) => setTimeout(r, 500));
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onExternalAbort);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('web_search_failed');
  }
}

// ── Exa provider ──────────────────────────────────────────────────────────────
// Exa (exa.ai) neural/auto search — the second drop-in the interface was built
// for. Requested with short `contents.text` so each result carries a snippet
// (Exa returns no description otherwise). Preferred over Brave when both keys
// are set: semantic search suits "study this topic" research better.

/** Subset of the Exa /search response we map from. */
interface ExaSearchResponse {
  results?: { title?: string | null; url?: string; text?: string }[];
}

const EXA_SEARCH_ENDPOINT = 'https://api.exa.ai/search';

export class ExaWebSearchProvider implements WebSearchProvider {
  constructor(private readonly apiKey: string) {}

  async search(query: string, opts: WebSearchOpts = {}): Promise<WebSearchResult[]> {
    const count = Math.max(1, Math.min(opts.count ?? 5, 20));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.ai.WEB_SEARCH_TIMEOUT_MS);
    const onExternalAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onExternalAbort, { once: true });
    try {
      const res = await fetch(EXA_SEARCH_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey },
        body: JSON.stringify({
          query,
          type: 'auto',
          numResults: count,
          contents: { text: { maxCharacters: 300 } },
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`exa search HTTP ${res.status}`);
      const json = (await res.json()) as ExaSearchResponse;
      return (json.results ?? [])
        .filter((r) => r.url)
        .map((r) => ({
          title: (r.title ?? r.url ?? '').trim() || (r.url as string),
          url: r.url as string,
          snippet: (r.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300),
        }));
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onExternalAbort);
    }
  }
}

// ── Provider selection + test seam ────────────────────────────────────────────

let injectedProvider: WebSearchProvider | null = null;
let injectedProviderSet = false;

/**
 * Inject a fake provider for tests (mirrors the openai-client seam). Pass a
 * provider to flip `web_search` on regardless of env; pass `null` to force the
 * tool absent (a fake `null` is distinct from "not set"). Restore with
 * `__resetWebSearchProviderForTests`.
 */
export function __setWebSearchProviderForTests(provider: WebSearchProvider | null): void {
  injectedProvider = provider;
  injectedProviderSet = true;
}

export function __resetWebSearchProviderForTests(): void {
  injectedProvider = null;
  injectedProviderSet = false;
}

/**
 * Return the active web-search provider, or `null` when web search is not
 * configured (no Exa/Brave key). A test-injected provider takes precedence;
 * Exa is preferred over Brave when both keys are set.
 */
export function getWebSearchProvider(): WebSearchProvider | null {
  if (injectedProviderSet) return injectedProvider;
  if (!webSearchEnabled) return null;
  if (env.ai.EXA_API_KEY) return new ExaWebSearchProvider(env.ai.EXA_API_KEY);
  if (env.ai.BRAVE_SEARCH_API_KEY) {
    return new BraveWebSearchProvider(env.ai.BRAVE_SEARCH_API_KEY);
  }
  return null;
}

/**
 * Effective web-search switch: env flag OR an injected fake provider — so a
 * test provider flips the tool on. `buildToolRegistry` reads this to decide
 * whether to offer `web_search`.
 */
export function isWebSearchEnabled(): boolean {
  if (injectedProviderSet) return injectedProvider !== null;
  return webSearchEnabled;
}
