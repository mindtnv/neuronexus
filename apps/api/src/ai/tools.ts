// Tool registry for the agentic chat loop (S3).
//
// A `Tool` is a server-side function the model can call. Phase A implements the
// READ tools only (`search_cards`, `web_search`); write/SRS tools (`kind:'write'`
// /`'srs'`) are Phase B — the `kind` field + the registry shape are here now so
// Phase B is a clean add (the loop in ai.ts only ever sees read tools in Phase A).
//
// Every tool is user-scoped via `ctx.userId`. A tool NEVER throws into the loop:
// `execute()` returns a discriminated `ToolResult` ({ ok:true, text, citations? }
// or { ok:false, error }). The loop turns a result into a `role:tool` message
// (the `text` field, capped) + a streamed `tool_result` event.

import type { Logger } from 'pino';
import type { Citation } from '@neuronexus/db';
import { embed } from './openai-client.ts';
import { retrieve } from './retrieve.ts';
import { resolveCitations } from './citations.ts';
import { getWebSearchProvider, isWebSearchEnabled } from './web-search.ts';
import { env } from '../env.ts';

const RETRIEVE_K = env.ai.RETRIEVE_K;
const RETRIEVE_MIN_SCORE = env.ai.RETRIEVE_MIN_SCORE;
const TOOL_RESULT_MAX_CHARS = env.ai.TOOL_RESULT_MAX_CHARS;

/** Per-call execution context. User-scoped — every tool MUST scope by `userId`. */
export interface ToolContext {
  userId: string;
  log: Logger;
}

/** Discriminated result of a tool execution. NEVER thrown — always returned. */
export type ToolResult =
  | { ok: true; text: string; citations?: Citation[] }
  | { ok: false; error: string };

export interface Tool {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments (the gateway `function.parameters`). */
  parameters: Record<string, unknown>;
  /**
   * `read` tools auto-execute server-side; `write`/`srs` tools pause the loop
   * for confirmation (Phase B). Phase A registry contains only `read` tools.
   */
  kind: 'read' | 'write' | 'srs';
  execute(ctx: ToolContext, args: unknown): Promise<ToolResult>;
}

/** Truncate a tool's model-facing text to the per-result char cap. */
function capText(text: string): string {
  if (text.length <= TOOL_RESULT_MAX_CHARS) return text;
  return `${text.slice(0, TOOL_RESULT_MAX_CHARS)}\n…[truncated]`;
}

// ── search_cards (read) ───────────────────────────────────────────────────────

interface SearchCardsArgs {
  query?: unknown;
  k?: unknown;
}

const searchCards: Tool = {
  name: 'search_cards',
  kind: 'read',
  description:
    "Semantic search over the user's OWN flashcards. Use this whenever the user " +
    'asks about the content, meaning, or recall of their cards/decks/notes. ' +
    'Returns matching card excerpts, each tagged with a [card:<id>] token you ' +
    'MUST cite inline next to claims drawn from it. If it returns nothing, tell ' +
    'the user honestly that no matching card was found — do not invent content.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query — a natural-language phrasing of what to find.',
      },
      k: {
        type: 'integer',
        description: `Max card excerpts to return (1..${RETRIEVE_K}).`,
        minimum: 1,
        maximum: RETRIEVE_K,
      },
    },
    required: ['query'],
  },
  async execute(ctx, rawArgs): Promise<ToolResult> {
    const args = (rawArgs ?? {}) as SearchCardsArgs;
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) return { ok: false, error: 'search_cards: missing "query" argument' };
    const k =
      typeof args.k === 'number' && Number.isFinite(args.k)
        ? Math.max(1, Math.min(Math.floor(args.k), RETRIEVE_K))
        : RETRIEVE_K;

    // Embed FIRST (this is the seam the meta-question regression test spies on:
    // zero embed calls proves no card search ran for a meta question).
    const [queryEmbedding] = await embed([query]);
    const hits =
      queryEmbedding && queryEmbedding.length > 0
        ? await retrieve({
            userId: ctx.userId,
            queryEmbedding,
            k,
            minScore: RETRIEVE_MIN_SCORE,
          })
        : [];

    const { ragChunks, citations } = await resolveCitations(hits);

    if (ragChunks.length === 0) {
      return {
        ok: true,
        text: 'No matching cards were found in the user\'s collection for this query.',
        citations: [],
      };
    }

    const body = ragChunks
      .map((c) => {
        const deck = c.deckName ? ` (deck: ${c.deckName})` : '';
        return `[card:${c.cardId}]${deck}\n${c.text}`;
      })
      .join('\n\n');
    return { ok: true, text: capText(body), citations };
  },
};

// ── web_search (read) ─────────────────────────────────────────────────────────

interface WebSearchArgs {
  query?: unknown;
  count?: unknown;
}

const webSearch: Tool = {
  name: 'web_search',
  kind: 'read',
  description:
    'Search the public web for external facts NOT covered by the user\'s cards ' +
    '(current events, definitions, general knowledge). Use only when the answer ' +
    'requires information outside the user\'s flashcards. Returns title/snippet/url ' +
    'for each result; cite the source URL when you use it.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The web search query.' },
      count: {
        type: 'integer',
        description: 'Max results to return (1..10).',
        minimum: 1,
        maximum: 10,
      },
    },
    required: ['query'],
  },
  async execute(ctx, rawArgs): Promise<ToolResult> {
    const args = (rawArgs ?? {}) as WebSearchArgs;
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) return { ok: false, error: 'web_search: missing "query" argument' };
    const count =
      typeof args.count === 'number' && Number.isFinite(args.count)
        ? Math.max(1, Math.min(Math.floor(args.count), 10))
        : 5;

    const provider = getWebSearchProvider();
    if (!provider) return { ok: false, error: 'web_search is not configured' };

    // The provider MAY throw (timeout/429/quota) — catch here so the loop never
    // sees a throw (preserves the SSE single-error invariant).
    try {
      const results = await provider.search(query, { count, log: ctx.log });
      if (results.length === 0) {
        return { ok: true, text: `No web results found for "${query}".` };
      }
      const body = results
        .map((r, i) => `${i + 1}. ${r.title}\n${r.snippet}\n${r.url}`)
        .join('\n\n');
      return { ok: true, text: capText(body) };
    } catch (err) {
      ctx.log.warn({ err }, 'ai.tool.web_search.failed');
      return { ok: false, error: err instanceof Error ? err.message : 'web_search_failed' };
    }
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Build the tool registry offered to the model. `search_cards` is always
 * present; `web_search` is included only when web search is enabled (Brave key
 * or a test-injected provider) — Principle 1: absent ⇒ tool simply not offered.
 */
export function buildToolRegistry(
  opts: { webSearchEnabled?: boolean } = {},
): Tool[] {
  const webOn = opts.webSearchEnabled ?? isWebSearchEnabled();
  const registry: Tool[] = [searchCards];
  if (webOn) registry.push(webSearch);
  return registry;
}

/** Map a registry to the gateway's `tools[]` request schema. */
export function toOpenAiTools(
  registry: Tool[],
): { type: 'function'; function: { name: string; description: string; parameters: unknown } }[] {
  return registry.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}
