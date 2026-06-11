// NotebookLM M3 — auto-provenance integration tests (search_source → create_card
// → card_sources edges).
//
// CONTRACT (read from ai.ts runAgentTurn + the /resume apply path + provenance.ts,
// NOT invented):
//   * A notebook create_card that SUSPENDS after reading source passages stamps
//     `messages.grounding = { chunkIds: [...] }` on the pending assistant
//     tool_calls row (so provenance survives /resume + reload), and the
//     `await_confirmation` impact carries `provenance: [{ sourceTitle, page?,
//     chunkId }]` (capped CARD_SOURCE_LINK_CAP).
//   * Resume APPLY → writeCardProvenance inserts one card_sources edge per
//     (created card × distinct grounding chunk): sourceChunkId/sourceId/
//     notebookId/conversationId/messageId all set; messageId = the pending
//     assistant row id. Capped at CARD_SOURCE_LINK_CAP distinct chunks per card.
//   * Reject ⇒ zero edges. All-excluded cardSelections ⇒ degrades to reject ⇒
//     zero edges. Partial exclusion (batch of 2, exclude 1) ⇒ only the created
//     card is linked.
//   * Idempotent double-apply (same toolCallId) ⇒ no duplicate edges.
//   * A GLOBAL (non-notebook) create_card turn stamps NO grounding and writes
//     ZERO card_sources rows.
//
// Harness mirrors agent-confirm.test.ts (the scripted fake's call counter
// persists across /stream and /resume). Document fixtures inserted directly via
// db; the chunk embedding = vectorFor(chunk.text) so a search query equal to a
// chunk's text ranks it deterministically (cosine 1.0).

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cardSources as cardSourcesTable,
  cards as cardsTable,
  db,
  ensureBuiltins,
  kbChunk,
  messages as messagesTable,
  notebooks as notebooksTable,
  sourceChunks as sourceChunksTable,
  sources as sourcesTable,
} from '@neuronexus/db';
import { and, asc, eq } from 'drizzle-orm';
import { buildApp } from '../src/app.ts';
import {
  __resetAiClientForTests,
  __setAiClientForTests,
  type AgentChatMessage,
  type AgentStreamChunk,
} from '../src/ai/openai-client.ts';
import { callApp, resetTestDb, signUpAndCookie, uniqueEmail } from './helpers.ts';

const app = buildApp();
const EMBED_DIM = 1536;

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

// ── Scripted agentic fake (counter persists across /stream + /resume) ──────────

interface ToolCallScript {
  id: string;
  name: string;
  args: Record<string, unknown>;
}
interface AgentTurn {
  content?: string[];
  toolCalls?: ToolCallScript[];
  finish: 'stop' | 'tool_calls';
}
function answerTurn(text: string): AgentTurn {
  return { content: [text], finish: 'stop' };
}
function searchTurn(calls: ToolCallScript[]): AgentTurn {
  return { toolCalls: calls, finish: 'tool_calls' };
}
function writeTurn(call: ToolCallScript): AgentTurn {
  return { toolCalls: [call], finish: 'tool_calls' };
}

function scriptedAgentStream(script: AgentTurn[]) {
  let call = 0;
  return async function* (_messages: AgentChatMessage[]): AsyncIterable<AgentStreamChunk> {
    const turn = script[call++];
    if (!turn) {
      yield { type: 'finish', reason: 'stop' };
      return;
    }
    for (const c of turn.content ?? []) yield { type: 'content', text: c };
    let index = 0;
    for (const tc of turn.toolCalls ?? []) {
      const argsJson = JSON.stringify(tc.args);
      const mid = Math.floor(argsJson.length / 2);
      yield { type: 'tool_call_delta', index, id: tc.id, name: tc.name };
      yield { type: 'tool_call_delta', index, argsFragment: argsJson.slice(0, mid) };
      yield { type: 'tool_call_delta', index, argsFragment: argsJson.slice(mid) };
      index += 1;
    }
    yield { type: 'finish', reason: turn.finish };
  };
}

interface SseFrame {
  event: string;
  data: unknown;
}
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

function streamReq(
  cookie: string,
  convId: string,
  content: string,
  extra: Record<string, unknown> = {},
): Promise<Response> {
  return app.handle(
    new Request(`http://localhost/chat/conversations/${convId}/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ content, ...extra }),
    }),
  );
}
function resumeReq(
  cookie: string,
  convId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return app.handle(
    new Request(`http://localhost/chat/conversations/${convId}/resume`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    }),
  );
}

// ── Fixture helpers ────────────────────────────────────────────────────────────

async function freshNotebook(userId: string, title = 'NB'): Promise<string> {
  const [nb] = await db
    .insert(notebooksTable)
    .values({ userId, title })
    .returning({ id: notebooksTable.id });
  return nb!.id;
}

async function seedReadySource(
  userId: string,
  notebookId: string,
  title: string,
  chunks: { text: string; page?: number }[],
): Promise<{ sourceId: string; chunkIds: string[] }> {
  const [src] = await db
    .insert(sourcesTable)
    .values({
      userId,
      notebookId,
      kind: 'text',
      title,
      status: 'ready',
      verified: true,
      chunkCount: chunks.length,
    })
    .returning({ id: sourcesTable.id });
  const sourceId = src!.id;
  const chunkIds: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    const [sc] = await db
      .insert(sourceChunksTable)
      .values({ userId, sourceId, notebookId, position: i, text: c.text, page: c.page, embedded: true })
      .returning({ id: sourceChunksTable.id });
    chunkIds.push(sc!.id);
    await db.insert(kbChunk).values({
      userId,
      sourceType: 'document',
      sourceId,
      parentId: notebookId,
      position: i,
      text: c.text,
      embedding: vectorFor(c.text),
      embeddingModel: 'test-fixture',
      sourceHash: `fixture-${sourceId}-${i}`,
      cardId: null,
    });
  }
  return { sourceId, chunkIds };
}

async function createConversation(
  cookie: string,
  body: Record<string, unknown> = {},
): Promise<string> {
  const res = await callApp(app, 'POST', '/chat/conversations', { cookie, body });
  expect(res.status).toBe(200);
  return (await res.json<{ id: string }>()).id;
}
async function freshDeck(cookie: string, name = 'Deck'): Promise<string> {
  const res = await callApp(app, 'POST', '/decks', { cookie, body: { name } });
  return (await res.json<{ id: string }>()).id;
}

/** All card_sources edges for a user, oldest-first. */
async function edgesFor(userId: string) {
  return db
    .select()
    .from(cardSourcesTable)
    .where(eq(cardSourcesTable.userId, userId))
    .orderBy(asc(cardSourcesTable.createdAt));
}

describe('card provenance — suspend stamps grounding + impact preview', () => {
  beforeEach(async () => {
    await resetTestDb();
    await ensureBuiltins(db);
  });
  afterEach(() => {
    __resetAiClientForTests();
  });

  test('search_source then a suspended create_card stamps grounding + carries provenance impact', async () => {
    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
    const notebookId = await freshNotebook(userId, 'Bio');
    const deckId = await freshDeck(cookie);
    const { chunkIds } = await seedReadySource(userId, notebookId, 'Cell Biology', [
      { text: 'mitochondria produce ATP', page: 12 },
    ]);

    __setAiClientForTests({
      embed: fakeEmbed,
      chatStreamAgentic: scriptedAgentStream([
        searchTurn([{ id: 's1', name: 'search_source', args: { query: 'mitochondria produce ATP' } }]),
        // Then a create_card grounded on what it read (paused for confirm).
        writeTurn({
          id: 'w1',
          name: 'create_card',
          args: { deckId, fieldValues: { Front: 'What makes ATP?', Back: 'Mitochondria' } },
        }),
        answerTurn('Created the card.'),
      ]),
    });

    const convId = await createConversation(cookie, { notebookId });
    const frames = await readSse(await streamReq(cookie, convId, 'make a card about ATP'));

    // await_confirmation carries the provenance preview (AC3.2).
    const await_ = frames.find((f) => f.event === 'await_confirmation');
    expect(await_).toBeTruthy();
    const impact = (await_!.data as {
      impact?: { provenance?: { sourceTitle: string; page?: number; chunkId: string }[] };
    }).impact;
    expect(impact?.provenance).toBeTruthy();
    expect(impact!.provenance!.length).toBe(1);
    expect(impact!.provenance![0]).toEqual({
      sourceTitle: 'Cell Biology',
      page: 12,
      chunkId: chunkIds[0]!,
    });

    // The pending assistant tool_calls row carries the grounding snapshot.
    const rows = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, convId))
      .orderBy(asc(messagesTable.createdAt));
    const pendingRow = rows.find(
      (r) => r.role === 'assistant' && (r.toolCalls?.[0]?.name === 'create_card'),
    );
    expect(pendingRow).toBeTruthy();
    expect(pendingRow!.grounding).toEqual({ chunkIds: [chunkIds[0]!] });

    // No edges yet (still paused, nothing applied).
    expect((await edgesFor(userId)).length).toBe(0);
  });
});

describe('card provenance — resume apply writes card_sources edges', () => {
  beforeEach(async () => {
    await resetTestDb();
    await ensureBuiltins(db);
  });
  afterEach(() => {
    __resetAiClientForTests();
  });

  test('apply links each created card to its grounding chunks (full provenance chain, messageId = pending row id)', async () => {
    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
    const notebookId = await freshNotebook(userId, 'NB');
    const deckId = await freshDeck(cookie);
    const { sourceId, chunkIds } = await seedReadySource(userId, notebookId, 'Doc', [
      { text: 'fact one passage', page: 1 },
      { text: 'fact two passage', page: 2 },
    ]);

    __setAiClientForTests({
      embed: fakeEmbed,
      chatStreamAgentic: scriptedAgentStream([
        // Read BOTH chunks (two searches accumulate two distinct grounding ids).
        searchTurn([
          { id: 's1', name: 'search_source', args: { query: 'fact one passage' } },
          { id: 's2', name: 'search_source', args: { query: 'fact two passage' } },
        ]),
        writeTurn({
          id: 'w1',
          name: 'create_card',
          args: { deckId, fieldValues: { Front: 'Q', Back: 'A' } },
        }),
        answerTurn('Done.'),
      ]),
    });

    const convId = await createConversation(cookie, { notebookId });
    await readSse(await streamReq(cookie, convId, 'make a card from both facts'));

    // The pending row id is the provenance messageId.
    const beforeApply = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, convId))
      .orderBy(asc(messagesTable.createdAt));
    const pendingRow = beforeApply.find(
      (r) => r.role === 'assistant' && r.toolCalls?.[0]?.name === 'create_card',
    )!;

    const resumeFrames = await readSse(
      await resumeReq(cookie, convId, { resumeToolCallId: 'w1', decision: 'apply' }),
    );
    expect(resumeFrames.some((f) => f.event === 'done')).toBe(true);

    // Exactly one card created.
    const cards = await db.select().from(cardsTable).where(eq(cardsTable.userId, userId));
    expect(cards.length).toBe(1);
    const cardId = cards[0]!.id;

    // Two edges: one per (card × distinct chunk). Full chain populated.
    const edges = await edgesFor(userId);
    expect(edges.length).toBe(2);
    const linkedChunks = edges.map((e) => e.sourceChunkId).sort();
    expect(linkedChunks).toEqual([...chunkIds].sort());
    for (const e of edges) {
      expect(e.cardId).toBe(cardId);
      expect(e.sourceId).toBe(sourceId);
      expect(e.notebookId).toBe(notebookId);
      expect(e.conversationId).toBe(convId);
      expect(e.messageId).toBe(pendingRow.id);
    }
  });

  test('cap: grounding beyond CARD_SOURCE_LINK_CAP links only the first K chunks per card', async () => {
    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
    const notebookId = await freshNotebook(userId, 'NB');
    const deckId = await freshDeck(cookie);
    // CARD_SOURCE_LINK_CAP default = 5. Seed 7 chunks and read all 7 → only the
    // first 5 (accumulation order) get linked.
    const chunkTexts = Array.from({ length: 7 }, (_, i) => `cap passage ${i}`);
    const { chunkIds } = await seedReadySource(
      userId,
      notebookId,
      'Big',
      chunkTexts.map((t, i) => ({ text: t, page: i + 1 })),
    );

    __setAiClientForTests({
      embed: fakeEmbed,
      chatStreamAgentic: scriptedAgentStream([
        // One search per chunk, in order → grounding accumulates 0..6.
        searchTurn(chunkTexts.map((t, i) => ({ id: `s${i}`, name: 'search_source', args: { query: t } }))),
        writeTurn({
          id: 'w1',
          name: 'create_card',
          args: { deckId, fieldValues: { Front: 'Q', Back: 'A' } },
        }),
        answerTurn('Done.'),
      ]),
    });

    const convId = await createConversation(cookie, { notebookId });
    await readSse(await streamReq(cookie, convId, 'card from all'));
    await readSse(await resumeReq(cookie, convId, { resumeToolCallId: 'w1', decision: 'apply' }));

    const edges = await edgesFor(userId);
    // Capped at exactly CARD_SOURCE_LINK_CAP (5) DISTINCT chunks for the one card,
    // even though 7 distinct chunks were grounded this turn.
    expect(edges.length).toBe(5);
    const linked = new Set(edges.map((e) => e.sourceChunkId));
    expect(linked.size).toBe(5);
    // Every linked chunk is one of the seeded source's chunks (no fabrication).
    const seeded = new Set(chunkIds);
    for (const id of linked) expect(seeded.has(id!)).toBe(true);
  });
});

describe('card provenance — reject / exclusion / global', () => {
  beforeEach(async () => {
    await resetTestDb();
    await ensureBuiltins(db);
  });
  afterEach(() => {
    __resetAiClientForTests();
  });

  test('reject ⇒ zero card_sources edges (and zero cards)', async () => {
    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
    const notebookId = await freshNotebook(userId, 'NB');
    const deckId = await freshDeck(cookie);
    await seedReadySource(userId, notebookId, 'Doc', [{ text: 'rejected passage' }]);

    __setAiClientForTests({
      embed: fakeEmbed,
      chatStreamAgentic: scriptedAgentStream([
        searchTurn([{ id: 's1', name: 'search_source', args: { query: 'rejected passage' } }]),
        writeTurn({
          id: 'w1',
          name: 'create_card',
          args: { deckId, fieldValues: { Front: 'Q', Back: 'A' } },
        }),
        answerTurn('Okay, not creating it.'),
      ]),
    });

    const convId = await createConversation(cookie, { notebookId });
    await readSse(await streamReq(cookie, convId, 'maybe a card'));
    await readSse(await resumeReq(cookie, convId, { resumeToolCallId: 'w1', decision: 'reject' }));

    expect((await db.select().from(cardsTable).where(eq(cardsTable.userId, userId))).length).toBe(0);
    expect((await edgesFor(userId)).length).toBe(0);
  });

  test('cardSelections all-excluded ⇒ degrades to reject ⇒ zero edges', async () => {
    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
    const notebookId = await freshNotebook(userId, 'NB');
    const deckId = await freshDeck(cookie);
    await seedReadySource(userId, notebookId, 'Doc', [{ text: 'excluded passage' }]);

    __setAiClientForTests({
      embed: fakeEmbed,
      chatStreamAgentic: scriptedAgentStream([
        searchTurn([{ id: 's1', name: 'search_source', args: { query: 'excluded passage' } }]),
        // Single-card proposal — index 0.
        writeTurn({
          id: 'w1',
          name: 'create_card',
          args: { deckId, fieldValues: { Front: 'Q', Back: 'A' } },
        }),
        answerTurn('Understood.'),
      ]),
    });

    const convId = await createConversation(cookie, { notebookId });
    await readSse(await streamReq(cookie, convId, 'a card'));
    await readSse(
      await resumeReq(cookie, convId, {
        resumeToolCallId: 'w1',
        decision: 'apply',
        cardSelections: [{ index: 0, include: false }],
      }),
    );

    expect((await db.select().from(cardsTable).where(eq(cardsTable.userId, userId))).length).toBe(0);
    expect((await edgesFor(userId)).length).toBe(0);
  });

  test('partial exclusion (batch of 2, exclude 1) ⇒ only the created card is linked', async () => {
    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
    const notebookId = await freshNotebook(userId, 'NB');
    const deckId = await freshDeck(cookie);
    const { chunkIds } = await seedReadySource(userId, notebookId, 'Doc', [
      { text: 'shared passage' },
    ]);

    __setAiClientForTests({
      embed: fakeEmbed,
      chatStreamAgentic: scriptedAgentStream([
        searchTurn([{ id: 's1', name: 'search_source', args: { query: 'shared passage' } }]),
        // A BATCH of two cards.
        writeTurn({
          id: 'w1',
          name: 'create_card',
          args: {
            deckId,
            cards: [
              { fieldValues: { Front: 'Keep Q', Back: 'Keep A' } },
              { fieldValues: { Front: 'Drop Q', Back: 'Drop A' } },
            ],
          },
        }),
        answerTurn('Created one.'),
      ]),
    });

    const convId = await createConversation(cookie, { notebookId });
    await readSse(await streamReq(cookie, convId, 'two cards'));
    // Exclude the SECOND card (index 1).
    await readSse(
      await resumeReq(cookie, convId, {
        resumeToolCallId: 'w1',
        decision: 'apply',
        cardSelections: [{ index: 1, include: false }],
      }),
    );

    // Exactly one card was created (the kept one).
    const cards = await db.select().from(cardsTable).where(eq(cardsTable.userId, userId));
    expect(cards.length).toBe(1);
    expect(cards[0]!.renderFrontText).toBe('Keep Q');

    // ONE edge: the single created card linked to the single grounding chunk.
    const edges = await edgesFor(userId);
    expect(edges.length).toBe(1);
    expect(edges[0]!.cardId).toBe(cards[0]!.id);
    expect(edges[0]!.sourceChunkId).toBe(chunkIds[0]!);
  });

  test('idempotent double-apply (second resume, same toolCallId) ⇒ no duplicate edges', async () => {
    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
    const notebookId = await freshNotebook(userId, 'NB');
    const deckId = await freshDeck(cookie);
    await seedReadySource(userId, notebookId, 'Doc', [{ text: 'idempotent passage' }]);

    __setAiClientForTests({
      embed: fakeEmbed,
      chatStreamAgentic: scriptedAgentStream([
        searchTurn([{ id: 's1', name: 'search_source', args: { query: 'idempotent passage' } }]),
        writeTurn({
          id: 'w1',
          name: 'create_card',
          args: { deckId, fieldValues: { Front: 'Q', Back: 'A' } },
        }),
        answerTurn('Created.'),
      ]),
    });

    const convId = await createConversation(cookie, { notebookId });
    await readSse(await streamReq(cookie, convId, 'one card'));

    // First apply.
    await readSse(await resumeReq(cookie, convId, { resumeToolCallId: 'w1', decision: 'apply' }));
    const afterFirst = await edgesFor(userId);
    expect(afterFirst.length).toBe(1);

    // Second apply with the SAME id — terminal no-op, no duplicate card, no dup edge.
    await readSse(await resumeReq(cookie, convId, { resumeToolCallId: 'w1', decision: 'apply' }));
    const afterSecond = await edgesFor(userId);
    expect(afterSecond.length).toBe(1);
    expect((await db.select().from(cardsTable).where(eq(cardsTable.userId, userId))).length).toBe(1);
  });

  test('GLOBAL (non-notebook) create_card ⇒ no grounding stamped, zero card_sources edges', async () => {
    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);

    __setAiClientForTests({
      embed: fakeEmbed,
      chatStreamAgentic: scriptedAgentStream([
        writeTurn({
          id: 'w1',
          name: 'create_card',
          args: { deckId, fieldValues: { Front: 'Global Q', Back: 'Global A' } },
        }),
        answerTurn('Created.'),
      ]),
    });

    // A GLOBAL conversation (no notebookId).
    const convId = await createConversation(cookie, {});
    const frames = await readSse(await streamReq(cookie, convId, 'make a card'));

    // No provenance preview on the global confirm.
    const await_ = frames.find((f) => f.event === 'await_confirmation');
    const impact = (await_!.data as { impact?: { provenance?: unknown } }).impact;
    expect(impact?.provenance).toBeUndefined();

    // The pending row carries NO grounding snapshot.
    const rows = await db
      .select()
      .from(messagesTable)
      .where(and(eq(messagesTable.conversationId, convId), eq(messagesTable.role, 'assistant')));
    const pending = rows.find((r) => r.toolCalls?.[0]?.name === 'create_card');
    expect(pending!.grounding).toBeNull();

    await readSse(await resumeReq(cookie, convId, { resumeToolCallId: 'w1', decision: 'apply' }));

    // The card was created (global write works) but NO provenance edges exist.
    expect((await db.select().from(cardsTable).where(eq(cardsTable.userId, userId))).length).toBe(1);
    expect((await edgesFor(userId)).length).toBe(0);
  });
});
