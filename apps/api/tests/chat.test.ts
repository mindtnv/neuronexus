// Grounded RAG chat integration tests (Slice 4, plan §269, AC1/AC2/AC3/AC5/AC6).
//
// Conversation CRUD + cross-user scoping, plus the SSE stream endpoint read
// fully IN-PROCESS via `(await app.handle(req)).body` (no network, no timing
// flake — plan §277). A DETERMINISTIC fake embedder + a scripted stub
// `chatStream` make every path reproducible without real API keys; injecting a
// fake `chatStream` flips `isChatEnabled()` on (openai-client seam), so chat
// works even though CHAT_API_KEY is unset in the test env.
//
// Covers:
//   * conversation CRUD; cross-user GET → 404; list excludes others.
//   * stream: ≥2 `event: token` frames arrive BEFORE `event: done` (AC6).
//   * a stub that THROWS after the first delta → terminal `event: error` frame,
//     NOT a JSON `.onError` body (SHOULD-FIX #7).
//   * grounding: seeded+indexed card on topic X → asking X cites the card (AC2).
//   * not-found: no matching card → retrieval empty → assistant message persisted
//     with empty citations, "not in cards" path (AC1).
//   * citations persisted on the assistant message (AC3/AC5).
//   * ai_disabled → 503 when chat is disabled.
//   * GET /cards/:id returns the caller's card; 404 on a foreign id (SHOULD-FIX #4).

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { db, messages as messagesTable } from '@neuronexus/db';
import { asc, eq } from 'drizzle-orm';
import { buildApp } from '../src/app.ts';
import {
  __resetAiClientForTests,
  __setAiClientForTests,
  type ChatMessage,
} from '../src/ai/openai-client.ts';
import { drainIndexQueue } from '../src/ai/index-queue.ts';
import { callApp, resetTestDb, seedBasicCard, signUpAndCookie, uniqueEmail } from './helpers.ts';

const app = buildApp();
const EMBED_DIM = 1536;

// Deterministic embedder (shared shape with retrieve/index tests).
function vectorFor(text: string): number[] {
  const v = new Array<number>(EMBED_DIM).fill(0);
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  for (let i = 0; i < 8; i++) {
    const idx = (h + i * 131) % EMBED_DIM;
    v[idx] = ((h >>> (i * 3)) % 100) / 100 + 0.01;
  }
  return v;
}
function fakeEmbed(texts: string[]): Promise<number[][]> {
  return Promise.resolve(texts.map(vectorFor));
}

// A scripted chat stub yielding N deltas. Capture the messages it was called
// with so grounding can assert the prompt carried the retrieved card text.
let capturedChatMessages: ChatMessage[] | null = null;
function scriptedChat(deltas: string[]) {
  return async function* (messages: ChatMessage[]): AsyncIterable<string> {
    capturedChatMessages = messages;
    for (const d of deltas) yield d;
  };
}
// A stub that throws AFTER the first delta (post-flush failure).
function throwAfterFirst(): (messages: ChatMessage[]) => AsyncIterable<string> {
  return async function* (messages: ChatMessage[]): AsyncIterable<string> {
    capturedChatMessages = messages;
    yield 'first ';
    throw new Error('upstream_5xx');
  };
}

interface SseFrame {
  event: string;
  data: unknown;
}

/** Read an SSE Response body fully in-process and parse frames in arrival order. */
async function readSse(res: Response): Promise<SseFrame[]> {
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const frames: SseFrame[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = 'message';
      let data = '';
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      frames.push({ event, data: data ? JSON.parse(data) : null });
    }
  }
  return frames;
}

/** POST the stream endpoint with a session cookie and return the raw Response. */
async function streamReq(cookie: string, convId: string, content: string): Promise<Response> {
  const req = new Request(`http://localhost/chat/conversations/${convId}/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ content }),
  });
  return app.handle(req);
}

async function createConversation(cookie: string, title?: string): Promise<string> {
  const res = await callApp(app, 'POST', '/chat/conversations', { cookie, body: { title } });
  expect(res.status).toBe(200);
  return (await res.json<{ id: string }>()).id;
}

async function freshDeck(cookie: string, name = 'D'): Promise<string> {
  return (
    await (await callApp(app, 'POST', '/decks', { cookie, body: { name } })).json<{ id: string }>()
  ).id;
}

describe('chat (Slice 4)', () => {
  beforeEach(async () => {
    await resetTestDb();
    capturedChatMessages = null;
    // Default: embedding + chat both stubbed (chat enabled via the seam).
    __setAiClientForTests({ embed: fakeEmbed, chatStream: scriptedChat(['Hello', ' ', 'world']) });
  });

  afterEach(() => {
    __resetAiClientForTests();
  });

  // ── Conversation CRUD + scoping (AC5) ──────────────────────────────────────

  test('conversation CRUD: create, get, list, delete', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const id = await createConversation(cookie, 'My thread');

    const got = await callApp(app, 'GET', `/chat/conversations/${id}`, { cookie });
    expect(got.status).toBe(200);
    const body = await got.json<{ conversation: { id: string; title: string }; messages: unknown[] }>();
    expect(body.conversation.id).toBe(id);
    expect(body.conversation.title).toBe('My thread');
    expect(body.messages).toEqual([]);

    const list = await callApp(app, 'GET', '/chat/conversations', { cookie });
    const listed = await list.json<{ items: { id: string }[] }>();
    expect(listed.items.map((c) => c.id)).toContain(id);

    const del = await callApp(app, 'DELETE', `/chat/conversations/${id}`, { cookie });
    expect(del.status).toBe(200);
    const gone = await callApp(app, 'GET', `/chat/conversations/${id}`, { cookie });
    expect(gone.status).toBe(404);
  });

  test('cross-user GET → 404 and list excludes others (AC5)', async () => {
    const a = await signUpAndCookie(app, uniqueEmail('a'));
    const b = await signUpAndCookie(app, uniqueEmail('b'));
    const aId = await createConversation(a.cookie, 'A thread');

    // B cannot read A's conversation.
    const foreign = await callApp(app, 'GET', `/chat/conversations/${aId}`, { cookie: b.cookie });
    expect(foreign.status).toBe(404);

    // B's list does not include A's conversation.
    const bList = await callApp(app, 'GET', '/chat/conversations', { cookie: b.cookie });
    const items = (await bList.json<{ items: { id: string }[] }>()).items;
    expect(items.map((c) => c.id)).not.toContain(aId);

    // B cannot delete A's conversation.
    const delForeign = await callApp(app, 'DELETE', `/chat/conversations/${aId}`, { cookie: b.cookie });
    expect(delForeign.status).toBe(404);
  });

  // ── Streaming (AC6) ─────────────────────────────────────────────────────────

  test('stream: ≥2 token frames arrive BEFORE done (AC6)', async () => {
    __setAiClientForTests({
      embed: fakeEmbed,
      chatStream: scriptedChat(['The ', 'quick ', 'brown ', 'fox']),
    });
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const convId = await createConversation(cookie);

    const res = await streamReq(cookie, convId, 'tell me something');
    expect(res.status).toBe(200);
    const frames = await readSse(res);

    const doneIdx = frames.findIndex((f) => f.event === 'done');
    expect(doneIdx).toBeGreaterThanOrEqual(0);
    const tokenFramesBeforeDone = frames
      .slice(0, doneIdx)
      .filter((f) => f.event === 'token');
    expect(tokenFramesBeforeDone.length).toBeGreaterThanOrEqual(2);
    // Done carries the assistant message id.
    expect((frames[doneIdx]!.data as { messageId: string }).messageId).toBeTruthy();
    // A citation frame precedes done.
    expect(frames.slice(0, doneIdx).some((f) => f.event === 'citation')).toBe(true);
  });

  test('post-flush error → terminal event:error frame, NOT a JSON onError body (SHOULD-FIX #7)', async () => {
    __setAiClientForTests({ embed: fakeEmbed, chatStream: throwAfterFirst() });
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const convId = await createConversation(cookie);

    const res = await streamReq(cookie, convId, 'will fail mid-stream');
    // Headers were committed as event-stream BEFORE the error → status 200,
    // content-type is event-stream, and the body carries an `event: error` frame
    // rather than a JSON `{ error: 'InternalServerError' }` from app.ts's onError.
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const frames = await readSse(res);

    expect(frames.some((f) => f.event === 'token')).toBe(true);
    const errFrame = frames.find((f) => f.event === 'error');
    expect(errFrame).toBeTruthy();
    expect((errFrame!.data as { message: string }).message).toContain('upstream_5xx');
    // No done frame on a mid-stream failure.
    expect(frames.some((f) => f.event === 'done')).toBe(false);

    // No half-message persisted (assistant message only written at `done`).
    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, convId))
      .orderBy(asc(messagesTable.createdAt));
    // Only the user turn was persisted (assistant persistence is gated on done).
    expect(msgs.filter((m) => m.role === 'assistant').length).toBe(0);
    expect(msgs.filter((m) => m.role === 'user').length).toBe(1);
  });

  // ── Grounding (AC2/AC3) ─────────────────────────────────────────────────────

  test('grounding: seeded+indexed card on topic X → asking X cites the card (AC2)', async () => {
    __setAiClientForTests({
      embed: fakeEmbed,
      chatStream: scriptedChat(['Mitochondria ', 'are ', 'the ', 'powerhouse.']),
    });
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);
    const card = await seedBasicCard(app, cookie, {
      deckId,
      front: 'What are mitochondria?',
      back: 'The powerhouse of the cell',
    });
    await drainIndexQueue({ timeoutMs: 5000 });

    const convId = await createConversation(cookie);
    // Ask using the exact render_text so the query embedding matches the chunk
    // (the fake embedder is text-deterministic).
    const res = await streamReq(cookie, convId, card.renderText);
    const frames = await readSse(res);

    const citationFrame = frames.find((f) => f.event === 'citation');
    expect(citationFrame).toBeTruthy();
    const citations = (citationFrame!.data as { citations: { cardId: string }[] }).citations;
    expect(citations.map((c) => c.cardId)).toContain(card.id);

    // The assembled prompt carried the retrieved card text (grounding contract).
    const promptText = JSON.stringify(capturedChatMessages);
    expect(promptText).toContain(`[card:${card.id}]`);
    expect(promptText).toContain('powerhouse');
  });

  test('citations persisted on the assistant message (AC3/AC5)', async () => {
    __setAiClientForTests({
      embed: fakeEmbed,
      chatStream: scriptedChat(['ans', 'wer']),
    });
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);
    const card = await seedBasicCard(app, cookie, { deckId, front: 'Cite me', back: 'persisted' });
    await drainIndexQueue({ timeoutMs: 5000 });

    const convId = await createConversation(cookie);
    const res = await streamReq(cookie, convId, card.renderText);
    const frames = await readSse(res);
    const doneId = (frames.find((f) => f.event === 'done')!.data as { messageId: string }).messageId;

    // Re-read the persisted assistant message + citations.
    const [assistant] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, doneId))
      .limit(1);
    expect(assistant).toBeTruthy();
    expect(assistant!.role).toBe('assistant');
    expect(assistant!.content).toBe('answer');
    expect(assistant!.citations.map((c) => c.cardId)).toContain(card.id);

    // The thread re-read via GET returns both turns with the citations.
    const thread = await callApp(app, 'GET', `/chat/conversations/${convId}`, { cookie });
    const body = await thread.json<{ messages: { role: string; citations: { cardId: string }[] }[] }>();
    const persistedAssistant = body.messages.find((m) => m.role === 'assistant');
    expect(persistedAssistant!.citations.map((c) => c.cardId)).toContain(card.id);
  });

  // ── Not-found path (AC1) ────────────────────────────────────────────────────

  test('not-found: no matching card → empty retrieval → assistant persisted with empty citations (AC1)', async () => {
    // Stub the model to produce the honest "not in your cards" answer (the prompt
    // builder selects the NOT_FOUND system prompt when retrieval is empty).
    __setAiClientForTests({
      embed: fakeEmbed,
      chatStream: scriptedChat(['This ', 'information ', 'is ', 'not ', 'in ', 'your ', 'cards.']),
    });
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    // No cards seeded → retrieval is empty.
    const convId = await createConversation(cookie);
    const res = await streamReq(cookie, convId, 'something nobody has a card about');
    const frames = await readSse(res);

    const citationFrame = frames.find((f) => f.event === 'citation');
    expect(citationFrame).toBeTruthy();
    expect((citationFrame!.data as { citations: unknown[] }).citations).toEqual([]);

    const doneId = (frames.find((f) => f.event === 'done')!.data as { messageId: string }).messageId;
    const [assistant] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, doneId))
      .limit(1);
    expect(assistant!.citations).toEqual([]);
    expect(assistant!.content.toLowerCase()).toContain('not in your cards');

    // The empty-context branch sent the NOT_FOUND system prompt.
    const promptText = JSON.stringify(capturedChatMessages);
    expect(promptText).toContain('No relevant cards were found');
  });

  // ── Disabled gate ───────────────────────────────────────────────────────────

  test('ai_disabled → 503 when chat is disabled', async () => {
    // Inject ONLY an embedder — no chatStream → isChatEnabled() stays false.
    __setAiClientForTests({ embed: fakeEmbed });
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const convId = await createConversation(cookie);

    const res = await streamReq(cookie, convId, 'hi');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: 'ai_disabled' });
  });

  test('stream on a foreign conversation → 404 (pre-flush)', async () => {
    const a = await signUpAndCookie(app, uniqueEmail('a'));
    const b = await signUpAndCookie(app, uniqueEmail('b'));
    const aConv = await createConversation(a.cookie);
    const res = await streamReq(b.cookie, aConv, 'hi');
    expect(res.status).toBe(404);
  });

  // ── GET /cards/:id (SHOULD-FIX #4) ──────────────────────────────────────────

  test('GET /cards/:id returns the caller card; 404 on a foreign id', async () => {
    const a = await signUpAndCookie(app, uniqueEmail('a'));
    const b = await signUpAndCookie(app, uniqueEmail('b'));
    const deckA = await freshDeck(a.cookie, 'A');
    const card = await seedBasicCard(app, a.cookie, { deckId: deckA, front: 'mine', back: 'card' });

    // Owner fetch → enriched card.
    const mine = await callApp(app, 'GET', `/cards/${card.id}`, { cookie: a.cookie });
    expect(mine.status).toBe(200);
    const body = await mine.json<{ id: string; note: { fieldValues: Record<string, string> } | null }>();
    expect(body.id).toBe(card.id);
    expect(body.note).not.toBeNull();
    expect(body.note!.fieldValues.Front).toBe('mine');

    // Foreign fetch → 404.
    const foreign = await callApp(app, 'GET', `/cards/${card.id}`, { cookie: b.cookie });
    expect(foreign.status).toBe(404);
  });
});
