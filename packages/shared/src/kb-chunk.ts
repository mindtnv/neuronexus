// Shared chunker interfaces + types for the RAG knowledge-base pipeline.
// Pure TS — no DOM, no Node-only APIs — imported by both apps/api and apps/web.

// ── Source input ────────────────────────────────────────────────────────────
// Describes the raw source that the chunker will split into one-or-more chunks.
// `sourceType` widens as new source types are added (AC7 seam).

export interface SourceInput {
  /** Source category. Currently only 'card'; 'document' | 'note' to be added later. */
  sourceType: 'card';
  /** Primary key of the source entity (cards.id for 'card'). */
  sourceId: string;
  /** Navigable parent id — for cards: same as sourceId; for docs: the document id. */
  parentId: string;
  /** Raw text to chunk (cards.render_text — plaintext, tags/cloze already stripped). */
  text: string;
  /** Arbitrary metadata for filter + citation display (deckId, noteId, tags, …). */
  meta?: Record<string, string>;
}

// ── Chunk output ────────────────────────────────────────────────────────────
// One unit of embeddable content. Retrieval + chat code reads only these generic
// fields, so adding a new source type never touches retrieval/chat core.

export interface KbChunkInput {
  sourceType: string;
  sourceId: string;
  parentId: string;
  /** 0-based position within the source. Always 0 for single-chunk cards. */
  position: number;
  text: string;
  meta?: Record<string, string>;
}

// ── Chunker ────────────────────────────────────────────────────────────────
// v1: card → exactly 1 chunk at position 0 (text = full render_text, no split).
// document branch is the AC7 seam: the interface exists, the impl is deferred.

export function chunkSource(input: SourceInput): KbChunkInput[] {
  if (input.sourceType === 'card') {
    return [
      {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        parentId: input.parentId,
        position: 0,
        text: input.text,
        meta: input.meta,
      },
    ];
  }
  // Future branch (AC7): 'document' | 'note' — multi-chunk sliding window.
  throw new Error('not_implemented');
}

// ── Citation ────────────────────────────────────────────────────────────────
// Resolved source reference attached to an assistant message. Identical to the
// local placeholder in packages/db/src/schema/app.ts (that one will import this
// once the schema is updated in Slice 2).

export interface Citation {
  cardId: string;
  chunkId: string;
  deckId?: string;
  snippet?: string;
}

// ── SSE event types (Slice 4 server ↔ Slice 5 client) ──────────────────────
// The streaming chat endpoint emits a discriminated union of these frames.
// Both ends import from here so there is one source of truth.

/** Request body for POST /chat/conversations/:id/stream */
export interface ChatStreamRequest {
  content: string;
}

/**
 * Request body for POST /chat/conversations/:id/resume — answers a paused
 * write/SRS tool call (the `await_confirmation` frame). `decision: 'apply'`
 * executes the pending mutation + continues the loop; `'reject'` records a
 * "user rejected" tool result so the model can answer without mutating.
 */
export interface ChatResumeRequest {
  resumeToolCallId: string;
  decision: 'apply' | 'reject';
}

/**
 * One streamed tool call as the gateway/agent loop assembled it. `arguments` is
 * the raw JSON string the model emitted (parsed at execute time) — matches the
 * OpenAI wire shape so a persisted row replays straight back into `messages[]`.
 */
export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: string;
}

/** Discriminated union of SSE frames emitted by the chat stream endpoint. */
export type ChatStreamEvent =
  | { type: 'token'; delta: string }
  | { type: 'citation'; citations: Citation[] }
  | { type: 'done'; messageId: string }
  | { type: 'error'; message: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown; status: 'running' }
  | { type: 'tool_result'; id: string; ok: boolean; summary?: string; citations?: Citation[] }
  | { type: 'status'; phase: 'thinking' | 'calling_tool' | 'answering' }
  | {
      type: 'await_confirmation';
      toolCall: { id: string; name: string; args: unknown };
      impact?: {
        willDeleteCards?: number;
        willCreateCards?: number;
        affectsSiblings?: boolean;
      };
    };

// ── Model-emitted card-citation token ────────────────────────────────────────
// The grounded chat model marks the cards it cites inline as `[card:<uuid>]`.
// Shared between the server (citation union-dedup — intersect with the tokens
// the answer actually emitted) and the web client (chat.tsx, which wraps this in
// a local whitespace-absorbing variant for stripping the token from rendered
// prose). Capture group 1 = the cardId. `g` flag — reset `lastIndex` or use a
// fresh literal when matching repeatedly.
export const CARD_TOKEN_RE = /\[card:([0-9a-fA-F-]+)\]/g;
