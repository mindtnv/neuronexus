// AI / RAG module. v1 foundation. Exposes:
//   GET    /ai/status                          — feature switches + model config (Slice 0).
//   POST   /ai/reindex                         — enqueue all the caller's cards (Slice 3).
//   GET    /chat/conversations                 — user's threads, newest first (Slice 4).
//   POST   /chat/conversations                 — create a thread (Slice 4).
//   GET    /chat/conversations/:id             — thread + messages, user-scoped (Slice 4).
//   DELETE /chat/conversations/:id             — delete a thread (Slice 4).
//   POST   /chat/conversations/:id/stream      — grounded RAG chat over SSE (Slice 4).
//
// All AI features degrade-not-crash: the two flags (`embeddingEnabled` /
// `chatEnabled`) are decoupled and derive from optional env (apps/api/src/env.ts);
// `/ai/status` also reflects the boot-time dim-assertion degrade state.
//
// SSE error boundary (SHOULD-FIX #7, CRITICAL): once the stream flushes its
// first byte, the response status/headers are committed and app.ts's `.onError`
// returns JSON — it CANNOT rewrite a `text/event-stream` body. So the stream
// handler catches ALL post-flush errors internally and emits a terminal
// `event: error` frame; NOTHING throws out of the ReadableStream into Elysia's
// error pipeline. Pre-flush failures (e.g. no conversation) still 404/503/500
// via the normal path because nothing was flushed.

import { Elysia, t } from 'elysia';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  cards as cardsTable,
  conversations,
  db,
  decks,
  messages as messagesTable,
  notebooks,
  notebookSources,
  profile as profileTable,
  sourceChunks,
  sources,
  type Citation,
  type Db,
} from '@neuronexus/db';
import {
  buildAgentSystemPrompt,
  isAllowedModel,
  isSourceCitation,
  parseChatModels,
  type ChatResumeRequest,
  type ChatStreamEvent,
  type ConfirmImpact,
  type MessageAttachment,
  type MessageGrounding,
  type MessageMention,
  type MessageUsage,
} from '@neuronexus/shared';
import {
  buildUserContent,
  isVisionEnabled,
  loadImagePartsMap,
  resolveAttachments,
} from '../ai/attachments.ts';
import { env, embeddingEnabled, chatEnabled, notebooksEnabled } from '../env.ts';
import { descendantIds } from './cards.ts';
import { authPlugin } from '../auth-plugin.ts';
import { embeddingDegraded, reindexUser } from '../ai/index-queue.ts';
import { reconcileDocumentsOnStartup } from '../ai/source-ingest.ts';
import {
  chatStreamAgentic,
  isChatEnabled,
  type AgentChatMessage,
} from '../ai/openai-client.ts';
import { intersectSourceTokens } from '../ai/citations.ts';
import {
  buildToolRegistry,
  enqueueToolCardsForIndex,
  GROUNDING_CAP,
  toOpenAiTools,
  type Tool,
  type ToolContext,
  type ToolImpact,
  type ToolResult,
} from '../ai/tools.ts';
import { isWebSearchEnabled } from '../ai/web-search.ts';
import { isFetchPageEnabled } from '../ai/page-reader.ts';
import { compressHistory } from '../ai/compress.ts';
import { writeCardProvenance } from '../ai/provenance.ts';
import { generateConversationTitle } from '../ai/title.ts';
import { rootLogger } from '../logger.ts';
import type { Logger } from 'pino';

/** A Drizzle transaction handle (the arg passed to `db.transaction`). */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

// Retrieval tuning for a chat turn (env-configurable — see env.ts ai block).
const RETRIEVE_K = env.ai.RETRIEVE_K;
const AGENT_MAX_STEPS = env.ai.AGENT_MAX_STEPS;
const TOOL_RESULT_MAX_CHARS = env.ai.TOOL_RESULT_MAX_CHARS;
// Total tool-result chars across a turn before we force a final answer (so a
// multi-round search loop can't blow the context window). The factor is
// env-tunable (TOOL_RESULT_BUDGET_FACTOR, default 8) — deep-research turns
// read several fetch_page slices before drafting cards; ordinary turns never
// approach the ceiling.
const TOOL_RESULT_BUDGET = TOOL_RESULT_MAX_CHARS * env.ai.TOOL_RESULT_BUDGET_FACTOR;
// Max distinct source chunks previewed on a notebook create_card confirm card
// (M3 / AC3.2) — the same cap as the provenance writer keeps per created card.
const CARD_SOURCE_LINK_CAP = env.ai.CARD_SOURCE_LINK_CAP;
// GROUNDING_CAP is imported from tools.ts (one source of truth) — it bounds the
// grounding snapshot persisted on a suspended notebook create_card row.

// Parsed model allow-list (AC2.1). Computed once at module load; `[]` when
// CHAT_MODELS is unset ⇒ the picker is hidden and chat uses CHAT_MODEL as today.
let chatModels = parseChatModels(env.ai.CHAT_MODELS);

/**
 * Test seam: override the parsed allow-list (NODE_ENV=test only). `CHAT_MODELS`
 * is parsed once at module load, so the integration suite can't set it via env
 * before import — this setter lets a test pin the allow-list and restore it.
 * Mirrors `__setAiClientForTests`. Pass `undefined` to re-parse from env.
 */
export function __setChatModelsForTests(raw: string | undefined): void {
  chatModels = parseChatModels(raw ?? env.ai.CHAT_MODELS);
}

/** The default model id (the first allow-list entry), or undefined when no list. */
function defaultChatModel(): string | undefined {
  return chatModels.find((m) => m.default)?.id;
}

/**
 * Resolve + validate a client-supplied model against the allow-list (pre-flush,
 * shared by /stream + /resume + /regenerate). Returns the resolved model id (the
 * request's model, or the default, or undefined when no list), or an
 * `invalid_model` error when a non-empty allow-list rejects the supplied id.
 */
function resolveChatModel(
  requested: string | undefined,
): { ok: true; model: string | undefined } | { ok: false } {
  if (requested && chatModels.length > 0 && !isAllowedModel(chatModels, requested)) {
    return { ok: false };
  }
  return { ok: true, model: requested ?? defaultChatModel() };
}

/**
 * Resolve a turn's optional `deckId` into the retrieval scope (AC3.7): the deck
 * + its subtree over the CALLER's decks. A foreign/un-owned deckId yields an
 * empty subtree → `[deckId]`, which matches no owned cards ⇒ an EMPTY scope (the
 * agent finds nothing in that deck), NOT a silent global fallback. Returns the
 * scope ids + the deck's display name (for the system-prompt hint). Undefined
 * deckId ⇒ `{ deckIds: undefined }` (global retrieval, byte-identical to today).
 */
async function resolveDeckScope(
  userId: string,
  deckId: string | undefined,
): Promise<{ deckIds: string[] | undefined; deckName?: string }> {
  if (!deckId) return { deckIds: undefined };
  const userDecks = await db
    .select({ id: decks.id, parentId: decks.parentId, name: decks.name })
    .from(decks)
    .where(eq(decks.userId, userId));
  const owned = userDecks.find((d) => d.id === deckId);
  const deckIds = [deckId, ...descendantIds(deckId, userDecks)];
  return { deckIds, deckName: owned?.name };
}

/** Resolved notebook scope for a turn — threaded into the registry/prompt/ctx. */
export interface NotebookScope {
  notebookId: string;
  /** Ready sources of the notebook intersected with the per-turn request scope. */
  sourceIds: string[];
  title: string;
  /** Titles of the sources in `sourceIds` (for the prompt's sources section). */
  sourceTitles: string[];
}

/**
 * Resolve the notebook scope for a turn FROM THE CONVERSATION ROW (never from a
 * request body): a conversation bound to a notebook chats grounded on THAT
 * notebook's READY sources. The per-turn `requestedSourceIds` (the workspace
 * checkbox state) is INTERSECTED with the notebook's own ready sources — foreign
 * ids are silently dropped, an empty intersection ⇒ `sourceIds: []` (the source
 * tools return nothing; the prompt notes there are no sources). A global
 * conversation (notebookId null) ⇒ undefined (no notebook scope). The notebook
 * ownership is implied by the conversation's own user scoping (the conversation
 * was already user-scoped by the caller before this is called).
 */
async function resolveNotebookScope(
  userId: string,
  conv: { notebookId: string | null },
  requestedSourceIds: string[] | undefined,
): Promise<NotebookScope | undefined> {
  if (!conv.notebookId) return undefined;
  const notebookId = conv.notebookId;

  const [nb] = await db
    .select({ title: notebooks.title })
    .from(notebooks)
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, userId)))
    .limit(1);
  // A notebook deleted out from under the conversation (cascade should have
  // removed the conversation, but be defensive) ⇒ an empty, titleless scope.
  const title = nb?.title ?? '';

  // The notebook's READY sources, reached through the notebook_sources join
  // (sources are user-level now — the notebook binding lives on the edge).
  const readyRows = await db
    .select({ id: sources.id, title: sources.title })
    .from(notebookSources)
    .innerJoin(sources, eq(sources.id, notebookSources.sourceId))
    .where(
      and(
        eq(sources.userId, userId),
        eq(notebookSources.notebookId, notebookId),
        eq(sources.status, 'ready'),
      ),
    );

  // Intersect with the requested per-turn scope when provided (foreign dropped).
  let scoped = readyRows;
  if (requestedSourceIds !== undefined) {
    const requested = new Set(requestedSourceIds);
    scoped = readyRows.filter((r) => requested.has(r.id));
  }
  return {
    notebookId,
    sourceIds: scoped.map((r) => r.id),
    title,
    sourceTitles: scoped.map((r) => r.title),
  };
}

/**
 * Resolve a (capped) list of grounding chunk ids into the confirm preview's
 * provenance rows (AC3.2): `{ sourceTitle, page?, chunkId }`, user-scoped, in the
 * given (accumulation) order. Foreign/missing chunk ids drop out silently. Used
 * ONLY to enrich the `await_confirmation` impact for a notebook create_card.
 */
async function resolveProvenancePreview(
  userId: string,
  chunkIds: string[],
): Promise<NonNullable<ConfirmImpact['provenance']>> {
  if (chunkIds.length === 0) return [];
  const rows = await db
    .select({
      id: sourceChunks.id,
      page: sourceChunks.page,
      sourceTitle: sources.title,
    })
    .from(sourceChunks)
    .innerJoin(sources, eq(sources.id, sourceChunks.sourceId))
    .where(and(eq(sourceChunks.userId, userId), inArray(sourceChunks.id, chunkIds)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: NonNullable<ConfirmImpact['provenance']> = [];
  for (const id of chunkIds) {
    const row = byId.get(id);
    if (!row) continue;
    out.push({
      sourceTitle: row.sourceTitle,
      page: row.page == null ? undefined : row.page,
      chunkId: id,
    });
  }
  return out;
}

/** Serialize one SSE frame from a typed ChatStreamEvent. */
function sseFrame(event: ChatStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * C5 — the caller's standing agent instructions (profile.agent_instructions),
 * or undefined. One cheap pre-flush select per turn; absent profile row (lazy
 * profile creation hasn't happened yet) ⇒ undefined.
 */
async function loadAgentInstructions(userId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ agentInstructions: profileTable.agentInstructions })
    .from(profileTable)
    .where(eq(profileTable.userId, userId))
    .limit(1);
  return row?.agentInstructions ?? undefined;
}

// ── Card mentions (C7) ────────────────────────────────────────────────────────

/** Snapshot excerpt length for a mention's card front. */
const MENTION_FRONT_CHARS = 200;

/**
 * Resolve composer @-mention card ids into persisted `MessageMention`
 * snapshots. ONE user-scoped select (`user_id` first conjunct — the sole
 * cross-tenant boundary); foreign/missing ids are silently dropped. Preserves
 * the client's order. Returns `null` when nothing survives (column stays NULL).
 */
async function resolveMentions(
  userId: string,
  ids: string[] | undefined,
): Promise<MessageMention[] | null> {
  if (!ids || ids.length === 0) return null;
  const unique = [...new Set(ids)];
  const rows = await db
    .select({
      id: cardsTable.id,
      front: cardsTable.renderFrontText,
      renderText: cardsTable.renderText,
      deckName: decks.name,
    })
    .from(cardsTable)
    .leftJoin(decks, eq(cardsTable.deckId, decks.id))
    .where(and(eq(cardsTable.userId, userId), inArray(cardsTable.id, unique)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const mentions: MessageMention[] = [];
  for (const id of unique) {
    const row = byId.get(id);
    if (!row) continue; // foreign or missing — dropped, never an error.
    const front = (row.front || row.renderText || '').replace(/\s+/g, ' ').trim();
    mentions.push({
      cardId: id,
      front: front.slice(0, MENTION_FRONT_CHARS),
      deckName: row.deckName ?? undefined,
    });
  }
  return mentions.length > 0 ? mentions : null;
}

/**
 * Append the model-facing `<mentioned_cards>` block to a user message's
 * content. The STORED content never carries the block — it is built here, at
 * history/turn-build time, from the row's `mentions` snapshot (deterministic
 * replay; a later card edit doesn't rewrite chat history).
 */
function appendMentionBlock(content: string, mentions: MessageMention[] | null): string {
  if (!mentions || mentions.length === 0) return content;
  const lines = mentions.map((m) => {
    const deck = m.deckName ? ` (deck: ${m.deckName})` : '';
    return `[card:${m.cardId}]${deck}\n${m.front}`;
  });
  return `${content}\n\n<mentioned_cards>\n${lines.join('\n\n')}\n</mentioned_cards>`;
}

// ── Agent loop plumbing ───────────────────────────────────────────────────────

/** A persisted message row (the subset the history mapper reads). */
interface HistoryRow {
  /** Row id — the messageId stamped on provenance edges of a notebook turn (M3). */
  id: string;
  role: string;
  content: string;
  toolCalls: { id: string; name: string; arguments: string }[] | null;
  toolCallId: string | null;
  /** Composer @-mentions on a user row (C7) — appended at history-build time. */
  mentions: MessageMention[] | null;
  /** Composer attachments on a user row — parts/blocks built at history time. */
  attachments: MessageAttachment[] | null;
  /** Notebook-turn grounding snapshot (M3) on the pending assistant tool_calls
   *  row of a suspended create_card; null everywhere else. */
  grounding: MessageGrounding | null;
  /** Needed by compression (C6) for the summary-cache boundary. */
  createdAt: Date;
}

/** A finalized tool call assembled from streamed `tool_call_delta` chunks. */
interface AssembledToolCall {
  id: string;
  name: string;
  /** Raw JSON string the model emitted (parsed at execute time). */
  arguments: string;
}

/** An in-memory transcript row, committed in ONE transaction at turn end. */
type TranscriptRow =
  // `grounding` is set ONLY on the pending assistant tool_calls row of a
  // suspended notebook create_card (M3) — persisted so auto-provenance survives
  // /resume + reload. Undefined on every other tool_calls row.
  | { role: 'assistant'; content: ''; toolCalls: AssembledToolCall[]; grounding?: MessageGrounding }
  | { role: 'tool'; content: string; toolCallId: string }
  | { role: 'assistant'; content: string; citations: Citation[] };

/**
 * Reconstruct the gateway `messages[]` history from persisted rows (oldest
 * first; the just-inserted user turn already excluded by the caller). Explicit
 * role→message mapping — NEVER drop a row by content emptiness:
 *  - user                                → { role:'user', content }
 *  - assistant w/ non-null tool_calls    → { role:'assistant', content:'', tool_calls }
 *  - assistant text (tool_calls null)    → { role:'assistant', content }
 *  - tool                                → { role:'tool', tool_call_id, content }
 *
 * Replay sanitizer (generalizes the old trailing-row dangling guard): the
 * gateway 400s BOTH on a tool call with no `role:tool` output ("No tool output
 * found for function call …") AND on a `role:tool` row with no preceding call.
 * A suspended turn legitimately leaves an unanswered tail; a torn turn or two
 * historical turns interleaved by a same-timestamp reload can leave holes
 * ANYWHERE. So instead of inspecting only the last row, the whole replay is
 * made self-consistent:
 *  - pass 1 simulates the replay in order — a call counts as ANSWERED only when
 *    a `role:tool` row for it appears AFTER its assistant row;
 *  - pass 2 keeps only answered calls (an assistant row left with zero calls is
 *    dropped) and only the FIRST answering `role:tool` row per call.
 *
 * `bypassDanglingToolCallId` (resume path): treated as answered — the resume
 * route persists the answering row before rebuilding, so this is a safety belt
 * for exotic orderings, not a behavioral branch.
 */
function reconstructHistory(
  rows: HistoryRow[],
  bypassDanglingToolCallId?: string,
  imageDataUrls: Map<string, string> = new Map(),
): AgentChatMessage[] {
  // Pass 1 — which calls are genuinely answered, in replay order.
  const open = new Set<string>();
  const answered = new Set<string>();
  if (bypassDanglingToolCallId) answered.add(bypassDanglingToolCallId);
  for (const r of rows) {
    if (r.role === 'assistant' && r.toolCalls && r.toolCalls.length > 0) {
      for (const tc of r.toolCalls) open.add(tc.id);
    } else if (r.role === 'tool' && r.toolCallId && open.has(r.toolCallId)) {
      answered.add(r.toolCallId);
    }
  }

  // Pass 2 — rebuild, keeping the replay self-consistent: a `role:tool` row is
  // emitted only AFTER its call's assistant row, exactly once.
  const out: AgentChatMessage[] = [];
  const emittedCalls = new Set<string>();
  const emittedResults = new Set<string>();
  for (const r of rows) {
    if (r.role === 'user') {
      // C7 — a user row's mention snapshot becomes a model-facing block; the
      // stored content itself stays clean for display. Attachments become an
      // <attached_file> block + image parts (for images in `imageDataUrls`).
      out.push({
        role: 'user',
        content: buildUserContent(
          appendMentionBlock(r.content, r.mentions),
          r.attachments,
          imageDataUrls,
        ),
      });
    } else if (r.role === 'assistant' && r.toolCalls && r.toolCalls.length > 0) {
      const kept = r.toolCalls.filter((tc) => answered.has(tc.id));
      if (kept.length === 0) continue; // fully unanswered (pending/torn) — dropped.
      for (const tc of kept) emittedCalls.add(tc.id);
      out.push({
        role: 'assistant',
        content: '',
        tool_calls: kept.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });
    } else if (r.role === 'assistant') {
      out.push({ role: 'assistant', content: r.content });
    } else if (r.role === 'tool' && r.toolCallId) {
      if (!emittedCalls.has(r.toolCallId) || emittedResults.has(r.toolCallId)) continue;
      emittedResults.add(r.toolCallId);
      out.push({ role: 'tool', content: r.content, tool_call_id: r.toolCallId });
    }
    // system rows (none today) are ignored — we set the system prompt ourselves.
  }
  return out;
}

/** Truncate a tool-result string to the per-result content cap. */
function capToolResult(text: string): string {
  if (text.length <= TOOL_RESULT_MAX_CHARS) return text;
  return `${text.slice(0, TOOL_RESULT_MAX_CHARS)}\n…[truncated]`;
}

/** Outcome of a shared agent turn — the caller closes the controller accordingly. */
type AgentTurnOutcome =
  | { kind: 'done'; messageId: string }
  // The turn paused on a write/SRS tool awaiting confirmation. The buffered
  // transcript (up to AND including the assistant tool_calls row naming the
  // pending write) is already COMMITTED; the caller closes WITHOUT a `done`.
  | { kind: 'suspended' };

interface RunAgentTurnArgs {
  userId: string;
  conversationId: string;
  log: Logger;
  emit: (event: ChatStreamEvent) => void;
  /** [system, ...history, user] — already reconstructed by the caller. */
  startMessages: AgentChatMessage[];
  webSearchEnabled: boolean;
  /** Resolved model id threaded into EVERY `chatStreamAgentic` call (AC2.3). */
  model?: string;
  /** Per-turn deck retrieval scope (AC3.7) — `[deckId, ...descendants]` or undefined. */
  deckIds?: string[];
  /**
   * Turn-level abort (the conversation lock's signal): checked between steps and
   * threaded into the gateway fetch, so a disconnected/stopped turn stops doing
   * work instead of running to completion as a zombie. An aborted turn persists
   * NOTHING (identical to today's torn-turn semantics).
   */
  signal?: AbortSignal;
  /**
   * Deep-research MODE (the composer toggle): raises the step ceiling to
   * RESEARCH_MAX_STEPS and the tool-result budget to the research factor so the
   * turn can read many fetch_page slices before the loop forces an answer.
   */
  research?: boolean;
  /**
   * NotebookLM workspace (M2): the resolved notebook scope for this turn. When
   * set, the registry is the narrow notebook set (search_source/read_source/
   * list_decks/create_card), the tool context carries the source scope + a fresh
   * grounding accumulator, and a suspended create_card stamps its grounding +
   * provenance preview. Undefined ⇒ ordinary global chat (byte-identical).
   */
  notebook?: NotebookScope;
}

/**
 * The shared agentic loop body — used by BOTH the initial `/stream` handler and
 * the `/resume` continuation. Streams `reasoning`/`token`/`tool_*`/`status`
 * frames, executes READ tools server-side, and — when a finalized tool call is a
 * write/SRS tool — computes its dry-run `impact`, emits `await_confirmation`,
 * commits the transcript up to and including that pending `tool_calls` row, and
 * returns `{ kind:'suspended' }` (the turn is suspended; the caller closes the
 * stream WITHOUT a `done`). Otherwise it runs to `finish:stop`, emits the
 * union-deduped `citation`, commits the entire turn transcript in ONE end-of-turn
 * transaction, and returns `{ kind:'done', messageId }`.
 *
 * NOTE: this routine NEVER catches — it lets errors propagate to the caller's
 * try/catch (which turns them into a terminal `event: error` frame, SHOULD-FIX
 * #7). A dropped/erroring turn persists nothing (the commit is at the very end,
 * or — for a suspended turn — exactly at the confirmation boundary).
 */
async function runAgentTurn(args: RunAgentTurnArgs): Promise<AgentTurnOutcome> {
  const {
    userId,
    conversationId,
    log,
    emit,
    startMessages,
    webSearchEnabled,
    model,
    deckIds,
    signal,
    research,
    notebook,
  } = args;

  // Per-turn loop limits: a deep-research turn gets more steps + budget.
  // Notebook mode never carries `research` (the caller drops it), so this is the
  // global default there.
  const maxSteps = research ? env.ai.RESEARCH_MAX_STEPS : AGENT_MAX_STEPS;
  const toolBudget = research
    ? TOOL_RESULT_MAX_CHARS * env.ai.RESEARCH_TOOL_RESULT_BUDGET_FACTOR
    : TOOL_RESULT_BUDGET;

  // Notebook mode swaps the registry for the narrow source-grounded set and gives
  // the tool context a source scope + a fresh, MUTABLE grounding accumulator that
  // search_source/read_source push the surfaced source_chunk ids into (M3).
  const registry: Tool[] = buildToolRegistry({ webSearchEnabled, notebook: !!notebook });
  const toolByName = new Map(registry.map((tl) => [tl.name, tl]));
  const openAiTools = toOpenAiTools(registry);
  const grounding = notebook ? { chunkIds: [] as string[] } : undefined;
  const toolCtx: ToolContext = {
    userId,
    log,
    deckIds,
    notebook: notebook ? { notebookId: notebook.notebookId, sourceIds: notebook.sourceIds } : undefined,
    grounding,
  };

  const messages = [...startMessages];

  // `transcript` accumulates rows to persist. Phase A / a fully-answered resume
  // commits ALL rows in ONE end-of-turn transaction at `done`. A write/SRS pause
  // commits the buffer-so-far + the pending assistant tool_calls row, then stops.
  const transcript: TranscriptRow[] = [];
  // Turn-level citation accumulator (union across ALL search_cards calls).
  const citationAcc = new Map<string, Citation>();
  let finalText = '';
  let toolResultChars = 0;
  let answeringEmitted = false;
  // Token usage accumulated across ALL steps of this turn (C1). `usageSeen`
  // distinguishes "provider reports zeros" from "provider reports nothing" —
  // no frame / null column in the latter case.
  let usageSeen = false;
  let usagePrompt = 0;
  let usageCompletion = 0;
  let usageTotal = 0;
  // Effective model persisted on assistant rows: the per-turn picker choice or
  // the env default at the time of the turn.
  const effectiveModel = model ?? env.ai.CHAT_MODEL;

  emit({ type: 'status', phase: 'thinking' });

  for (let step = 0; step < maxSteps; step++) {
    // Cancelled turn (Stop / disconnect / superseded) — bail before more work.
    // Persists nothing; sseResponse recognizes the aborted signal and closes
    // quietly (the trailing-user recovery affordance covers the UX).
    if (signal?.aborted) throw new Error('turn_aborted');

    const isFinalStep = step === maxSteps - 1 || toolResultChars >= toolBudget;
    const toolChoice = isFinalStep ? 'none' : 'auto';

    const partials = new Map<number, { id: string; name: string; args: string }>();
    let finishReason: 'stop' | 'tool_calls' | 'length' | undefined;

    for await (const chunk of chatStreamAgentic(messages, {
      tools: isFinalStep ? [] : openAiTools,
      toolChoice,
      log,
      model,
      signal,
    })) {
      if (chunk.type === 'reasoning') {
        emit({ type: 'reasoning', delta: chunk.text });
      } else if (chunk.type === 'content') {
        if (!answeringEmitted) {
          answeringEmitted = true;
          emit({ type: 'status', phase: 'answering' });
        }
        finalText += chunk.text;
        emit({ type: 'token', delta: chunk.text });
      } else if (chunk.type === 'tool_call_delta') {
        const cur = partials.get(chunk.index) ?? { id: '', name: '', args: '' };
        if (chunk.id) cur.id = chunk.id;
        if (chunk.name) cur.name = chunk.name;
        if (chunk.argsFragment) cur.args += chunk.argsFragment;
        partials.set(chunk.index, cur);
      } else if (chunk.type === 'usage') {
        usageSeen = true;
        usagePrompt += chunk.promptTokens;
        usageCompletion += chunk.completionTokens;
        usageTotal += chunk.totalTokens;
      } else if (chunk.type === 'finish') {
        finishReason = chunk.reason;
      }
    }

    // Never-terminated guard (M3): reader ended with buffered tool_call fragments
    // but NO finish chunk → torn stream. Terminal error; do NOT execute partials.
    if (finishReason === undefined && partials.size > 0) {
      throw new Error('chat_stream_torn');
    }

    if (isFinalStep || finishReason !== 'tool_calls') {
      // Terminal: a (possibly empty) text answer. On the forced-final step we
      // IGNORE any tool_calls the gateway returned anyway.
      break;
    }

    const assembled: AssembledToolCall[] = [...partials.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, p], index) => ({
        id: p.id || `call_${step}_${index}`,
        name: p.name,
        arguments: p.args,
      }));

    if (assembled.length === 0) break;

    // ── Batch split (C2) ───────────────────────────────────────────────────────
    // READ tools execute first — CONCURRENTLY — as their own fully-answered
    // assistant tool_calls row. A write/SRS call (at most ONE pending at a time:
    // the FIRST one in the batch) then pauses the turn as a SECOND assistant
    // tool_calls row. Unknown tool names take the read path (graceful error
    // result), exactly as before. Extra writes beyond the first are dropped —
    // the model re-proposes on resume if still needed.
    const reads = assembled.filter((c) => {
      const tl = toolByName.get(c.name);
      return !tl || tl.kind === 'read';
    });
    const firstWrite = assembled.find((c) => {
      const tl = toolByName.get(c.name);
      return tl && tl.kind !== 'read';
    });

    if (reads.length > 0) {
      messages.push({
        role: 'assistant',
        content: '',
        tool_calls: reads.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });
      transcript.push({ role: 'assistant', content: '', toolCalls: reads });

      emit({ type: 'status', phase: 'calling_tool' });

      // All tool_call frames go out up-front (batch order) so the client shows
      // every step running; tool_result frames arrive per-completion. Everything
      // ORDER-SENSITIVE (citation dedup, result caps, char budget, persisted
      // role:tool rows) happens AFTER the Promise.all, in batch order —
      // deterministic regardless of completion interleaving.
      for (const call of reads) {
        emit({ type: 'tool_call', id: call.id, name: call.name, args: call.arguments, status: 'running' });
      }

      const settled = await Promise.all(
        reads.map(async (call) => {
          let parsedArgs: unknown = {};
          let parseFailed = false;
          try {
            parsedArgs = call.arguments ? JSON.parse(call.arguments) : {};
          } catch {
            parseFailed = true;
          }

          const tool = toolByName.get(call.name);
          let result: ToolResult;
          if (parseFailed) {
            result = { ok: false, error: `invalid tool arguments for ${call.name}` };
          } else if (!tool) {
            result = { ok: false, error: `unknown tool: ${call.name}` };
          } else {
            try {
              result = await tool.execute(toolCtx, parsedArgs);
            } catch (toolErr) {
              result = {
                ok: false,
                error: toolErr instanceof Error ? toolErr.message : 'tool_failed',
              };
            }
          }

          const resultCitations = result.ok ? (result.citations ?? []) : [];
          // Success carries the (capped) model-facing text so every step is
          // inspectable in the live activity feed — the SAME content the reload
          // path reads back from the persisted role:tool row.
          emit({
            type: 'tool_result',
            id: call.id,
            ok: result.ok,
            summary: result.ok ? capToolResult(result.text) : result.error,
            citations: result.ok && resultCitations.length > 0 ? resultCitations : undefined,
          });
          return { call, result, resultCitations };
        }),
      );

      for (const { call, result, resultCitations } of settled) {
        for (const c of resultCitations) {
          // Dedup key per variant: a source citation keys on its sourceChunkId,
          // a card citation on its chunkId (fallback cardId).
          const key = isSourceCitation(c) ? c.sourceChunkId : c.chunkId || c.cardId;
          if (!citationAcc.has(key)) citationAcc.set(key, c);
        }
        const toolContent = capToolResult(
          result.ok ? result.text : JSON.stringify({ ok: false, error: result.error }),
        );
        toolResultChars += toolContent.length;
        messages.push({ role: 'tool', content: toolContent, tool_call_id: call.id });
        transcript.push({ role: 'tool', content: toolContent, toolCallId: call.id });
      }
    }

    // ── Write/SRS pause (Phase B) ──────────────────────────────────────────────
    // The pending write goes out as its OWN assistant tool_calls row — the reads
    // above are already fully answered, so the dangling-tool_calls guard (which
    // only inspects the LAST row) and the resume bypass behave exactly as before.
    if (firstWrite) {
      const tool = toolByName.get(firstWrite.name)!;

      // Validate-before-pause: a write proposal that CANNOT succeed (bad uuid,
      // foreign deck, unknown note type/field) must not stall the user on a
      // doomed confirm card — the error goes straight back to the model as a
      // fully-answered tool call so it can self-correct in the next step.
      let parsedWriteArgs: unknown = {};
      let invalidWrite: string | null = null;
      try {
        parsedWriteArgs = firstWrite.arguments ? JSON.parse(firstWrite.arguments) : {};
      } catch {
        invalidWrite = `invalid tool arguments for ${firstWrite.name}`;
      }
      if (!invalidWrite && tool.validate) {
        try {
          const v = await tool.validate(toolCtx, parsedWriteArgs);
          if (!v.ok) invalidWrite = v.error;
        } catch (err) {
          // Validation infrastructure failure — fall through to the normal
          // confirm pause (execute remains the authority).
          log.warn({ err, tool: firstWrite.name }, 'ai.tool.validate_failed');
        }
      }
      if (invalidWrite) {
        messages.push({
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: firstWrite.id,
              type: 'function',
              function: { name: firstWrite.name, arguments: firstWrite.arguments },
            },
          ],
        });
        transcript.push({ role: 'assistant', content: '', toolCalls: [firstWrite] });
        emit({ type: 'tool_call', id: firstWrite.id, name: firstWrite.name, args: firstWrite.arguments, status: 'running' });
        const content = capToolResult(JSON.stringify({ ok: false, error: invalidWrite }));
        toolResultChars += content.length;
        messages.push({ role: 'tool', content, tool_call_id: firstWrite.id });
        transcript.push({ role: 'tool', content, toolCallId: firstWrite.id });
        emit({ type: 'tool_result', id: firstWrite.id, ok: false, summary: invalidWrite });
        continue; // next step — the model sees the error and retries.
      }

      // Compute the blast radius WITHOUT mutating.
      let impact: ToolImpact = {};
      try {
        impact = (await tool.dryRun?.(toolCtx, parsedWriteArgs)) ?? {};
      } catch (err) {
        log.warn({ err, tool: firstWrite.name }, 'ai.tool.dryRun_failed');
      }

      // Notebook create_card (M3): snapshot the turn's grounding so auto-
      // provenance survives /resume + reload, and enrich the confirm preview with
      // the source passages the card(s) will be linked to (AC3.2). Only for
      // create_card in notebook mode with a non-empty accumulator.
      let groundingSnapshot: MessageGrounding | undefined;
      if (notebook && firstWrite.name === 'create_card' && grounding && grounding.chunkIds.length > 0) {
        groundingSnapshot = { chunkIds: grounding.chunkIds.slice(0, GROUNDING_CAP) };
        const provenance = await resolveProvenancePreview(
          userId,
          grounding.chunkIds.slice(0, CARD_SOURCE_LINK_CAP),
        );
        if (provenance.length > 0) impact = { ...impact, provenance };
      }

      // Persist (and replay) only the pending write call as the assistant row.
      messages.push({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: firstWrite.id,
            type: 'function',
            function: { name: firstWrite.name, arguments: firstWrite.arguments },
          },
        ],
      });
      transcript.push({ role: 'assistant', content: '', toolCalls: [firstWrite], grounding: groundingSnapshot });

      emit({ type: 'tool_call', id: firstWrite.id, name: firstWrite.name, args: firstWrite.arguments, status: 'running' });
      emit({
        type: 'await_confirmation',
        toolCall: { id: firstWrite.id, name: firstWrite.name, args: firstWrite.arguments },
        impact: Object.keys(impact).length > 0 ? impact : undefined,
      });

      // Commit everything so far (parent + so-far children + this pending
      // tool_calls row) in ONE transaction (Principle 5 — no orphan tool row).
      // The turn's usage-so-far parks on the pending tool_calls row (the LAST
      // assistant row in the buffer); the resume continuation persists its own.
      await persistTranscript({
        tx: undefined,
        transcript,
        userId,
        conversationId,
        model: effectiveModel,
        usage: usageSeen
          ? { promptTokens: usagePrompt, completionTokens: usageCompletion, totalTokens: usageTotal }
          : null,
      });
      log.info({ tool: firstWrite.name, toolCallId: firstWrite.id }, 'ai.agent.suspended');
      return { kind: 'suspended' };
    }
  }

  // Citations = union-dedup across ALL search_cards / search_source / read_source
  // calls, intersected PER VARIANT with the tokens the model actually emitted
  // (`intersectSourceTokens` — extracted to ai/citations.ts so the studio
  // artifact generator shares it, Р5): card citations against the [card:<id>]
  // tokens, source citations against the [src:<sourceChunkId>] tokens. Fallback
  // to the capped union when nothing intersected (same as today — the fallback
  // stays HERE so the chat loop is behaviorally identical to its prior inline
  // form, pinned by the notebook-chat tests).
  const unionCitations = [...citationAcc.values()];
  const intersected = intersectSourceTokens(finalText, unionCitations);
  const citations: Citation[] = (intersected.length > 0 ? intersected : unionCitations).slice(
    0,
    RETRIEVE_K,
  );

  if (finalText.trim().length === 0) {
    finalText = "I couldn't complete the request within the step limit.";
  }

  // A turn aborted right at the finish line still persists nothing — keeping
  // the Stop semantics single: aborted ⇒ trailing-user recovery, never a half
  // answer that raced the Stop click.
  if (signal?.aborted) throw new Error('turn_aborted');

  emit({ type: 'citation', citations });
  // Usage frame (C1) — before `done`, only when the provider reported anything.
  if (usageSeen) {
    emit({
      type: 'usage',
      promptTokens: usagePrompt,
      completionTokens: usageCompletion,
      totalTokens: usageTotal,
    });
  }
  transcript.push({ role: 'assistant', content: finalText, citations });

  const finalMessageId = await persistTranscript({
    tx: undefined,
    transcript,
    userId,
    conversationId,
    model: effectiveModel,
    usage: usageSeen
      ? { promptTokens: usagePrompt, completionTokens: usageCompletion, totalTokens: usageTotal }
      : null,
  });
  return { kind: 'done', messageId: finalMessageId! };
}

/**
 * Persist a transcript buffer (assistant tool_calls rows + role:tool rows + the
 * final assistant text row) and bump the conversation's `updatedAt`, in ONE
 * transaction. When `tx` is supplied the inserts run in the caller's
 * transaction (resume atomicity); otherwise a fresh transaction is opened.
 * Returns the id of the LAST assistant text row inserted (the `done` messageId),
 * or `null` if the buffer held no final text row (a suspended turn).
 *
 * `model` stamps every assistant row; `usage` stamps the LAST assistant row of
 * the buffer (the final text row at `done`, or the pending tool_calls row of a
 * suspended turn — so a confirmation-split turn loses nothing: summing `usage`
 * over a conversation's assistant rows yields true totals).
 */
async function persistTranscript(args: {
  tx: Tx | undefined;
  transcript: TranscriptRow[];
  userId: string;
  conversationId: string;
  model?: string;
  usage?: MessageUsage | null;
}): Promise<string | null> {
  const { transcript, userId, conversationId, model, usage } = args;
  const lastAssistantIdx = (() => {
    for (let i = transcript.length - 1; i >= 0; i--) {
      if (transcript[i]!.role === 'assistant') return i;
    }
    return -1;
  })();
  const run = async (tx: Tx): Promise<string | null> => {
    let lastAssistantId: string | null = null;
    // Explicit strictly-increasing timestamps: Postgres `now()` is FIXED for the
    // whole transaction, so DEFAULT-stamped rows of one turn all TIE on
    // created_at and `ORDER BY created_at` returns them in arbitrary order on
    // reload — which both garbles the rendered transcript and (worse) replays
    // tool results out of order to the gateway. One millisecond per row keeps
    // the insert order the sort order, always.
    //
    // The base is anchored on the conversation's MAX(created_at), NOT the JS
    // clock alone: the user row is stamped by POSTGRES's clock, which can
    // drift from the host's (Docker VM time, e.g. after host sleep). A
    // Postgres clock AHEAD of the host would otherwise sort the whole turn
    // BEFORE the user row that started it. max+1 keeps new rows strictly
    // after everything already persisted, whatever the skew.
    const base = Math.max(Date.now(), (await maxCreatedAt(tx, conversationId)) + 1);
    for (let i = 0; i < transcript.length; i++) {
      const row = transcript[i]!;
      const usageHere = i === lastAssistantIdx ? (usage ?? null) : null;
      const createdAt = new Date(base + i);
      if (row.role === 'assistant' && row.content === '' && 'toolCalls' in row) {
        await tx.insert(messagesTable).values({
          conversationId,
          userId,
          role: 'assistant',
          content: '',
          toolCalls: row.toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
          })),
          model: model ?? null,
          usage: usageHere,
          // M3 — grounding snapshot for the suspended notebook create_card row.
          grounding: row.grounding ?? null,
          createdAt,
        });
      } else if (row.role === 'tool') {
        await tx.insert(messagesTable).values({
          conversationId,
          userId,
          role: 'tool',
          content: row.content,
          toolCallId: row.toolCallId,
          createdAt,
        });
      } else {
        const [msg] = await tx
          .insert(messagesTable)
          .values({
            conversationId,
            userId,
            role: 'assistant',
            content: row.content,
            citations: 'citations' in row ? row.citations : [],
            model: model ?? null,
            usage: usageHere,
            createdAt,
          })
          .returning({ id: messagesTable.id });
        lastAssistantId = msg!.id;
      }
    }
    await tx
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
    return lastAssistantId;
  };
  return args.tx ? run(args.tx) : db.transaction(run);
}

// ── Per-card confirm decisions (batch create_card) ───────────────────────────

/** Outcome of merging the user's per-card selections into the pending args. */
type CardSelectionOutcome =
  | { kind: 'unchanged' }
  | { kind: 'reject' }
  | { kind: 'apply'; args: Record<string, unknown>; excluded: number; edited: number };

/**
 * Merge per-card confirm decisions into a pending `create_card`'s original
 * args. Unmentioned indexes apply as proposed; `include:false` drops a card;
 * `fieldValues` replaces a card's content (inline edit). Single-card proposals
 * are addressed as index 0. ALL excluded ⇒ `reject`. Pure — no DB access; the
 * edited args still go through the tool's own validation at execute time.
 */
function applyCreateCardSelections(
  rawArgs: unknown,
  selections: ChatResumeRequest['cardSelections'],
): CardSelectionOutcome {
  if (!selections || selections.length === 0) return { kind: 'unchanged' };
  const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as Record<string, unknown>;
  const byIndex = new Map(selections.map((s) => [s.index, s]));

  if (Array.isArray(args.cards)) {
    const entries = args.cards as unknown[];
    let excluded = 0;
    let edited = 0;
    const kept: unknown[] = [];
    for (let i = 0; i < entries.length; i++) {
      const sel = byIndex.get(i);
      if (sel && sel.include === false) {
        excluded += 1;
        continue;
      }
      if (sel?.fieldValues) {
        edited += 1;
        const entry = (
          entries[i] && typeof entries[i] === 'object' ? entries[i] : {}
        ) as Record<string, unknown>;
        kept.push({ ...entry, fieldValues: sel.fieldValues });
      } else {
        kept.push(entries[i]);
      }
    }
    if (kept.length === 0) return { kind: 'reject' };
    if (excluded === 0 && edited === 0) return { kind: 'unchanged' };
    return { kind: 'apply', args: { ...args, cards: kept }, excluded, edited };
  }

  // Single-card shape — index 0 governs.
  const sel = byIndex.get(0);
  if (!sel) return { kind: 'unchanged' };
  if (sel.include === false) return { kind: 'reject' };
  if (sel.fieldValues) {
    return { kind: 'apply', args: { ...args, fieldValues: sel.fieldValues }, excluded: 0, edited: 1 };
  }
  return { kind: 'unchanged' };
}

/** Model-facing suffix describing what the user changed at confirm time. */
function confirmSelectionNote(
  selection: CardSelectionOutcome,
  feedback: string | undefined,
): string {
  const parts: string[] = [];
  if (selection.kind === 'apply') {
    if (selection.excluded > 0) {
      parts.push(
        `User excluded ${selection.excluded} of the proposed card(s) — do not re-propose them unless asked.`,
      );
    }
    if (selection.edited > 0) {
      parts.push(`User edited ${selection.edited} card(s) before applying.`);
    }
  }
  if (feedback) parts.push(`User feedback: ${feedback}`);
  return parts.length > 0 ? `\n${parts.join(' ')}` : '';
}

/**
 * The conversation's latest persisted `created_at` in epoch ms (0 when empty).
 * Anchor for every explicit row stamp — see the clock-skew note in
 * `persistTranscript`. Works on a transaction or the root db handle.
 */
async function maxCreatedAt(ex: Tx | Db, conversationId: string): Promise<number> {
  const [tip] = await ex
    .select({ maxAt: sql<Date | string | null>`max(${messagesTable.createdAt})` })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId));
  if (!tip?.maxAt) return 0;
  const t = new Date(tip.maxAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** A `created_at` strictly after everything persisted in the conversation. */
async function nextMessageStamp(ex: Tx | Db, conversationId: string): Promise<Date> {
  return new Date(Math.max(Date.now(), (await maxCreatedAt(ex, conversationId)) + 1));
}

/** Load the full persisted transcript for a conversation (oldest-first). */
async function loadHistoryRows(conversationId: string): Promise<HistoryRow[]> {
  const rows = await db
    .select({
      id: messagesTable.id,
      role: messagesTable.role,
      content: messagesTable.content,
      toolCalls: messagesTable.toolCalls,
      toolCallId: messagesTable.toolCallId,
      mentions: messagesTable.mentions,
      attachments: messagesTable.attachments,
      grounding: messagesTable.grounding,
      createdAt: messagesTable.createdAt,
    })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    // `id` tie-breaker: legacy rows persisted before explicit stamping share one
    // transaction-fixed created_at — without a tie-breaker their order flips
    // between reloads (arbitrary but stable beats arbitrary and shifting).
    .orderBy(asc(messagesTable.createdAt), asc(messagesTable.id))
    .limit(500);
  return rows as HistoryRow[];
}

/**
 * Delete the WHOLE trailing assistant turn for a conversation (S6 / AC3.4): every
 * row created AFTER the last `user` row — its assistant tool_calls rows, role:tool
 * result rows, AND the final assistant text row — in ONE user-scoped transaction.
 * Deleting only the text row would orphan its tool_calls/role:tool rows, so the
 * whole tail goes (the `messages_tool_result_uq` unique index is the backstop).
 *
 * Returns `{ ok: true, deleted }` when a `user` row exists (deleted ≥ 0), or
 * `{ ok: false }` when the conversation has NO user row → caller returns
 * `400 nothing_to_regenerate`. This is the DELETE half of the two-transaction
 * regenerate (the REPLAY half re-runs the loop) — NOT atomic with the replay.
 */
async function deleteTrailingAssistantTurn(
  conversationId: string,
  userId: string,
  content?: string,
  mentions?: MessageMention[] | null,
): Promise<{ ok: true; deleted: number } | { ok: false }> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: messagesTable.id, role: messagesTable.role, createdAt: messagesTable.createdAt })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.conversationId, conversationId),
          eq(messagesTable.userId, userId),
        ),
      )
      .orderBy(asc(messagesTable.createdAt), asc(messagesTable.id))
      .limit(1000);

    let lastUserIdx = -1;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i]!.role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return { ok: false as const };

    // Edit-and-rerun (B2 / AC4.2): when an edited `content` is supplied, UPDATE the
    // last user row IN PLACE — INSIDE this same transaction, after `lastUserIdx` is
    // resolved and BEFORE the delete loop. User-scoped, single row; it does NOT
    // change the row's role or tail position, so the torn-tail recovery invariant
    // is untouched and TX2 replays over the edited user row → clean history. Absent
    // `content` ⇒ no UPDATE ⇒ behavior IDENTICAL to today's regenerate. Same rule
    // for `mentions` (C7): `undefined` ⇒ keep the stored snapshot (replay-faithful);
    // a resolved value (incl. null) ⇒ overwrite.
    if (content !== undefined || mentions !== undefined) {
      const set: { content?: string; mentions?: MessageMention[] | null } = {};
      if (content !== undefined) set.content = content;
      if (mentions !== undefined) set.mentions = mentions;
      await tx
        .update(messagesTable)
        .set(set)
        .where(and(eq(messagesTable.id, rows[lastUserIdx]!.id), eq(messagesTable.userId, userId)));
    }

    const toDelete = rows.slice(lastUserIdx + 1).map((r) => r.id);
    for (const id of toDelete) {
      await tx
        .delete(messagesTable)
        .where(and(eq(messagesTable.id, id), eq(messagesTable.userId, userId)));
    }
    return { ok: true as const, deleted: toDelete.length };
  });
}

/** The pending tool call + the persisted assistant row it lives on (M3 needs the
 *  row id as the provenance messageId, and its grounding snapshot). */
interface PendingToolCall extends AssembledToolCall {
  /** The persisted assistant tool_calls row's id (provenance messageId). */
  rowId: string;
  /** The notebook-turn grounding snapshot on that row (M3); null otherwise. */
  grounding: MessageGrounding | null;
}

/**
 * Find the pending tool call named by `resumeToolCallId` — it must be one of the
 * `tool_calls` on a persisted assistant row in THIS conversation (the ownership
 * chain: the rows were already user+conversation scoped by the caller). Returns
 * the matching call record (+ its row id + grounding for M3 provenance) or
 * `null` (→ 404, never trust the client's id).
 */
function findPendingToolCall(
  rows: HistoryRow[],
  resumeToolCallId: string,
): PendingToolCall | null {
  for (const r of rows) {
    if (r.role === 'assistant' && r.toolCalls) {
      const match = r.toolCalls.find((tc) => tc.id === resumeToolCallId);
      if (match) {
        return {
          id: match.id,
          name: match.name,
          arguments: match.arguments,
          rowId: r.id,
          grounding: r.grounding,
        };
      }
    }
  }
  return null;
}

/**
 * The id of the most recent assistant TEXT row in a conversation (null
 * tool_calls), for the idempotent resume no-op `done`. Returns `null` if the
 * suspended turn never produced a final text row yet (the client falls back to
 * an empty id — the no-op `done` is terminal + cosmetic).
 */
async function lastAssistantTextId(conversationId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: messagesTable.id })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.conversationId, conversationId),
        eq(messagesTable.role, 'assistant'),
        isNull(messagesTable.toolCalls),
      ),
    )
    .orderBy(desc(messagesTable.createdAt), desc(messagesTable.id))
    .limit(1);
  return row?.id ?? null;
}

/**
 * C3 — kick off auto-titling for an untitled conversation, CONCURRENTLY with
 * the agent turn. Returns a promise resolving to the new title or `null`;
 * never rejects. Resolves `null` immediately when the conversation is already
 * titled. The title source is the OLDEST user message (covers both the first
 * turn and a retry after a previously-failed titling) — for `/stream` the
 * caller has already inserted the current user row.
 */
function maybeStartTitle(args: {
  conv: { id: string; title: string | null };
  userId: string;
  model: string | undefined;
  log: Logger;
}): Promise<string | null> {
  const { conv, userId, model, log } = args;
  if (conv.title !== null) return Promise.resolve(null);
  return (async () => {
    const [oldest] = await db
      .select({ content: messagesTable.content })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.userId, userId),
          eq(messagesTable.conversationId, conv.id),
          eq(messagesTable.role, 'user'),
        ),
      )
      .orderBy(asc(messagesTable.createdAt))
      .limit(1);
    if (!oldest || oldest.content.trim().length === 0) return null;
    return generateConversationTitle(oldest.content, { model, log });
  })().catch(() => null);
}

/**
 * Await the title promise after the agent turn, persist it (the `title IS NULL`
 * guard yields to a concurrent manual rename), and emit the `title` frame —
 * before the caller's `done`. Best-effort: never throws into the stream.
 */
async function finishTitle(
  titlePromise: Promise<string | null>,
  conversationId: string,
  userId: string,
  emit: (event: ChatStreamEvent) => void,
): Promise<void> {
  try {
    const title = await titlePromise;
    if (!title) return;
    const [updated] = await db
      .update(conversations)
      .set({ title })
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
          isNull(conversations.title),
        ),
      )
      .returning({ id: conversations.id });
    if (updated) emit({ type: 'title', title });
  } catch {
    // Best-effort — a titling failure must never disturb the turn.
  }
}

// ── Per-conversation turn serialization ───────────────────────────────────────
// Two agent turns running concurrently on ONE conversation interleave their
// persisted rows and corrupt the replay history (observed in the wild: refresh
// mid-stream → the abandoned server loop keeps running → regenerate starts a
// second live turn → the gateway 400s the next resume with "No tool output
// found"). In-memory, single-instance — same scaling caveat + swap path as
// rate-limit.ts (Redis for multi-instance).
interface TurnLock {
  controller: AbortController;
  since: number;
}
const activeTurns = new Map<string, TurnLock>();
/** A lock older than this is presumed leaked/zombie: abort it and take over. */
const TURN_LOCK_TTL_MS = 5 * 60_000;

/** Acquire the per-conversation turn lock, or `null` when a live turn holds it. */
function acquireTurnLock(conversationId: string): AbortController | null {
  const cur = activeTurns.get(conversationId);
  if (cur) {
    if (Date.now() - cur.since < TURN_LOCK_TTL_MS) return null;
    cur.controller.abort(); // zombie — kill it and take over.
  }
  const controller = new AbortController();
  activeTurns.set(conversationId, { controller, since: Date.now() });
  return controller;
}

/** Release the lock — only if this controller still owns it (no steal-release). */
function releaseTurnLock(conversationId: string, controller: AbortController): void {
  const cur = activeTurns.get(conversationId);
  if (cur && cur.controller === controller) activeTurns.delete(conversationId);
}

/**
 * Wrap an agent-turn runner in the raw SSE `Response(ReadableStream)` boilerplate
 * + the post-flush error boundary (SHOULD-FIX #7): ANY error inside `run`
 * becomes a terminal `event: error` frame; nothing throws into Elysia's
 * `.onError` (which can't rewrite an event-stream body). `run` returns the turn
 * outcome — a `done` outcome already emitted its `done` frame inside the loop;
 * a `suspended` outcome closes the stream WITHOUT a `done`.
 *
 * `opts.abort` is the turn's lock controller: a client disconnect (the request
 * signal aborting, or Bun cancelling the ReadableStream) aborts it so the
 * server loop STOPS instead of running on as a zombie writer; an aborted turn
 * closes quietly (no error frame — there is no reader). `opts.onSettled` always
 * runs once the turn settles (lock release).
 */
function sseResponse(
  log: Logger,
  run: (emit: (event: ChatStreamEvent) => void) => Promise<AgentTurnOutcome>,
  opts: { abort?: AbortController; requestSignal?: AbortSignal; onSettled?: () => void } = {},
): Response {
  const encoder = new TextEncoder();
  const abort = opts.abort;
  if (opts.requestSignal && abort) {
    if (opts.requestSignal.aborted) abort.abort();
    else opts.requestSignal.addEventListener('abort', () => abort.abort(), { once: true });
  }
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let dead = false;
      const emit = (event: ChatStreamEvent) => {
        if (dead || abort?.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(sseFrame(event)));
        } catch {
          dead = true; // consumer gone — keep the turn logic running silently.
        }
      };
      try {
        const outcome = await run(emit);
        if (outcome.kind === 'done') {
          emit({ type: 'done', messageId: outcome.messageId });
        }
        // 'suspended' → close WITHOUT a `done` (the turn is paused for confirm).
      } catch (err) {
        if (abort?.signal.aborted) {
          // Cancelled turn (Stop / disconnect / superseded) — not an error.
          log.info({ err: err instanceof Error ? err.message : err }, 'ai.chat.turn_aborted');
        } else {
          log.error({ err }, 'ai.chat.stream_failed');
          const code =
            err instanceof Error && /^(chat_stream_torn|chat_failed|ai_disabled)/.test(err.message)
              ? err.message
              : 'chat_failed';
          emit({ type: 'error', message: code });
        }
      } finally {
        opts.onSettled?.();
        try {
          controller.close();
        } catch {
          // already closed.
        }
      }
    },
    cancel() {
      // The consumer went away (client disconnect) — stop the turn.
      abort?.abort();
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    },
  });
}

export const aiModule = new Elysia({ prefix: '/ai' })
  .use(authPlugin)
  // Reports both independent switches + the active model config so the client
  // can render the right setup notice. `degraded` is true when the boot-time
  // dimension assertion disabled embedding writes (column dim ≠ EMBEDDING_DIM).
  .get(
    '/status',
    () => ({
      embeddingEnabled: embeddingEnabled && !embeddingDegraded(),
      chatEnabled,
      // NotebookLM sources (M1). For M1 this equals embeddingEnabled (a source
      // must be embedded to be useful) minus the dim-degrade state. No keys ⇒
      // the /notebooks screen shows a setup notice + ingest parse-and-parks.
      notebooksEnabled: notebooksEnabled && !embeddingDegraded(),
      webSearchEnabled: isWebSearchEnabled(),
      // Gates the composer's deep-research toggle: the mode is meaningless
      // without the fetch_page tool (CHAT_FETCH_PAGE kill-switch).
      fetchPageEnabled: isFetchPageEnabled(),
      // Image attachments offered only when vision is on (CHAT_VISION
      // kill-switch for gateways without multimodal support). Text-file
      // attachments don't need it and are always available with chat.
      visionEnabled: isVisionEnabled(),
      embeddingModel: env.ai.EMBEDDING_MODEL,
      chatModel: env.ai.CHAT_MODEL,
      embeddingDim: env.ai.EMBEDDING_DIM,
      degraded: embeddingDegraded(),
      // Model allow-list for the per-turn picker (AC2.2). `[]` when CHAT_MODELS
      // is unset ⇒ the picker is hidden. ONLY {id,label,default} — never a
      // secret (no CHAT_API_KEY / base URL ever leaves the server, P3).
      models: chatModels,
    }),
    { auth: true },
  )
  // Enqueue all of the caller's cards for (re)indexing (user-scoped backfill).
  // Non-blocking: returns `{ queued }` immediately and drains in background.
  // `queued` is 0 when embeddings are unconfigured/degraded (no-op).
  .post(
    '/reindex',
    async ({ user }) => {
      const queued = await reindexUser(user.id);
      // Also re-embed any stale library document vectors (L4 §5 — a model swap
      // leaves document chunks stale; the card queue above only walks cards).
      // Fire-and-forget: documents read their SoT text, never re-parse; parks
      // when embeddings are off/degraded.
      void reconcileDocumentsOnStartup({ userId: user.id });
      return { queued };
    },
    { auth: true },
  );

// Chat threads + the SSE stream endpoint live under `/chat`. Kept in the same
// module file for v1 cohesion (plan §198: split only past ~400 lines), but as a
// distinct prefixed Elysia instance to mirror the one-prefix-per-module
// convention the rest of apps/api uses.
export const chatModule = new Elysia({ prefix: '/chat' })
  .use(authPlugin)
  // List the caller's conversations — pinned first, then newest-first (C4).
  // `?notebookId=<uuid>` scopes to ONE notebook's threads (ownership-checked —
  // a foreign/missing notebook 404s). WITHOUT the param the GLOBAL rail is
  // returned: `notebook_id IS NULL` only, so notebook threads never leak into it.
  .get(
    '/conversations',
    async ({ user, query, status }) => {
      const notebookId = query.notebookId;
      if (notebookId) {
        const [nb] = await db
          .select({ id: notebooks.id })
          .from(notebooks)
          .where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, user.id)))
          .limit(1);
        if (!nb) return status(404, { error: 'not_found' });
        const rows = await db
          .select()
          .from(conversations)
          .where(
            and(eq(conversations.userId, user.id), eq(conversations.notebookId, notebookId)),
          )
          .orderBy(desc(conversations.pinned), desc(conversations.updatedAt));
        return { items: rows };
      }
      const rows = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.userId, user.id), isNull(conversations.notebookId)))
        .orderBy(desc(conversations.pinned), desc(conversations.updatedAt));
      return { items: rows };
    },
    { auth: true, query: t.Object({ notebookId: t.Optional(t.String({ format: 'uuid' })) }) },
  )
  // Create a conversation. `title` is optional (the client may title it from the
  // first message). `notebookId` (optional) BINDS the thread to a notebook —
  // ownership-checked (a foreign/missing notebook 404s); the notebook chat then
  // grounds on that notebook's sources.
  .post(
    '/conversations',
    async ({ user, body, status }) => {
      if (body.notebookId) {
        const [nb] = await db
          .select({ id: notebooks.id })
          .from(notebooks)
          .where(and(eq(notebooks.id, body.notebookId), eq(notebooks.userId, user.id)))
          .limit(1);
        if (!nb) return status(404, { error: 'not_found' });
      }
      const [row] = await db
        .insert(conversations)
        .values({ userId: user.id, title: body.title ?? null, notebookId: body.notebookId ?? null })
        .returning();
      return row!;
    },
    {
      auth: true,
      body: t.Object({
        title: t.Optional(t.String({ maxLength: 200 })),
        notebookId: t.Optional(t.String({ format: 'uuid' })),
      }),
    },
  )
  // Fetch one conversation + its messages (oldest-first). 404 if foreign.
  .get(
    '/conversations/:id',
    async ({ user, params, status }) => {
      const [conv] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, params.id), eq(conversations.userId, user.id)))
        .limit(1);
      if (!conv) return status(404, { error: 'not_found' });
      const msgs = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, conv.id))
        .orderBy(asc(messagesTable.createdAt), asc(messagesTable.id));
      return { conversation: conv, messages: msgs };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // Rename and/or pin a conversation (AC3.1 + C4). User-scoped via
  // `and(...userId)` — a foreign id matches 0 rows → 404. `title` is
  // length-bounded (1..200); an empty or over-200 title fails Elysia body
  // validation → 400 ValidationError. A body carrying NEITHER field → 400
  // `nothing_to_update`. `updatedAt` bumps ONLY on a title change — pin/unpin
  // must not reshuffle recency in the thread rail's date groups.
  .patch(
    '/conversations/:id',
    async ({ user, params, body, status }) => {
      const set: { title?: string; pinned?: boolean; updatedAt?: Date } = {};
      if (body.title !== undefined) {
        set.title = body.title;
        set.updatedAt = new Date();
      }
      if (body.pinned !== undefined) set.pinned = body.pinned;
      if (Object.keys(set).length === 0) return status(400, { error: 'nothing_to_update' });
      const [row] = await db
        .update(conversations)
        .set(set)
        .where(and(eq(conversations.id, params.id), eq(conversations.userId, user.id)))
        .returning();
      if (!row) return status(404, { error: 'not_found' });
      return row;
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        pinned: t.Optional(t.Boolean()),
      }),
    },
  )
  // Delete a conversation (messages cascade). 404 if foreign.
  .delete(
    '/conversations/:id',
    async ({ user, params, status }) => {
      const [deleted] = await db
        .delete(conversations)
        .where(and(eq(conversations.id, params.id), eq(conversations.userId, user.id)))
        .returning({ id: conversations.id });
      if (!deleted) return status(404, { error: 'not_found' });
      return { ok: true };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // Agentic tool-calling chat over SSE (Decision 4 + agentic milestone). Returns
  // a raw `Response(ReadableStream, text/event-stream)` — intentionally OUTSIDE
  // the Eden type graph (the typed RPC client can't consume a stream). The web
  // client reaches this via a hand-written fetch+reader (Slice 5).
  //
  // Flow: persist the user message → build [system, ...history, user] → run the
  // shared `runAgentTurn` loop: emit `reasoning`/`token` deltas, assemble
  // streamed tool_calls (index-keyed), execute READ tools server-side, emit
  // `tool_call`/`tool_result`, feed results back, continue. On `finish:stop` emit
  // ONE union-deduped `citation` event, then commit the ENTIRE transcript in ONE
  // end-of-turn transaction → `event: done`. If a WRITE/SRS tool is hit, the loop
  // emits `await_confirmation`, commits the transcript up to the pending
  // tool_calls row, and SUSPENDS (no `done`) — the user resumes via
  // POST .../resume. A dropped stream persists nothing. Reasoning is streamed
  // only, never persisted. Errors after the first flushed byte become a terminal
  // `event: error` frame (NEVER reach app.ts's `.onError`).
  .post(
    '/conversations/:id/stream',
    async ({ user, params, body, status, store, request }) => {
      // Pre-flush gate: chat off → 503 (effective check so the injected test stub
      // flips it on). Nothing flushed yet, so a normal JSON body is fine.
      if (!isChatEnabled()) {
        return status(503, { error: 'ai_disabled' });
      }

      // An empty message with NO attachments has nothing to answer.
      if (body.content.trim().length === 0 && !(body.attachments && body.attachments.length > 0)) {
        return status(400, { error: 'empty_message' });
      }

      // Pre-flush: validate the requested model against the allow-list. Unknown
      // model + a non-empty allow-list → 400 (nothing flushed, normal JSON).
      const resolved = resolveChatModel(body.model);
      if (!resolved.ok) return status(400, { error: 'invalid_model' });
      const model = resolved.model;

      // Pre-flush: ownership check. 404 if foreign/missing (normal JSON path).
      const [conv] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, params.id), eq(conversations.userId, user.id)))
        .limit(1);
      if (!conv) return status(404, { error: 'not_found' });

      // Pre-flush: per-conversation serialization. A live turn already running
      // on this conversation → 409 BEFORE the user row is inserted (the client
      // keeps the draft and surfaces a "turn in progress" notice).
      const lock = acquireTurnLock(conv.id);
      if (!lock) return status(409, { error: 'turn_in_progress' });

      const userQuery = body.content;
      const log = (store as { log?: typeof rootLogger }).log ?? rootLogger;

      try {
        // Resolve the per-turn deck scope (AC3.7), composer mentions (C7),
        // attachments and the user's standing instructions (C5) BEFORE
        // streaming. Foreign deck ⇒ empty scope (not global fallback); absent ⇒
        // undefined (global). Foreign/unverified attachment media is dropped.
        const [{ deckIds, deckName }, mentions, attachments, userInstructions, notebook] =
          await Promise.all([
            resolveDeckScope(user.id, body.deckId),
            resolveMentions(user.id, body.mentionedCardIds),
            resolveAttachments(user.id, body.attachments),
            loadAgentInstructions(user.id),
            resolveNotebookScope(user.id, conv, body.sourceIds),
          ]);

        // Persist the user's message BEFORE streaming (it always happened). The
        // stored content stays clean — mentions/attachments ride their columns.
        // Explicit stamp: a Postgres clock BEHIND the host would otherwise sort
        // this row before the PREVIOUS turn's (host-stamped) answer rows.
        await db.insert(messagesTable).values({
          conversationId: conv.id,
          userId: user.id,
          role: 'user',
          content: userQuery,
          mentions,
          attachments,
          createdAt: await nextMessageStamp(db, conv.id),
        });

        const webOn = isWebSearchEnabled();

        // C3 — start auto-titling concurrently with the turn (no-op when titled).
        const titlePromise = maybeStartTitle({ conv, userId: user.id, model, log });

        return sseResponse(
          log,
          async (emit) => {
            // Build messages = [system, (summary), ...history, user]. History is
            // the full persisted transcript minus the user turn we just inserted;
            // past the compression threshold the older turns replay as ONE cached
            // summary note instead of verbatim rows (C6).
            const priorRows = await loadHistoryRows(conv.id);
            const { recentRows, summaryNote } = await compressHistory(
              conv,
              priorRows.slice(0, -1),
              { model, log },
            );
            // Data URLs for the most recent images across the replayed history
            // + this turn (older ones degrade to text placeholders).
            const imageDataUrls = await loadImagePartsMap([
              ...recentRows.map((r) => (r.role === 'user' ? r.attachments : null)),
              attachments,
            ]);
            // Deep-research MODE (composer toggle): meaningless without the
            // fetch_page tool, so the flag is effective only when it's offered.
            // Notebook mode has no research/deck scope — both are ignored there.
            const researchOn = !notebook && body.research === true && isFetchPageEnabled();
            const system = notebook
              ? buildAgentSystemPrompt({
                  webSearchEnabled: webOn,
                  userInstructions,
                  notebook: { title: notebook.title, sourceTitles: notebook.sourceTitles },
                })
              : buildAgentSystemPrompt({
                  webSearchEnabled: webOn,
                  fetchPageEnabled: isFetchPageEnabled(),
                  researchMode: researchOn,
                  deckScopeName: deckName,
                  userInstructions,
                });
            const startMessages: AgentChatMessage[] = [
              { role: 'system', content: system },
              ...(summaryNote ? [{ role: 'system' as const, content: summaryNote }] : []),
              ...reconstructHistory(recentRows, undefined, imageDataUrls),
              {
                role: 'user',
                content: buildUserContent(
                  appendMentionBlock(userQuery, mentions),
                  attachments,
                  imageDataUrls,
                ),
              },
            ];

            const outcome = await runAgentTurn({
              userId: user.id,
              conversationId: conv.id,
              log,
              emit,
              startMessages,
              webSearchEnabled: webOn,
              model,
              deckIds: notebook ? undefined : deckIds,
              signal: lock.signal,
              research: researchOn,
              notebook,
            });
            // Title frame (if any) lands before the caller's `done` — also on a
            // suspended outcome (the stream is still open until close).
            await finishTitle(titlePromise, conv.id, user.id, emit);
            return outcome;
          },
          {
            abort: lock,
            requestSignal: request.signal,
            onSettled: () => releaseTurnLock(conv.id, lock),
          },
        );
      } catch (err) {
        // Pre-flush failure after the lock was taken — release it or the
        // conversation stays 409-locked until the TTL.
        releaseTurnLock(conv.id, lock);
        throw err;
      }
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        // minLength 0: an attachment-only message is valid (the handler 400s an
        // empty message with NO attachments).
        content: t.String({ maxLength: 8000 }),
        model: t.Optional(t.String({ maxLength: 200 })),
        deckId: t.Optional(t.String({ format: 'uuid' })),
        // Deep-research mode toggle (raised step/budget caps + research prompt).
        research: t.Optional(t.Boolean()),
        // Composer @-mentions (C7) — user-scoped, foreign ids silently dropped.
        mentionedCardIds: t.Optional(t.Array(t.String({ format: 'uuid' }), { maxItems: 8 })),
        // Notebook workspace (M2): the per-turn SOURCE scope (workspace
        // checkboxes). Intersected server-side with the notebook's own ready
        // sources (foreign dropped); ignored for a global conversation.
        sourceIds: t.Optional(t.Array(t.String({ format: 'uuid' }), { maxItems: 50 })),
        // Composer attachments: image media refs (resolved + ownership-checked
        // server-side) and inline text files (re-capped server-side).
        attachments: t.Optional(
          t.Array(
            t.Union([
              t.Object({
                kind: t.Literal('image'),
                mediaId: t.String({ format: 'uuid' }),
                name: t.Optional(t.String({ maxLength: 200 })),
              }),
              t.Object({
                kind: t.Literal('text'),
                name: t.String({ minLength: 1, maxLength: 200 }),
                text: t.String({ minLength: 1, maxLength: 20000 }),
              }),
            ]),
            { maxItems: 4 },
          ),
        ),
      }),
    },
  )
  // Resume a turn that paused on a write/SRS tool (`await_confirmation`). Same
  // raw SSE contract. Body: { resumeToolCallId, decision }. User-scoped — a
  // foreign conversation 404s; the `resumeToolCallId` is validated against the
  // persisted assistant `tool_calls` row IN THIS conversation (never trust the
  // client id).
  //
  // Apply: execute the pending write/SRS tool + persist its `role:tool` result
  // row in ONE transaction (so a unique-index violation on
  // `messages_tool_result_uq` rolls the mutation back too — atomic double-apply
  // guard), then CONTINUE the shared loop to `done`. Reject: persist a
  // "user rejected" `role:tool` row, continue to `done`. Idempotent: a
  // `resumeToolCallId` already answered by a `role:tool` row → no-op terminal
  // `done` (never double-execute), backed by the partial unique index.
  .post(
    '/conversations/:id/resume',
    async ({ user, params, body, status, store, request }) => {
      if (!isChatEnabled()) {
        return status(503, { error: 'ai_disabled' });
      }

      // Same pre-flush model validation as /stream (AC2.5 — the continuation
      // uses the model the client carried in the resume body).
      const resolved = resolveChatModel(body.model);
      if (!resolved.ok) return status(400, { error: 'invalid_model' });
      const model = resolved.model;

      const [conv] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, params.id), eq(conversations.userId, user.id)))
        .limit(1);
      if (!conv) return status(404, { error: 'not_found' });

      // Per-conversation serialization (same as /stream).
      const lock = acquireTurnLock(conv.id);
      if (!lock) return status(409, { error: 'turn_in_progress' });

      const log = (store as { log?: typeof rootLogger }).log ?? rootLogger;
      const { resumeToolCallId, decision } = body;

      // Resolve the per-turn deck scope for the continuation (AC3.7) + the
      // user's standing instructions (C5 — the continuation prompt must match).
      // NOTE: a throw between the lock acquire and sseResponse leaks the lock —
      // self-healed by the TTL takeover (5 min), acceptable for a DB-down edge.
      const [{ deckIds, deckName }, userInstructions, notebook] = await Promise.all([
        resolveDeckScope(user.id, body.deckId),
        loadAgentInstructions(user.id),
        resolveNotebookScope(user.id, conv, body.sourceIds),
      ]);

      // Load the full transcript ONCE (history mapping + validation share it).
      const priorRows = await loadHistoryRows(conv.id);

      // Validate the resumeToolCallId against a persisted assistant tool_calls
      // row in THIS conversation (ownership chain user→conversation→tool_calls).
      const pending = findPendingToolCall(priorRows, resumeToolCallId);
      if (!pending) {
        // No assistant tool_calls row in this conversation names that id → 404.
        releaseTurnLock(conv.id, lock);
        return status(404, { error: 'unknown_tool_call' });
      }

      // Per-card confirm decisions (create_card only): merge the user's
      // selections into the pending args. ALL cards excluded ⇒ the apply
      // degrades to a plain reject. `feedback` rides into the tool result on
      // BOTH paths so the model can act on requested edits.
      const feedback =
        typeof body.feedback === 'string' && body.feedback.trim().length > 0
          ? body.feedback.trim()
          : undefined;
      let selection: CardSelectionOutcome = { kind: 'unchanged' };
      if (pending.name === 'create_card' && decision === 'apply') {
        let parsedForSelection: unknown = {};
        try {
          parsedForSelection = pending.arguments ? JSON.parse(pending.arguments) : {};
        } catch {
          // Unparseable args fail inside the apply path as before.
        }
        selection = applyCreateCardSelections(parsedForSelection, body.cardSelections);
      }
      const effectiveDecision = selection.kind === 'reject' ? 'reject' : decision;
      const selectionNote = confirmSelectionNote(selection, feedback);

      // Idempotency (app-level check; the partial unique index is the backstop):
      // an already-answered tool call → terminal no-op `done` carrying the latest
      // assistant text id (never re-execute).
      const alreadyAnswered = priorRows.some(
        (r) => r.role === 'tool' && r.toolCallId === resumeToolCallId,
      );

      const webOn = isWebSearchEnabled();

      return sseResponse(log, async (emit) => {
        if (alreadyAnswered) {
          // Idempotent no-op: sseResponse emits the terminal `done` for us.
          return { kind: 'done', messageId: (await lastAssistantTextId(conv.id)) ?? '' };
        }

        // Execute (apply) or record a rejection for the pending tool call, then
        // continue the loop. The role:tool insert runs in the SAME transaction
        // as the mutation (apply) so a concurrent double-apply hits the unique
        // index and rolls back the mutation too.
        const toolCtx: ToolContext = { userId: user.id, log };
        let toolCardIds: string[] | undefined;

        if (effectiveDecision === 'apply') {
          const registry = buildToolRegistry({ webSearchEnabled: webOn, notebook: !!notebook });
          const tool = registry.find((tl) => tl.name === pending.name);

          emit({ type: 'tool_call', id: pending.id, name: pending.name, args: pending.arguments, status: 'running' });

          let result: ToolResult;
          if (!tool || tool.kind === 'read') {
            result = { ok: false, error: `not a confirmable tool: ${pending.name}` };
          } else {
            let parsedArgs: unknown = {};
            let parseFailed = false;
            try {
              parsedArgs = pending.arguments ? JSON.parse(pending.arguments) : {};
            } catch {
              parseFailed = true;
            }
            if (parseFailed) {
              result = { ok: false, error: `invalid tool arguments for ${pending.name}` };
            } else {
              // Per-card selections override the executed args (the PERSISTED
              // assistant row keeps the model's original proposal — the result
              // text tells the model what the user actually applied/changed).
              const execArgs = selection.kind === 'apply' ? selection.args : parsedArgs;
              // ONE transaction: the mutation + the role:tool insert. A duplicate
              // (conversation_id, tool_call_id) for role='tool' violates
              // messages_tool_result_uq → the whole tx (incl. the mutation) rolls
              // back. So a racing/double Apply never double-executes.
              try {
                result = await db.transaction(async (tx) => {
                  const r = await tool.execute({ ...toolCtx, tx }, execArgs);
                  const content = capToolResult(
                    r.ok ? `${r.text}${selectionNote}` : JSON.stringify({ ok: false, error: r.error }),
                  );
                  await tx.insert(messagesTable).values({
                    conversationId: conv.id,
                    userId: user.id,
                    role: 'tool',
                    content,
                    toolCallId: resumeToolCallId,
                    // Explicit stamp (not the DB default): Postgres clock skew
                    // must never sort this row BEFORE its pending assistant row.
                    createdAt: await nextMessageStamp(tx, conv.id),
                  });
                  // M3 auto-provenance: a notebook create_card links the created
                  // cards to the passages the turn read (the grounding snapshot on
                  // the pending assistant row). Same tx as execute + role:tool so
                  // a double-apply rolls the edges back too. Reject/all-excluded
                  // never reach this branch; no grounding ⇒ no-op.
                  if (
                    r.ok &&
                    pending.name === 'create_card' &&
                    conv.notebookId &&
                    r.cardIds &&
                    r.cardIds.length > 0 &&
                    pending.grounding &&
                    pending.grounding.chunkIds.length > 0
                  ) {
                    await writeCardProvenance(tx, {
                      userId: user.id,
                      cardIds: r.cardIds,
                      chunkIds: pending.grounding.chunkIds,
                      // notebookId is the conversation's notebook (where the card
                      // was born) — sources no longer carry a notebook.
                      notebookId: conv.notebookId,
                      conversationId: conv.id,
                      messageId: pending.rowId,
                    });
                  }
                  return r;
                });
              } catch (txErr) {
                // Unique-violation (double-apply race) or a real mutation error.
                // Surface as a non-throwing tool failure so the loop continues to
                // a `done` rather than tearing the whole stream.
                log.warn({ err: txErr, tool: pending.name }, 'ai.resume.apply_failed');
                result = {
                  ok: false,
                  error: txErr instanceof Error ? txErr.message : 'apply_failed',
                };
                // A failed apply leaves NO role:tool row (tx rolled back). Persist
                // a failure row OUTSIDE the tx so the loop's history is consistent
                // and the call is marked answered (idempotency). Best-effort: a
                // duplicate here means another resume already answered it.
                try {
                  await db.insert(messagesTable).values({
                    conversationId: conv.id,
                    userId: user.id,
                    role: 'tool',
                    content: capToolResult(JSON.stringify({ ok: false, error: result.error })),
                    toolCallId: resumeToolCallId,
                    createdAt: await nextMessageStamp(db, conv.id),
                  });
                } catch {
                  // already answered by a racing resume — fine.
                }
              }
            }
            if (result.ok) toolCardIds = result.cardIds;
          }

          emit({
            type: 'tool_result',
            id: pending.id,
            ok: result.ok,
            // The applied write's result text (e.g. "Created 5 notes …") is
            // inspectable in the step body, same as read tools.
            summary: result.ok ? capToolResult(`${result.text}${selectionNote}`) : result.error,
          });

          // RAG index hook — enqueue created/updated cards AFTER the commit.
          enqueueToolCardsForIndex(toolCardIds);
        } else {
          // Reject (explicit, or an apply whose per-card selections excluded
          // EVERY card): record a "user rejected" tool result so the model can
          // answer without the mutation. `feedback` rides along so "propose
          // edits" reaches the model. Idempotent via the partial unique index.
          const rejectionContent = JSON.stringify({
            ok: false,
            error: 'user_rejected',
            ...(feedback ? { feedback } : {}),
          });
          try {
            await db.insert(messagesTable).values({
              conversationId: conv.id,
              userId: user.id,
              role: 'tool',
              content: rejectionContent,
              toolCallId: resumeToolCallId,
              createdAt: await nextMessageStamp(db, conv.id),
            });
          } catch {
            // already answered — idempotent.
          }
          emit({
            type: 'tool_result',
            id: pending.id,
            ok: false,
            summary: feedback ? `user_rejected — ${feedback}` : 'user_rejected',
          });
        }

        // Continue the shared loop. Rebuild messages from the NOW-updated
        // persisted transcript; the dangling-tool_calls guard is bypassed for
        // the exact id we just answered (so the pending assistant tool_calls row
        // is kept — it now has its answering role:tool row). Compression (C6)
        // never touches the tail, so the pending cluster stays verbatim.
        const updatedRows = await loadHistoryRows(conv.id);
        const { recentRows, summaryNote } = await compressHistory(conv, updatedRows, {
          model,
          log,
        });
        const imageDataUrls = await loadImagePartsMap(
          recentRows.map((r) => (r.role === 'user' ? r.attachments : null)),
        );
        // The web sends the toggle state on resume too, so a research turn's
        // post-confirmation continuation keeps the raised caps + prompt. Notebook
        // mode has no research/deck scope — both ignored there.
        const researchOn = !notebook && body.research === true && isFetchPageEnabled();
        const system = notebook
          ? buildAgentSystemPrompt({
              webSearchEnabled: webOn,
              userInstructions,
              notebook: { title: notebook.title, sourceTitles: notebook.sourceTitles },
            })
          : buildAgentSystemPrompt({
              webSearchEnabled: webOn,
              fetchPageEnabled: isFetchPageEnabled(),
              researchMode: researchOn,
              deckScopeName: deckName,
              userInstructions,
            });
        const startMessages: AgentChatMessage[] = [
          { role: 'system', content: system },
          ...(summaryNote ? [{ role: 'system' as const, content: summaryNote }] : []),
          ...reconstructHistory(recentRows, resumeToolCallId, imageDataUrls),
        ];

        return runAgentTurn({
          userId: user.id,
          conversationId: conv.id,
          log,
          emit,
          startMessages,
          webSearchEnabled: webOn,
          model,
          deckIds: notebook ? undefined : deckIds,
          signal: lock.signal,
          research: researchOn,
          notebook,
        });
      }, {
        abort: lock,
        requestSignal: request.signal,
        onSettled: () => releaseTurnLock(conv.id, lock),
      });
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        resumeToolCallId: t.String({ minLength: 1, maxLength: 256 }),
        decision: t.Union([t.Literal('apply'), t.Literal('reject')]),
        model: t.Optional(t.String({ maxLength: 200 })),
        deckId: t.Optional(t.String({ format: 'uuid' })),
        research: t.Optional(t.Boolean()),
        // Notebook workspace (M2): per-turn source scope for the continuation.
        sourceIds: t.Optional(t.Array(t.String({ format: 'uuid' }), { maxItems: 50 })),
        // Per-card decisions for a pending create_card (apply path): exclude /
        // inline-edit individual cards of the proposed batch.
        cardSelections: t.Optional(
          t.Array(
            t.Object({
              index: t.Integer({ minimum: 0, maximum: 99 }),
              include: t.Boolean(),
              fieldValues: t.Optional(t.Record(t.String(), t.String({ maxLength: 8000 }))),
            }),
            { maxItems: 40 },
          ),
        ),
        // Optional note to the model ("propose edits") — lands in the tool result.
        feedback: t.Optional(t.String({ maxLength: 2000 })),
      }),
    },
  )
  // Regenerate the LAST assistant turn (S6 / AC3.4). Re-runs the last USER
  // message with the CURRENTLY-selected model (doubles as "retry with a deeper
  // reasoning level"; it does NOT re-prompt the user). Same raw SSE contract +
  // the same pre-flush gates as /stream (ownership 404, chat 503, model 400).
  //
  // TWO transactions, NOT atomic (documented):
  //   TX1 (delete): remove the WHOLE trailing assistant turn (all rows after the
  //     last `user` row — tool_calls + role:tool + final text → no orphan tool
  //     rows). No `user` row → 400 nothing_to_regenerate (nothing flushed yet).
  //   TX2 (replay): rebuild [system, ...history-through-that-user-row] and re-run
  //     `runAgentTurn` via the same sseResponse wrapper (its own end-of-turn
  //     commit). If TX2 fails after TX1 committed, the conversation is left with a
  //     trailing user row + no assistant row — IDENTICAL to the abort tail, so the
  //     one "stopped — regenerate?" recovery affordance covers both.
  .post(
    '/conversations/:id/regenerate',
    async ({ user, params, body, status, store, request }) => {
      if (!isChatEnabled()) {
        return status(503, { error: 'ai_disabled' });
      }

      const resolved = resolveChatModel(body.model);
      if (!resolved.ok) return status(400, { error: 'invalid_model' });
      const model = resolved.model;

      const [conv] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, params.id), eq(conversations.userId, user.id)))
        .limit(1);
      if (!conv) return status(404, { error: 'not_found' });

      // Per-conversation serialization — MUST precede TX1: a regenerate racing a
      // live turn would otherwise delete that turn's rows out from under it (the
      // observed history-corruption incident).
      const lock = acquireTurnLock(conv.id);
      if (!lock) return status(409, { error: 'turn_in_progress' });

      const log = (store as { log?: typeof rootLogger }).log ?? rootLogger;

      // C7 — re-resolve mentions ONLY when the body carries them; `undefined`
      // keeps the stored snapshot (replay-faithful).
      const newMentions =
        body.mentionedCardIds !== undefined
          ? await resolveMentions(user.id, body.mentionedCardIds)
          : undefined;

      // TX1 — delete the trailing assistant turn (and, with an edited `content`,
      // UPDATE the last user row in place — additive, single-row, user-scoped).
      // 400 when there is no user row.
      const deleted = await deleteTrailingAssistantTurn(conv.id, user.id, body.content, newMentions);
      if (!deleted.ok) {
        releaseTurnLock(conv.id, lock);
        return status(400, { error: 'nothing_to_regenerate' });
      }

      const [{ deckIds, deckName }, userInstructions, notebook] = await Promise.all([
        resolveDeckScope(user.id, body.deckId),
        loadAgentInstructions(user.id),
        resolveNotebookScope(user.id, conv, body.sourceIds),
      ]);
      const webOn = isWebSearchEnabled();

      // C3 — a regenerate also titles a still-untitled thread (covers the
      // abort-tail recovery path, whose affordance IS regenerate).
      const titlePromise = maybeStartTitle({ conv, userId: user.id, model, log });

      // TX2 — replay. After TX1 the trailing row is the last user message; rebuild
      // [system, (summary), ...history-through-that-user-row] and re-run.
      return sseResponse(log, async (emit) => {
        const priorRows = await loadHistoryRows(conv.id);
        const { recentRows, summaryNote } = await compressHistory(conv, priorRows, {
          model,
          log,
        });
        const imageDataUrls = await loadImagePartsMap(
          recentRows.map((r) => (r.role === 'user' ? r.attachments : null)),
        );
        const researchOn = !notebook && body.research === true && isFetchPageEnabled();
        const system = notebook
          ? buildAgentSystemPrompt({
              webSearchEnabled: webOn,
              userInstructions,
              notebook: { title: notebook.title, sourceTitles: notebook.sourceTitles },
            })
          : buildAgentSystemPrompt({
              webSearchEnabled: webOn,
              fetchPageEnabled: isFetchPageEnabled(),
              researchMode: researchOn,
              deckScopeName: deckName,
              userInstructions,
            });
        const startMessages: AgentChatMessage[] = [
          { role: 'system', content: system },
          ...(summaryNote ? [{ role: 'system' as const, content: summaryNote }] : []),
          ...reconstructHistory(recentRows, undefined, imageDataUrls),
        ];

        const outcome = await runAgentTurn({
          userId: user.id,
          conversationId: conv.id,
          log,
          emit,
          startMessages,
          webSearchEnabled: webOn,
          model,
          deckIds: notebook ? undefined : deckIds,
          signal: lock.signal,
          research: researchOn,
          notebook,
        });
        await finishTitle(titlePromise, conv.id, user.id, emit);
        return outcome;
      }, {
        abort: lock,
        requestSignal: request.signal,
        onSettled: () => releaseTurnLock(conv.id, lock),
      });
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        model: t.Optional(t.String({ maxLength: 200 })),
        deckId: t.Optional(t.String({ format: 'uuid' })),
        research: t.Optional(t.Boolean()),
        // Notebook workspace (M2): per-turn source scope for the replay.
        sourceIds: t.Optional(t.Array(t.String({ format: 'uuid' }), { maxItems: 50 })),
        // Edit-and-rerun (B2 / AC4.2): the edited last-user text. Absent ⇒ today's
        // regenerate (strictly additive, backward-compatible).
        content: t.Optional(t.String({ maxLength: 8000 })),
        // C7 — replacement mentions for the replayed user row. Absent ⇒ the
        // stored snapshot replays unchanged.
        mentionedCardIds: t.Optional(t.Array(t.String({ format: 'uuid' }), { maxItems: 8 })),
      }),
    },
  );
