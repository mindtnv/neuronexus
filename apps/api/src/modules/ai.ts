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
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import {
  conversations,
  db,
  messages as messagesTable,
  type Citation,
  type Db,
} from '@neuronexus/db';
import {
  buildAgentSystemPrompt,
  CARD_TOKEN_RE,
  type ChatStreamEvent,
} from '@neuronexus/shared';
import { env, embeddingEnabled, chatEnabled } from '../env.ts';
import { authPlugin } from '../auth-plugin.ts';
import { embeddingDegraded, reindexUser } from '../ai/index-queue.ts';
import {
  chatStreamAgentic,
  isChatEnabled,
  type AgentChatMessage,
} from '../ai/openai-client.ts';
import {
  buildToolRegistry,
  enqueueToolCardsForIndex,
  toOpenAiTools,
  type Tool,
  type ToolContext,
  type ToolImpact,
  type ToolResult,
} from '../ai/tools.ts';
import { isWebSearchEnabled } from '../ai/web-search.ts';
import { rootLogger } from '../logger.ts';
import type { Logger } from 'pino';

/** A Drizzle transaction handle (the arg passed to `db.transaction`). */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

// Retrieval tuning for a chat turn (env-configurable — see env.ts ai block).
const RETRIEVE_K = env.ai.RETRIEVE_K;
const AGENT_MAX_STEPS = env.ai.AGENT_MAX_STEPS;
const TOOL_RESULT_MAX_CHARS = env.ai.TOOL_RESULT_MAX_CHARS;
// Total tool-result chars across a turn before we force a final answer (so a
// multi-round search loop can't blow the context window). ×4 ≈ four full-size
// tool rounds before we force a final answer, bounding per-turn context/cost.
const TOOL_RESULT_BUDGET = TOOL_RESULT_MAX_CHARS * 4;

/** Serialize one SSE frame from a typed ChatStreamEvent. */
function sseFrame(event: ChatStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

// ── Agent loop plumbing ───────────────────────────────────────────────────────

/** A persisted message row (the subset the history mapper reads). */
interface HistoryRow {
  role: string;
  content: string;
  toolCalls: { id: string; name: string; arguments: string }[] | null;
  toolCallId: string | null;
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
  | { role: 'assistant'; content: ''; toolCalls: AssembledToolCall[] }
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
 * Dangling-tool_calls guard: if the LAST row is an assistant tool_calls row with
 * no answering `tool` rows, strip it so the gateway doesn't 400 on an unanswered
 * tool_calls tail (Phase A never produces this — read tools always answer in the
 * same turn — but a Phase B suspended turn does, and a torn legacy row might).
 *
 * `bypassDanglingToolCallId` (resume path): the resume route has JUST persisted
 * the answering `role:tool` row for that id, so the trailing assistant tool_calls
 * row is no longer dangling — the guard is suppressed for that exact id.
 */
function reconstructHistory(
  rows: HistoryRow[],
  bypassDanglingToolCallId?: string,
): AgentChatMessage[] {
  const out: AgentChatMessage[] = [];
  for (const r of rows) {
    if (r.role === 'user') {
      out.push({ role: 'user', content: r.content });
    } else if (r.role === 'assistant' && r.toolCalls && r.toolCalls.length > 0) {
      out.push({
        role: 'assistant',
        content: '',
        tool_calls: r.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });
    } else if (r.role === 'assistant') {
      out.push({ role: 'assistant', content: r.content });
    } else if (r.role === 'tool' && r.toolCallId) {
      out.push({ role: 'tool', content: r.content, tool_call_id: r.toolCallId });
    }
    // system rows (none today) are ignored — we set the system prompt ourselves.
  }

  // Dangling-tool_calls guard: drop a trailing unanswered assistant tool_calls row.
  const last = out[out.length - 1];
  if (last && last.role === 'assistant' && last.tool_calls && last.tool_calls.length > 0) {
    const answered = new Set(
      out.filter((m) => m.role === 'tool' && m.tool_call_id).map((m) => m.tool_call_id),
    );
    const allAnswered = last.tool_calls.every(
      (tc) => answered.has(tc.id) || tc.id === bypassDanglingToolCallId,
    );
    if (!allAnswered) out.pop();
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
  const { userId, conversationId, log, emit, startMessages, webSearchEnabled } = args;

  const registry: Tool[] = buildToolRegistry({ webSearchEnabled });
  const toolByName = new Map(registry.map((tl) => [tl.name, tl]));
  const openAiTools = toOpenAiTools(registry);
  const toolCtx: ToolContext = { userId, log };

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

  emit({ type: 'status', phase: 'thinking' });

  for (let step = 0; step < AGENT_MAX_STEPS; step++) {
    const isFinalStep = step === AGENT_MAX_STEPS - 1 || toolResultChars >= TOOL_RESULT_BUDGET;
    const toolChoice = isFinalStep ? 'none' : 'auto';

    const partials = new Map<number, { id: string; name: string; args: string }>();
    let finishReason: 'stop' | 'tool_calls' | 'length' | undefined;

    for await (const chunk of chatStreamAgentic(messages, {
      tools: isFinalStep ? [] : openAiTools,
      toolChoice,
      log,
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

    // ── Write/SRS pause (Phase B) ──────────────────────────────────────────────
    // If ANY finalized call is a write/SRS tool, the turn pauses for confirmation.
    // We only support ONE pending write at a time: pause on the FIRST write call
    // in this batch, attaching just that call as the pending assistant tool_calls
    // row (the model rarely batches a write with other calls; if it does, we
    // surface the first write — the rest are dropped, the model re-proposes on
    // resume if still needed).
    const firstWrite = assembled.find((c) => {
      const tl = toolByName.get(c.name);
      return tl && tl.kind !== 'read';
    });

    if (firstWrite) {
      const tool = toolByName.get(firstWrite.name)!;
      // Compute the blast radius WITHOUT mutating.
      let impact: ToolImpact = {};
      try {
        const parsed = firstWrite.arguments ? JSON.parse(firstWrite.arguments) : {};
        impact = (await tool.dryRun?.(toolCtx, parsed)) ?? {};
      } catch (err) {
        log.warn({ err, tool: firstWrite.name }, 'ai.tool.dryRun_failed');
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
      transcript.push({ role: 'assistant', content: '', toolCalls: [firstWrite] });

      emit({ type: 'tool_call', id: firstWrite.id, name: firstWrite.name, args: firstWrite.arguments, status: 'running' });
      emit({
        type: 'await_confirmation',
        toolCall: { id: firstWrite.id, name: firstWrite.name, args: firstWrite.arguments },
        impact: Object.keys(impact).length > 0 ? impact : undefined,
      });

      // Commit everything so far (parent + so-far children + this pending
      // tool_calls row) in ONE transaction (Principle 5 — no orphan tool row).
      await persistTranscript({ tx: undefined, transcript, userId, conversationId });
      log.info({ tool: firstWrite.name, toolCallId: firstWrite.id }, 'ai.agent.suspended');
      return { kind: 'suspended' };
    }

    // ── Read tools — auto-execute server-side ──────────────────────────────────
    messages.push({
      role: 'assistant',
      content: '',
      tool_calls: assembled.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });
    transcript.push({ role: 'assistant', content: '', toolCalls: assembled });

    emit({ type: 'status', phase: 'calling_tool' });

    for (const call of assembled) {
      emit({ type: 'tool_call', id: call.id, name: call.name, args: call.arguments, status: 'running' });

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
      for (const c of resultCitations) {
        const key = c.chunkId || c.cardId;
        if (!citationAcc.has(key)) citationAcc.set(key, c);
      }

      emit({
        type: 'tool_result',
        id: call.id,
        ok: result.ok,
        summary: result.ok ? undefined : result.error,
        citations: result.ok && resultCitations.length > 0 ? resultCitations : undefined,
      });

      const toolContent = capToolResult(
        result.ok ? result.text : JSON.stringify({ ok: false, error: result.error }),
      );
      toolResultChars += toolContent.length;
      messages.push({ role: 'tool', content: toolContent, tool_call_id: call.id });
      transcript.push({ role: 'tool', content: toolContent, toolCallId: call.id });
    }
  }

  // Citations = union-dedup across ALL search_cards calls, intersected with the
  // [card:<id>] tokens the model actually emitted (fallback to the capped union).
  const emittedCardIds = new Set<string>();
  for (const m of finalText.matchAll(CARD_TOKEN_RE)) {
    if (m[1]) emittedCardIds.add(m[1]);
  }
  const unionCitations = [...citationAcc.values()];
  let citations: Citation[];
  if (emittedCardIds.size > 0) {
    const intersected = unionCitations.filter((c) => emittedCardIds.has(c.cardId));
    citations = (intersected.length > 0 ? intersected : unionCitations).slice(0, RETRIEVE_K);
  } else {
    citations = unionCitations.slice(0, RETRIEVE_K);
  }

  if (finalText.trim().length === 0) {
    finalText = "I couldn't complete the request within the step limit.";
  }

  emit({ type: 'citation', citations });
  transcript.push({ role: 'assistant', content: finalText, citations });

  const finalMessageId = await persistTranscript({
    tx: undefined,
    transcript,
    userId,
    conversationId,
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
 */
async function persistTranscript(args: {
  tx: Tx | undefined;
  transcript: TranscriptRow[];
  userId: string;
  conversationId: string;
}): Promise<string | null> {
  const { transcript, userId, conversationId } = args;
  const run = async (tx: Tx): Promise<string | null> => {
    let lastAssistantId: string | null = null;
    for (const row of transcript) {
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
        });
      } else if (row.role === 'tool') {
        await tx.insert(messagesTable).values({
          conversationId,
          userId,
          role: 'tool',
          content: row.content,
          toolCallId: row.toolCallId,
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

/** Load the full persisted transcript for a conversation (oldest-first). */
async function loadHistoryRows(conversationId: string): Promise<HistoryRow[]> {
  const rows = await db
    .select({
      role: messagesTable.role,
      content: messagesTable.content,
      toolCalls: messagesTable.toolCalls,
      toolCallId: messagesTable.toolCallId,
    })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(asc(messagesTable.createdAt))
    .limit(500);
  return rows as HistoryRow[];
}

/**
 * Find the pending tool call named by `resumeToolCallId` — it must be one of the
 * `tool_calls` on a persisted assistant row in THIS conversation (the ownership
 * chain: the rows were already user+conversation scoped by the caller). Returns
 * the matching call record or `null` (→ 404, never trust the client's id).
 */
function findPendingToolCall(
  rows: HistoryRow[],
  resumeToolCallId: string,
): AssembledToolCall | null {
  for (const r of rows) {
    if (r.role === 'assistant' && r.toolCalls) {
      const match = r.toolCalls.find((tc) => tc.id === resumeToolCallId);
      if (match) return { id: match.id, name: match.name, arguments: match.arguments };
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
    .orderBy(desc(messagesTable.createdAt))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Wrap an agent-turn runner in the raw SSE `Response(ReadableStream)` boilerplate
 * + the post-flush error boundary (SHOULD-FIX #7): ANY error inside `run`
 * becomes a terminal `event: error` frame; nothing throws into Elysia's
 * `.onError` (which can't rewrite an event-stream body). `run` returns the turn
 * outcome — a `done` outcome already emitted its `done` frame inside the loop;
 * a `suspended` outcome closes the stream WITHOUT a `done`.
 */
function sseResponse(
  log: Logger,
  run: (emit: (event: ChatStreamEvent) => void) => Promise<AgentTurnOutcome>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(sseFrame(event)));
      };
      try {
        const outcome = await run(emit);
        if (outcome.kind === 'done') {
          emit({ type: 'done', messageId: outcome.messageId });
        }
        // 'suspended' → close WITHOUT a `done` (the turn is paused for confirm).
        controller.close();
      } catch (err) {
        log.error({ err }, 'ai.chat.stream_failed');
        const code =
          err instanceof Error && /^(chat_stream_torn|chat_failed|ai_disabled)/.test(err.message)
            ? err.message
            : 'chat_failed';
        try {
          emit({ type: 'error', message: code });
        } catch {
          // controller already closed — nothing to do.
        }
        try {
          controller.close();
        } catch {
          // already closed.
        }
      }
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
      webSearchEnabled: isWebSearchEnabled(),
      embeddingModel: env.ai.EMBEDDING_MODEL,
      chatModel: env.ai.CHAT_MODEL,
      embeddingDim: env.ai.EMBEDDING_DIM,
      degraded: embeddingDegraded(),
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
  // List the caller's conversations, newest-first.
  .get(
    '/conversations',
    async ({ user }) => {
      const rows = await db
        .select()
        .from(conversations)
        .where(eq(conversations.userId, user.id))
        .orderBy(desc(conversations.updatedAt));
      return { items: rows };
    },
    { auth: true },
  )
  // Create a conversation. `title` is optional (the client may title it from the
  // first message).
  .post(
    '/conversations',
    async ({ user, body }) => {
      const [row] = await db
        .insert(conversations)
        .values({ userId: user.id, title: body.title ?? null })
        .returning();
      return row!;
    },
    {
      auth: true,
      body: t.Object({ title: t.Optional(t.String({ maxLength: 200 })) }),
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
        .orderBy(asc(messagesTable.createdAt));
      return { conversation: conv, messages: msgs };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
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
    async ({ user, params, body, status, store }) => {
      // Pre-flush gate: chat off → 503 (effective check so the injected test stub
      // flips it on). Nothing flushed yet, so a normal JSON body is fine.
      if (!isChatEnabled()) {
        return status(503, { error: 'ai_disabled' });
      }

      // Pre-flush: ownership check. 404 if foreign/missing (normal JSON path).
      const [conv] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, params.id), eq(conversations.userId, user.id)))
        .limit(1);
      if (!conv) return status(404, { error: 'not_found' });

      const userQuery = body.content;
      const log = (store as { log?: typeof rootLogger }).log ?? rootLogger;

      // Persist the user's message BEFORE streaming (it always happened).
      await db.insert(messagesTable).values({
        conversationId: conv.id,
        userId: user.id,
        role: 'user',
        content: userQuery,
      });

      const webOn = isWebSearchEnabled();

      return sseResponse(log, async (emit) => {
        // Build messages = [system, ...history, user]. History is the full
        // persisted transcript minus the user turn we just inserted.
        const priorRows = await loadHistoryRows(conv.id);
        const system = buildAgentSystemPrompt({ webSearchEnabled: webOn });
        const startMessages: AgentChatMessage[] = [
          { role: 'system', content: system },
          ...reconstructHistory(priorRows.slice(0, -1)),
          { role: 'user', content: userQuery },
        ];

        const outcome = await runAgentTurn({
          userId: user.id,
          conversationId: conv.id,
          log,
          emit,
          startMessages,
          webSearchEnabled: webOn,
        });
        return outcome;
      });
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({ content: t.String({ minLength: 1, maxLength: 8000 }) }),
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
    async ({ user, params, body, status, store }) => {
      if (!isChatEnabled()) {
        return status(503, { error: 'ai_disabled' });
      }

      const [conv] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, params.id), eq(conversations.userId, user.id)))
        .limit(1);
      if (!conv) return status(404, { error: 'not_found' });

      const log = (store as { log?: typeof rootLogger }).log ?? rootLogger;
      const { resumeToolCallId, decision } = body;

      // Load the full transcript ONCE (history mapping + validation share it).
      const priorRows = await loadHistoryRows(conv.id);

      // Validate the resumeToolCallId against a persisted assistant tool_calls
      // row in THIS conversation (ownership chain user→conversation→tool_calls).
      const pending = findPendingToolCall(priorRows, resumeToolCallId);
      if (!pending) {
        // No assistant tool_calls row in this conversation names that id → 404.
        return status(404, { error: 'unknown_tool_call' });
      }

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

        if (decision === 'apply') {
          const registry = buildToolRegistry({ webSearchEnabled: webOn });
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
              // ONE transaction: the mutation + the role:tool insert. A duplicate
              // (conversation_id, tool_call_id) for role='tool' violates
              // messages_tool_result_uq → the whole tx (incl. the mutation) rolls
              // back. So a racing/double Apply never double-executes.
              try {
                result = await db.transaction(async (tx) => {
                  const r = await tool.execute({ ...toolCtx, tx }, parsedArgs);
                  const content = capToolResult(
                    r.ok ? r.text : JSON.stringify({ ok: false, error: r.error }),
                  );
                  await tx.insert(messagesTable).values({
                    conversationId: conv.id,
                    userId: user.id,
                    role: 'tool',
                    content,
                    toolCallId: resumeToolCallId,
                  });
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
            summary: result.ok ? undefined : result.error,
          });

          // RAG index hook — enqueue created/updated cards AFTER the commit.
          enqueueToolCardsForIndex(toolCardIds);
        } else {
          // Reject: record a "user rejected" tool result so the model can answer
          // without the mutation. Idempotent via the partial unique index.
          const rejectionContent = JSON.stringify({ ok: false, error: 'user_rejected' });
          try {
            await db.insert(messagesTable).values({
              conversationId: conv.id,
              userId: user.id,
              role: 'tool',
              content: rejectionContent,
              toolCallId: resumeToolCallId,
            });
          } catch {
            // already answered — idempotent.
          }
          emit({ type: 'tool_result', id: pending.id, ok: false, summary: 'user_rejected' });
        }

        // Continue the shared loop. Rebuild messages from the NOW-updated
        // persisted transcript; the dangling-tool_calls guard is bypassed for
        // the exact id we just answered (so the pending assistant tool_calls row
        // is kept — it now has its answering role:tool row).
        const updatedRows = await loadHistoryRows(conv.id);
        const system = buildAgentSystemPrompt({ webSearchEnabled: webOn });
        const startMessages: AgentChatMessage[] = [
          { role: 'system', content: system },
          ...reconstructHistory(updatedRows, resumeToolCallId),
        ];

        return runAgentTurn({
          userId: user.id,
          conversationId: conv.id,
          log,
          emit,
          startMessages,
          webSearchEnabled: webOn,
        });
      });
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        resumeToolCallId: t.String({ minLength: 1, maxLength: 256 }),
        decision: t.Union([t.Literal('apply'), t.Literal('reject')]),
      }),
    },
  );
