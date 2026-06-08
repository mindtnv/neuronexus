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
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  conversations,
  db,
  decks,
  messages as messagesTable,
  type Citation,
} from '@neuronexus/db';
import { buildRagPrompt, type ChatStreamEvent, type RagChunk } from '@neuronexus/shared';
import { env, embeddingEnabled, chatEnabled } from '../env.ts';
import { authPlugin } from '../auth-plugin.ts';
import { embeddingDegraded, reindexUser } from '../ai/index-queue.ts';
import {
  chatStream,
  embed,
  isChatEnabled,
  type ChatMessage,
} from '../ai/openai-client.ts';
import { retrieve, type RankedChunk } from '../ai/retrieve.ts';
import { rootLogger } from '../logger.ts';

// Retrieval tuning for a chat turn (env-configurable — see env.ts ai block).
const RETRIEVE_K = env.ai.RETRIEVE_K;
const RETRIEVE_MIN_SCORE = env.ai.RETRIEVE_MIN_SCORE;
// Snippet length stored on each Citation (for the client's hover/preview).
const SNIPPET_LEN = 240;

/** Serialize one SSE frame from a typed ChatStreamEvent. */
function sseFrame(event: ChatStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Resolve retrieved chunks into RagChunk (for the prompt) + Citation[] (for the
 * client + persistence). Deck names are looked up in one batched query for the
 * prompt context block.
 */
async function resolveCitations(
  hits: RankedChunk[],
): Promise<{ ragChunks: RagChunk[]; citations: Citation[] }> {
  if (hits.length === 0) return { ragChunks: [], citations: [] };

  const deckIds = [...new Set(hits.map((h) => h.deckId))];
  const deckRows = await db
    .select({ id: decks.id, name: decks.name })
    .from(decks)
    .where(inArray(decks.id, deckIds));
  const deckNameById = new Map(deckRows.map((d) => [d.id, d.name]));

  const ragChunks: RagChunk[] = hits.map((h) => ({
    cardId: h.cardId,
    text: h.text,
    deckName: deckNameById.get(h.deckId),
  }));
  const citations: Citation[] = hits.map((h) => ({
    cardId: h.cardId,
    chunkId: h.chunkId,
    deckId: h.deckId,
    snippet: h.text.slice(0, SNIPPET_LEN),
  }));
  return { ragChunks, citations };
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
  // Grounded RAG chat over SSE (Decision 4). Returns a raw
  // `Response(ReadableStream, text/event-stream)` — intentionally OUTSIDE the
  // Eden type graph (the typed RPC client can't consume a stream). The web client
  // reaches this via a hand-written fetch+reader (Slice 5).
  //
  // Flow: persist the user message → embed(query) → retrieve → buildRagPrompt →
  // chatStream → emit `event: token` deltas → `event: citation` → PERSIST the
  // assistant message + citations → `event: done`. Persistence happens AFTER the
  // stream completes so a dropped stream never persists a half message. Errors
  // after the first flushed byte become a terminal `event: error` frame (NEVER
  // reach app.ts's `.onError`).
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

      // embed + retrieve + chatStream all run INSIDE the ReadableStream's `start`,
      // fully wrapped in a try/catch that turns ANY failure into a terminal
      // `event: error` frame. Once we return the Response below the headers are
      // committed, so the controller owns every error frame — nothing throws into
      // Elysia's `.onError` (which can't rewrite an event-stream body). This also
      // covers the "embed/retrieve fails after first token" case the plan calls out.
      const encoder = new TextEncoder();
      let assistantContent = '';

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const emit = (event: ChatStreamEvent) => {
            controller.enqueue(encoder.encode(sseFrame(event)));
          };
          try {
            // 1) Embed the query.
            const [queryEmbedding] = await embed([userQuery]);
            const hits =
              queryEmbedding && queryEmbedding.length > 0
                ? await retrieve({
                    userId: user.id,
                    queryEmbedding,
                    k: RETRIEVE_K,
                    minScore: RETRIEVE_MIN_SCORE,
                  })
                : [];

            // 2) Resolve citations + prompt context.
            const { ragChunks, citations } = await resolveCitations(hits);

            // 3) Prior history (oldest-first), excluding the just-inserted user
            //    turn (we pass the current query separately to the prompt builder).
            const priorRows = await db
              .select({
                role: messagesTable.role,
                content: messagesTable.content,
                createdAt: messagesTable.createdAt,
              })
              .from(messagesTable)
              .where(eq(messagesTable.conversationId, conv.id))
              .orderBy(asc(messagesTable.createdAt));
            // Drop the final row (the user turn we just inserted) + keep only
            // user/assistant turns for history.
            const history = priorRows
              .slice(0, -1)
              .filter((m) => m.role === 'user' || m.role === 'assistant')
              .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

            // 4) Build the grounded prompt.
            const { system, messages } = buildRagPrompt({
              query: userQuery,
              chunks: ragChunks,
              history,
            });
            const chatMessages: ChatMessage[] = [
              { role: 'system', content: system },
              ...messages,
            ];

            // 5) Stream tokens.
            for await (const delta of chatStream(chatMessages, { log })) {
              assistantContent += delta;
              emit({ type: 'token', delta });
            }

            // 6) Emit resolved citations.
            emit({ type: 'citation', citations });

            // 7) Persist the assistant message + citations AFTER the stream
            //    completed (no half-messages on a dropped stream). The INSERT and
            //    the conversation `updatedAt` bump run in ONE transaction so the
            //    message and the newest-first ordering can never diverge.
            const assistantMsg = await db.transaction(async (tx) => {
              const [msg] = await tx
                .insert(messagesTable)
                .values({
                  conversationId: conv.id,
                  userId: user.id,
                  role: 'assistant',
                  content: assistantContent,
                  citations,
                })
                .returning({ id: messagesTable.id });
              await tx
                .update(conversations)
                .set({ updatedAt: new Date() })
                .where(eq(conversations.id, conv.id));
              return msg!;
            });

            // 8) Terminal done frame carrying the assistant message id.
            emit({ type: 'done', messageId: assistantMsg.id });
            controller.close();
          } catch (err) {
            // SHOULD-FIX #7: ALL post-flush errors are caught here and become a
            // terminal `event: error` frame — nothing throws into Elysia's error
            // pipeline (which can't rewrite an event-stream body).
            log.error({ err }, 'ai.chat.stream_failed');
            try {
              emit({
                type: 'error',
                message: err instanceof Error ? err.message : 'chat_failed',
              });
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
