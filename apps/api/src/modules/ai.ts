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
import { and, asc, desc, eq } from 'drizzle-orm';
import {
  conversations,
  db,
  messages as messagesTable,
  type Citation,
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
import { buildToolRegistry, toOpenAiTools, type Tool, type ToolResult } from '../ai/tools.ts';
import { isWebSearchEnabled } from '../ai/web-search.ts';
import { rootLogger } from '../logger.ts';

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
 * same turn — but a Phase B suspended turn could, and a torn legacy row might).
 */
function reconstructHistory(rows: HistoryRow[]): AgentChatMessage[] {
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
    const allAnswered = last.tool_calls.every((tc) => answered.has(tc.id));
    if (!allAnswered) out.pop();
  }
  return out;
}

/** Truncate a tool-result string to the per-result content cap. */
function capToolResult(text: string): string {
  if (text.length <= TOOL_RESULT_MAX_CHARS) return text;
  return `${text.slice(0, TOOL_RESULT_MAX_CHARS)}\n…[truncated]`;
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
  // Flow: persist the user message → build [system, ...history, user] → run a
  // BOUNDED agent loop (chatStreamAgentic): emit `reasoning`/`token` deltas,
  // assemble streamed tool_calls (index-keyed), execute READ tools server-side,
  // emit `tool_call`/`tool_result`, feed results back, continue. On `finish:stop`
  // emit ONE union-deduped `citation` event, then commit the ENTIRE transcript
  // (assistant tool_calls rows + role:tool rows + final assistant text) in ONE
  // end-of-turn transaction → `event: done`. A dropped stream persists nothing
  // (same safety as before). Reasoning is streamed only, never persisted. Errors
  // after the first flushed byte become a terminal `event: error` frame (NEVER
  // reach app.ts's `.onError`). Phase A registry = read tools only; the
  // write/SRS confirm-pause branch is Phase B (loop left structured for it).
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

      // Tool registry for this turn — Phase A: read tools only. `web_search` is
      // present only when web search is enabled (Brave key / test provider).
      const webOn = isWebSearchEnabled();
      const registry: Tool[] = buildToolRegistry({ webSearchEnabled: webOn });
      const toolByName = new Map(registry.map((tl) => [tl.name, tl]));
      const openAiTools = toOpenAiTools(registry);
      const toolCtx = { userId: user.id, log };

      // The agent loop runs INSIDE the ReadableStream's `start`, fully wrapped in
      // a try/catch that turns ANY failure into a terminal `event: error` frame.
      // Once we return the Response below the headers are committed, so the
      // controller owns every error frame — nothing throws into Elysia's
      // `.onError` (which can't rewrite an event-stream body).
      const encoder = new TextEncoder();

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const emit = (event: ChatStreamEvent) => {
            controller.enqueue(encoder.encode(sseFrame(event)));
          };
          try {
            // 1) Build messages = [system, ...history, user]. History is the
            //    full persisted transcript minus the user turn we just inserted.
            const priorRows = await db
              .select({
                role: messagesTable.role,
                content: messagesTable.content,
                toolCalls: messagesTable.toolCalls,
                toolCallId: messagesTable.toolCallId,
              })
              .from(messagesTable)
              .where(eq(messagesTable.conversationId, conv.id))
              .orderBy(asc(messagesTable.createdAt))
              .limit(500);
            const system = buildAgentSystemPrompt({ webSearchEnabled: webOn });
            const messages: AgentChatMessage[] = [
              { role: 'system', content: system },
              ...reconstructHistory(priorRows.slice(0, -1) as HistoryRow[]),
              { role: 'user', content: userQuery },
            ];

            // 2) Bounded agent loop. `transcript` accumulates rows to persist in
            //    ONE end-of-turn transaction (do NOT commit mid-loop in Phase A).
            const transcript: TranscriptRow[] = [];
            // Turn-level citation accumulator (union across ALL search_cards calls).
            const citationAcc = new Map<string, Citation>();
            let finalText = '';
            let toolResultChars = 0;
            // Drives the wired UI phase line; flips to 'answering' on the first
            // final-text token so we only emit that transition once.
            let answeringEmitted = false;

            // Phase line: 'thinking' before the first agentic call of the turn.
            emit({ type: 'status', phase: 'thinking' });

            for (let step = 0; step < AGENT_MAX_STEPS; step++) {
              // The final allowed step (or once the tool-result budget is spent)
              // forces a tool-free answer. The cap is LOOP-enforced: we treat the
              // forced-final response as terminal regardless of what it returns.
              const isFinalStep = step === AGENT_MAX_STEPS - 1 || toolResultChars >= TOOL_RESULT_BUDGET;
              const toolChoice = isFinalStep ? 'none' : 'auto';

              // Index-keyed assembly of streamed tool_call deltas.
              const partials = new Map<number, { id: string; name: string; args: string }>();
              let finishReason: 'stop' | 'tool_calls' | 'length' | undefined;

              for await (const chunk of chatStreamAgentic(messages, {
                tools: isFinalStep ? [] : openAiTools,
                toolChoice,
                log,
              })) {
                if (chunk.type === 'reasoning') {
                  // Reasoning is streamed only — NOT persisted.
                  emit({ type: 'reasoning', delta: chunk.text });
                } else if (chunk.type === 'content') {
                  // Phase line: 'answering' on the first final-text token (once).
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

              // Never-terminated guard (M3): reader ended with buffered tool_call
              // fragments but NO finish chunk → torn stream. Terminal error; do
              // NOT execute partial calls (assembled args may be truncated).
              if (finishReason === undefined && partials.size > 0) {
                throw new Error('chat_stream_torn');
              }

              if (isFinalStep || finishReason !== 'tool_calls') {
                // Terminal: a (possibly empty) text answer. On the forced-final
                // step we IGNORE any tool_calls the gateway returned anyway. An
                // empty answer is backfilled by the post-loop fallback below.
                break;
              }

              // finish === 'tool_calls' and we are NOT on the final step → execute.
              // Synthesize a stable unique id for any call the gateway left empty
              // — an empty `tool_call_id` would collide on the partial unique index
              // messages_tool_result_uq (conversation_id, tool_call_id WHERE role=
              // 'tool'), tearing the whole end-of-turn transaction. The synthesized
              // id is reused verbatim by the emitted `tool_call` event, the in-memory
              // messages (assistant tool_calls + role:tool reply), and the persisted
              // rows; real gateway ids are left untouched.
              const assembled: AssembledToolCall[] = [...partials.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([, p], index) => ({
                  id: p.id || `call_${step}_${index}`,
                  name: p.name,
                  arguments: p.args,
                }));

              if (assembled.length === 0) {
                // finish:tool_calls with no assembled calls — nothing to do; treat
                // as terminal so we don't spin.
                break;
              }

              // Append the assistant(tool_calls) message to both the live messages
              // array and the persisted transcript.
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

              // Phase line: 'calling_tool' once finish:tool_calls resolved into
              // real calls, before we execute them server-side.
              emit({ type: 'status', phase: 'calling_tool' });

              // Execute each tool server-side (read tools only in Phase A).
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
                  // Tools NEVER throw — execute() returns a ToolResult. Guard anyway.
                  try {
                    result = await tool.execute(toolCtx, parsedArgs);
                  } catch (toolErr) {
                    result = {
                      ok: false,
                      error: toolErr instanceof Error ? toolErr.message : 'tool_failed',
                    };
                  }
                }

                // Accumulate search_cards citations (union-dedup by chunkId→cardId).
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

                // role:tool content: the tool text on success, JSON error on
                // failure. Capped per result; track the cross-turn total.
                const toolContent = capToolResult(
                  result.ok ? result.text : JSON.stringify({ ok: false, error: result.error }),
                );
                toolResultChars += toolContent.length;
                messages.push({ role: 'tool', content: toolContent, tool_call_id: call.id });
                transcript.push({ role: 'tool', content: toolContent, toolCallId: call.id });
              }
              // Loop continues — the model now sees the tool results.
            }

            // 3) Citations = union-dedup across ALL search_cards calls, intersected
            //    with the [card:<id>] tokens the model actually emitted (fallback to
            //    the capped union when no tokens), capped at RETRIEVE_K.
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

            // Synthesize a fallback when the loop produced no text at all.
            if (finalText.trim().length === 0) {
              finalText = "I couldn't complete the request within the step limit.";
            }

            // 4) Emit the single final citation event.
            emit({ type: 'citation', citations });

            // Append the final assistant text row to the transcript.
            transcript.push({ role: 'assistant', content: finalText, citations });

            // 5) Persist the ENTIRE transcript in ONE end-of-turn transaction
            //    (Phase A regime — no mid-loop commit). A dropped stream persists
            //    nothing. The final assistant row id is the `done` messageId.
            const finalMessageId = await db.transaction(async (tx) => {
              let lastAssistantId: string | null = null;
              for (const row of transcript) {
                if (row.role === 'assistant' && row.content === '' && 'toolCalls' in row) {
                  await tx.insert(messagesTable).values({
                    conversationId: conv.id,
                    userId: user.id,
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
                    conversationId: conv.id,
                    userId: user.id,
                    role: 'tool',
                    content: row.content,
                    toolCallId: row.toolCallId,
                  });
                } else {
                  const [msg] = await tx
                    .insert(messagesTable)
                    .values({
                      conversationId: conv.id,
                      userId: user.id,
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
                .where(eq(conversations.id, conv.id));
              return lastAssistantId!;
            });

            // 6) Terminal done frame carrying the final assistant message id.
            emit({ type: 'done', messageId: finalMessageId });
            controller.close();
          } catch (err) {
            // SHOULD-FIX #7: ALL post-flush errors are caught here and become a
            // terminal `event: error` frame — nothing throws into Elysia's error
            // pipeline (which can't rewrite an event-stream body).
            log.error({ err }, 'ai.chat.stream_failed');
            // Don't forward raw error text to the client. Full `err` is logged
            // above; only known-safe internal prefixes pass through, else opaque.
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
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({ content: t.String({ minLength: 1, maxLength: 8000 }) }),
    },
  );
