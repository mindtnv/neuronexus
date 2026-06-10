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
  /** Optional model id; validated server-side against the CHAT_MODELS allow-list. */
  model?: string;
  /** Optional per-turn deck scope (AC3.7) — constrains card retrieval to a deck (subtree). */
  deckId?: string;
  /** Deep-research MODE (composer toggle): research prompt + raised step/budget caps. */
  research?: boolean;
  /**
   * Cards the user explicitly attached via composer @-mentions (max 8).
   * Resolved server-side (user-scoped; foreign/missing ids silently dropped),
   * persisted on the user row's `mentions` jsonb, and injected into the
   * model-facing content as a `<mentioned_cards>` block at history-build time —
   * the STORED content stays clean for display.
   */
  mentionedCardIds?: string[];
  /**
   * Composer file attachments (max 4 per message). Images reference an
   * already-uploaded media object by id ONLY — token/mime are resolved
   * server-side from the user-scoped `media` row (never trusted from the
   * client). Text files carry their (client-truncated) content inline; the
   * server re-caps it. Persisted on the user row's `attachments` jsonb; the
   * model sees images as multimodal `image_url` parts and text files as an
   * `<attached_file>` block — the STORED content stays clean.
   */
  attachments?: MessageAttachmentInput[];
}

/** Wire shape of one composer attachment (client → server). */
export type MessageAttachmentInput =
  | { kind: 'image'; mediaId: string; name?: string }
  | { kind: 'text'; name: string; text: string };

/**
 * One persisted attachment on a user message row (server-resolved snapshot).
 * `token` is the public `/m/<uuid>` path the web client renders the image from.
 */
export type MessageAttachment =
  | { kind: 'image'; mediaId: string; token: string; mime: string; name?: string }
  | { kind: 'text'; name: string; text: string };

/**
 * Token usage for one persisted assistant turn, as reported by the gateway's
 * `stream_options: { include_usage: true }` final chunk. Accumulated across all
 * steps of an agentic turn. Absent (null column) when the provider omits usage.
 */
export interface MessageUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * One composer @-mention persisted on a user message row. `front` is a snapshot
 * excerpt taken at send time (a later card edit does NOT rewrite chat history —
 * deterministic replay wins over freshness).
 */
export interface MessageMention {
  cardId: string;
  front: string;
  deckName?: string;
}

/**
 * Blast radius + previews for a paused write/SRS tool call (the
 * `await_confirmation` frame and the tools' `dryRun()` output share this shape
 * via the `ToolImpact` alias in apps/api). All fields optional — SRS tools emit
 * no impact at all (frame carries `impact: undefined`).
 */
export interface ConfirmImpact {
  willDeleteCards?: number;
  willCreateCards?: number;
  affectsSiblings?: boolean;
  /** edit_card: changed fields only; values capped ~300 chars, whitespace-collapsed. */
  fieldDiffs?: { field: string; before: string; after: string }[];
  /** edit_card: full before/after tag lists when `tags` is part of the proposal. */
  tagsChange?: { before: string[]; after: string[] };
  /** edit_card: deck move target (args-only — no DB read in this branch). */
  deckChange?: { toDeckId: string };
  /** edit_card: proposed `suspended` value when part of the args. */
  suspendedChange?: boolean;
  /** create_card: proposed field values (capped ~300 chars each). */
  proposedFields?: { field: string; value: string }[];
  /**
   * create_card batch (`cards: [...]`): per-card proposed field values, one entry
   * per card in batch order. Single-card calls keep using `proposedFields`.
   */
  proposedCards?: { fields: { field: string; value: string }[] }[];
}

/**
 * Request body for POST /chat/conversations/:id/resume — answers a paused
 * write/SRS tool call (the `await_confirmation` frame). `decision: 'apply'`
 * executes the pending mutation + continues the loop; `'reject'` records a
 * "user rejected" tool result so the model can answer without mutating.
 * `model?` carries the user's current selection so the continuation stays
 * consistent with their choice (AC2.5).
 */
export interface ChatResumeRequest {
  resumeToolCallId: string;
  decision: 'apply' | 'reject';
  model?: string;
  /** Deep-research mode toggle state — keeps a research turn's continuation
   *  on the raised caps + research prompt. */
  research?: boolean;
  /**
   * Per-card decisions for a pending `create_card` confirm (apply path):
   * `index` addresses the proposed card (batch order; a single-card proposal is
   * index 0), `include:false` drops it, `fieldValues` overrides its content
   * (inline edit). Unmentioned indexes apply as proposed. ALL excluded ⇒ the
   * apply degrades to a reject. Ignored for other tools.
   */
  cardSelections?: { index: number; include: boolean; fieldValues?: Record<string, string> }[];
  /**
   * Optional user note passed through to the MODEL in the tool result (both
   * apply and reject) — "propose edits" without applying anything.
   */
  feedback?: string;
}

/**
 * One allow-listed chat model surfaced by GET /ai/status + consumed by the web
 * picker. Derived from the CSV `CHAT_MODELS` env (`model[|label]`, first=default).
 * NOT a secret — only `{ id, label, default }` ever leaves the server.
 */
export interface ChatModelOption {
  id: string;
  label: string;
  default: boolean;
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
  // Auto-generated thread title (first turn of an untitled conversation).
  // Emitted before `done`; older clients ignore unknown frames.
  | { type: 'title'; title: string }
  // Accumulated token usage for the turn. Emitted before `done`; absent
  // entirely when the provider reports no usage.
  | { type: 'usage'; promptTokens: number; completionTokens: number; totalTokens?: number }
  | {
      type: 'await_confirmation';
      toolCall: { id: string; name: string; args: unknown };
      impact?: ConfirmImpact;
    };

// ── Model-emitted card-citation token ────────────────────────────────────────
// The grounded chat model marks the cards it cites inline as `[card:<uuid>]`.
// Shared between the server (citation union-dedup — intersect with the tokens
// the answer actually emitted) and the web client (chat.tsx, which wraps this in
// a local whitespace-absorbing variant for stripping the token from rendered
// prose). Capture group 1 = the cardId. `g` flag — reset `lastIndex` or use a
// fresh literal when matching repeatedly.
export const CARD_TOKEN_RE = /\[card:([0-9a-fA-F-]+)\]/g;
