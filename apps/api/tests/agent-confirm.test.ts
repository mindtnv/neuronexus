// S11 Phase B — confirm-before-write integration tests (the confirm→apply→resume
// cycle for the agentic chat's write/SRS tools).
//
// CONTRACT (read from apps/api/src/modules/ai.ts — `runAgentTurn` + the
// `/resume` route, NOT invented):
//   * When a finalized tool call is a write/SRS tool (`kind !== 'read'`), the
//     initial `/stream` turn:
//       - emits `tool_call(name, running)` then `await_confirmation`
//         (carrying `{ toolCall:{id,name,args}, impact? }` — `impact` present
//         only when the dry-run found a non-empty blast radius);
//       - commits the transcript UP TO AND INCLUDING the pending assistant
//         `tool_calls` row (NO `role:tool` row, NO final assistant text row);
//       - CLOSES the stream WITHOUT a `done` (the turn is suspended).
//   * `POST /chat/conversations/:id/resume { resumeToolCallId, decision }`:
//       - apply  → executes the wrapped handler in ONE tx with the `role:tool`
//                  insert, emits `tool_result(ok)`, enqueues the created/updated
//                  cards for indexing, then CONTINUES the loop to `done`.
//       - reject → persists a `role:tool` "user_rejected" row, continues to `done`.
//       - already-answered id → terminal no-op `done` (never re-executes).
//       - unknown id (or foreign conversation) → 404 pre-flush, never executes.
//
// Same in-process / injection harness as agent-chat.test.ts + chat.test.ts:
// NODE_ENV=test forces the real AI flags off; injecting `chatStreamAgentic`
// flips `isChatEnabled()` on. The scripted fake is ONE generator instance whose
// per-call counter persists ACROSS the /stream and /resume requests of a turn:
//   /stream      → call #0 (the write-tool turn, finish:tool_calls) → suspends
//   /resume apply→ call #1 (the content answer, finish:stop) → done
// `ensureBuiltins(db)` runs in beforeEach so `create_card`'s default Basic
// note-type (a global builtin, user_id NULL) exists after the bare-schema reset.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cards as cardsTable,
  db,
  ensureBuiltins,
  messages as messagesTable,
  notes as notesTable,
} from '@neuronexus/db';
import { asc, eq } from 'drizzle-orm';
import { buildApp } from '../src/app.ts';
import {
  __resetAiClientForTests,
  __setAiClientForTests,
  type AgentChatMessage,
  type AgentStreamChunk,
} from '../src/ai/openai-client.ts';
import { drainIndexQueue } from '../src/ai/index-queue.ts';
import { callApp, resetTestDb, seedNote, signUpAndCookie, uniqueEmail } from './helpers.ts';

const app = buildApp();
const EMBED_DIM = 1536;

// Deterministic text→vector (shared shape with the other RAG tests). Only needed
// so the injected client carries an `embed` member — the write tests don't assert
// on retrieval, but the index queue exercises it when a card is created.
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

// ── Scripted agentic fake (one AgentTurn per `chatStreamAgentic` call) ─────────
//
// Each `chatStreamAgentic` call (one agent step, on either /stream or /resume)
// consumes the next AgentTurn. A `writeTurn` scripts the model emitting a single
// write/SRS tool call with FRAGMENTED JSON args (id+name first, then the args
// string split across two `tool_call_delta` chunks — mirrors a real gateway that
// streams `function.arguments` in pieces) + `finish:tool_calls`. An `answerTurn`
// scripts the post-resume content + `finish:stop`.

interface ToolCallScript {
  id: string;
  name: string;
  /** Arg object — JSON-stringified, then split into fragments on the wire. */
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

/**
 * Script a write/SRS tool-call turn: the model emits ONE tool call whose JSON
 * arguments are FRAGMENTED across deltas (proves the loop's index-keyed
 * accumulator reassembles them before JSON.parse at confirm time), then
 * `finish:tool_calls`. The turn carries NO content (a write turn pauses before
 * the model answers).
 */
function writeTurn(call: ToolCallScript): AgentTurn {
  return { toolCalls: [call], finish: 'tool_calls' };
}

/** All `messages[]` arrays each `chatStreamAgentic` call observed (call order). */
let capturedAgentMessages: AgentChatMessage[][] = [];

/**
 * Build a `chatStreamAgentic` fake from an ordered turn script. ONE generator
 * instance — its `call` counter persists across BOTH the /stream call (the write
 * turn) and the /resume continuation call (the answer turn) of a confirm cycle.
 * Tool-call args are split into two `argsFragment` chunks so the loop must
 * accumulate index-keyed fragments before parsing.
 */
function scriptedAgentStream(script: AgentTurn[]) {
  let call = 0;
  return async function* (messages: AgentChatMessage[]): AsyncIterable<AgentStreamChunk> {
    capturedAgentMessages.push(messages);
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
      // id + name first (no args), then the args JSON split across two fragments.
      yield { type: 'tool_call_delta', index, id: tc.id, name: tc.name };
      yield { type: 'tool_call_delta', index, argsFragment: argsJson.slice(0, mid) };
      yield { type: 'tool_call_delta', index, argsFragment: argsJson.slice(mid) };
      index += 1;
    }
    yield { type: 'finish', reason: turn.finish };
  };
}

// ── SSE reader (mirrors the other chat suites) ────────────────────────────────

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

async function streamReq(cookie: string, convId: string, content: string): Promise<Response> {
  const req = new Request(`http://localhost/chat/conversations/${convId}/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ content }),
  });
  return app.handle(req);
}
async function resumeReq(
  cookie: string,
  convId: string,
  body: { resumeToolCallId: string; decision: 'apply' | 'reject' },
): Promise<Response> {
  const req = new Request(`http://localhost/chat/conversations/${convId}/resume`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
  return app.handle(req);
}
async function createConversation(cookie: string): Promise<string> {
  const res = await callApp(app, 'POST', '/chat/conversations', { cookie, body: {} });
  expect(res.status).toBe(200);
  return (await res.json<{ id: string }>()).id;
}
async function freshDeck(cookie: string, name = 'D'): Promise<string> {
  return (
    await (await callApp(app, 'POST', '/decks', { cookie, body: { name } })).json<{ id: string }>()
  ).id;
}

/** Rows of a conversation, oldest-first (the persisted transcript). */
async function transcriptRows(convId: string) {
  return db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, convId))
    .orderBy(asc(messagesTable.createdAt));
}

describe('agentic chat — confirm-before-write (Phase B)', () => {
  beforeEach(async () => {
    await resetTestDb();
    await ensureBuiltins(db); // create_card defaults noteTypeId to the global Basic.
    capturedAgentMessages = [];
  });
  afterEach(() => {
    __resetAiClientForTests();
  });

  // ── 1. confirm → apply → resume (create_card) ───────────────────────────────
  test('create_card: stream suspends (no done), apply creates the note+card and resumes to done', async () => {
    // Spy on embed so we can prove the post-apply index hook enqueued the new card.
    const embedded: string[] = [];
    const embed = (texts: string[]): Promise<number[][]> => {
      embedded.push(...texts);
      return Promise.resolve(texts.map(vectorFor));
    };

    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);

    __setAiClientForTests({
      embed,
      chatStreamAgentic: scriptedAgentStream([
        // /stream: the model proposes a create_card write (paused for confirm).
        writeTurn({
          id: 'w_create',
          name: 'create_card',
          args: { deckId, fieldValues: { Front: 'Capital of France', Back: 'Paris' } },
        }),
        // /resume apply: the model acknowledges the created card.
        answerTurn('Done — I created the card for you.'),
      ]),
    });

    const convId = await createConversation(cookie);

    // --- /stream: assert pause contract ---
    const streamFrames = await readSse(await streamReq(cookie, convId, 'make a card about Paris'));

    const toolCall = streamFrames.find((f) => f.event === 'tool_call');
    expect(toolCall).toBeTruthy();
    expect((toolCall!.data as { name: string; status: string }).name).toBe('create_card');
    expect((toolCall!.data as { status: string }).status).toBe('running');

    const await_ = streamFrames.find((f) => f.event === 'await_confirmation');
    expect(await_).toBeTruthy();
    const awaitData = await_!.data as {
      toolCall: { id: string; name: string; args: string };
      impact?: { willCreateCards?: number };
    };
    expect(awaitData.toolCall.id).toBe('w_create');
    expect(awaitData.toolCall.name).toBe('create_card');
    // dry-run blast radius: a Basic note generates exactly one card.
    expect(awaitData.impact?.willCreateCards).toBeGreaterThanOrEqual(1);

    // The stream SUSPENDS: NO `done`, NO `tool_result`, NO `citation`.
    expect(streamFrames.some((f) => f.event === 'done')).toBe(false);
    expect(streamFrames.some((f) => f.event === 'tool_result')).toBe(false);

    // Transcript so far: the user row + the pending assistant tool_calls row ONLY.
    const pausedRows = await transcriptRows(convId);
    expect(pausedRows.map((r) => r.role)).toEqual(['user', 'assistant']);
    const pendingRow = pausedRows[1]!;
    expect(pendingRow.toolCalls?.[0]?.name).toBe('create_card');
    expect(pendingRow.content).toBe('');
    expect(pausedRows.some((r) => r.role === 'tool')).toBe(false);

    // NOTHING was created yet — no note, no card.
    const notesBefore = await db.select().from(notesTable).where(eq(notesTable.userId, userId));
    const cardsBefore = await db.select().from(cardsTable).where(eq(cardsTable.userId, userId));
    expect(notesBefore.length).toBe(0);
    expect(cardsBefore.length).toBe(0);

    // --- /resume apply: the write actually happens, the turn resumes to done ---
    const resumeFrames = await readSse(
      await resumeReq(cookie, convId, { resumeToolCallId: 'w_create', decision: 'apply' }),
    );

    const result = resumeFrames.find((f) => f.event === 'tool_result');
    expect(result).toBeTruthy();
    expect((result!.data as { id: string; ok: boolean }).id).toBe('w_create');
    expect((result!.data as { ok: boolean }).ok).toBe(true);
    expect(resumeFrames.some((f) => f.event === 'done')).toBe(true);

    // A real note + card now exist.
    const notesAfter = await db.select().from(notesTable).where(eq(notesTable.userId, userId));
    const cardsAfter = await db.select().from(cardsTable).where(eq(cardsTable.userId, userId));
    expect(notesAfter.length).toBe(1);
    expect(cardsAfter.length).toBe(1);
    expect(cardsAfter[0]!.deckId).toBe(deckId);
    expect(cardsAfter[0]!.renderFrontText).toBe('Capital of France');

    // The role:tool result row is persisted, keyed by the resolved tool_call id.
    const finalRows = await transcriptRows(convId);
    const toolRow = finalRows.find((r) => r.role === 'tool');
    expect(toolRow).toBeTruthy();
    expect(toolRow!.toolCallId).toBe('w_create');
    // Final assistant text row carries the resume answer.
    const finalAssistant = finalRows.find(
      (r) => r.role === 'assistant' && (r.toolCalls?.length ?? 0) === 0,
    );
    expect(finalAssistant!.content).toBe('Done — I created the card for you.');

    // The index hook enqueued the created card AFTER the apply commit: draining
    // the queue embeds the new card's render text (proves enqueueToolCardsForIndex
    // ran on the resume path).
    await drainIndexQueue({ timeoutMs: 5000 });
    expect(embedded.some((t) => t.includes('Capital of France'))).toBe(true);
  });

  // ── 2. reject ────────────────────────────────────────────────────────────────
  test('create_card reject: no note/card created, a rejected role:tool row, model continues to done', async () => {
    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);

    __setAiClientForTests({
      embed: fakeEmbed,
      chatStreamAgentic: scriptedAgentStream([
        writeTurn({
          id: 'w_reject',
          name: 'create_card',
          args: { deckId, fieldValues: { Front: 'unwanted', Back: 'card' } },
        }),
        // After rejection the model answers without the mutation.
        answerTurn('Okay, I will not create that card.'),
      ]),
    });

    const convId = await createConversation(cookie);
    await readSse(await streamReq(cookie, convId, 'maybe make a card'));

    const resumeFrames = await readSse(
      await resumeReq(cookie, convId, { resumeToolCallId: 'w_reject', decision: 'reject' }),
    );

    // tool_result is emitted but NOT ok (user_rejected); the turn reaches done.
    const result = resumeFrames.find((f) => f.event === 'tool_result');
    expect(result).toBeTruthy();
    expect((result!.data as { ok: boolean }).ok).toBe(false);
    expect((result!.data as { summary?: string }).summary).toBe('user_rejected');
    expect(resumeFrames.some((f) => f.event === 'done')).toBe(true);

    // NOTHING created.
    const notesAfter = await db.select().from(notesTable).where(eq(notesTable.userId, userId));
    const cardsAfter = await db.select().from(cardsTable).where(eq(cardsTable.userId, userId));
    expect(notesAfter.length).toBe(0);
    expect(cardsAfter.length).toBe(0);

    // A role:tool row recording the rejection is persisted (so the model could
    // see it on the continuation), keyed by the tool_call id.
    const rows = await transcriptRows(convId);
    const toolRow = rows.find((r) => r.role === 'tool');
    expect(toolRow).toBeTruthy();
    expect(toolRow!.toolCallId).toBe('w_reject');
    expect(toolRow!.content.toLowerCase()).toContain('user_rejected');
    // The model answered.
    const finalAssistant = rows.find(
      (r) => r.role === 'assistant' && (r.toolCalls?.length ?? 0) === 0,
    );
    expect(finalAssistant!.content).toBe('Okay, I will not create that card.');
  });

  // ── 3. double-apply idempotency ──────────────────────────────────────────────
  test('double-apply: a second resume with the same id creates NO second card (terminal no-op)', async () => {
    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);

    __setAiClientForTests({
      embed: fakeEmbed,
      chatStreamAgentic: scriptedAgentStream([
        writeTurn({
          id: 'w_idem',
          name: 'create_card',
          args: { deckId, fieldValues: { Front: 'once', Back: 'only' } },
        }),
        // Continuation after the FIRST apply.
        answerTurn('Created.'),
        // (No third turn — the second apply is a no-op and never calls the model.)
      ]),
    });

    const convId = await createConversation(cookie);
    await readSse(await streamReq(cookie, convId, 'create once'));

    // First apply — creates the card and resumes to done.
    const firstFrames = await readSse(
      await resumeReq(cookie, convId, { resumeToolCallId: 'w_idem', decision: 'apply' }),
    );
    expect(firstFrames.some((f) => f.event === 'done')).toBe(true);

    const afterFirst = await db.select().from(cardsTable).where(eq(cardsTable.userId, userId));
    expect(afterFirst.length).toBe(1);

    // Second apply with the SAME id — terminal no-op `done` (or `error`), but
    // NEVER a duplicate mutation.
    const secondFrames = await readSse(
      await resumeReq(cookie, convId, { resumeToolCallId: 'w_idem', decision: 'apply' }),
    );
    const terminal = secondFrames.some((f) => f.event === 'done' || f.event === 'error');
    expect(terminal).toBe(true);

    // EXACTLY one card — the second apply did not duplicate.
    const afterSecond = await db.select().from(cardsTable).where(eq(cardsTable.userId, userId));
    expect(afterSecond.length).toBe(1);
    const notesAfter = await db.select().from(notesTable).where(eq(notesTable.userId, userId));
    expect(notesAfter.length).toBe(1);

    // Exactly one role:tool row answers the call (the partial unique index + the
    // app-level idempotency check both guard the second insert).
    const rows = await transcriptRows(convId);
    expect(rows.filter((r) => r.role === 'tool' && r.toolCallId === 'w_idem').length).toBe(1);
  });

  // ── 4. edit_card impact surfaces deletions ───────────────────────────────────
  // A 2-template custom note-type: Card 1 = {{Front}}/{{Back}}, Card 2 =
  // {{Extra}}/{{Front}}. A note with Front+Back+Extra populated generates BOTH
  // cards. The wrapped PATCH /notes path is FULL-REPLACE (resolveNoteUpdate
  // replaces the whole fieldValues map — every notes.test.ts case sends the
  // complete field set), so the edit passes the FULL field set with Extra
  // cleared: Card 2's front ({{Extra}}) renders empty → the empty-front skip drops
  // it (Card 1's front {{Front}} survives) → willDeleteCards >= 1,
  // affectsSiblings:true. On apply the regeneration runs: the dropped card is
  // gone, the survivor keeps its (same-id) FSRS row.
  test('edit_card: dropping a template ord surfaces willDeleteCards + affectsSiblings, apply deletes it', async () => {
    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);

    // Custom 2-template note-type.
    const ntRes = await callApp(app, 'POST', '/note-types', {
      cookie,
      body: {
        name: 'TwoSided',
        kind: 'custom',
        styling: '',
        fields: [
          { name: 'Front', ord: 0 },
          { name: 'Back', ord: 1 },
          { name: 'Extra', ord: 2 },
        ],
        templates: [
          { name: 'Card 1', ord: 0, frontTemplate: '{{Front}}', backTemplate: '{{Back}}' },
          { name: 'Card 2', ord: 1, frontTemplate: '{{Extra}}', backTemplate: '{{Front}}' },
        ],
      },
    });
    expect(ntRes.status).toBe(200);
    const noteTypeId = (await ntRes.json<{ id: string }>()).id;

    // Create a note with all three fields → BOTH cards generate.
    const noteRes = await callApp(app, 'POST', '/notes', {
      cookie,
      body: {
        noteTypeId,
        deckId,
        fieldValues: { Front: 'F', Back: 'B', Extra: 'E' },
        tags: [],
      },
    });
    expect(noteRes.status).toBe(200);
    const created = await noteRes.json<{ note: { id: string }; cards: { id: string; templateOrd: number }[] }>();
    expect(created.cards.length).toBe(2);
    const noteId = created.note.id;
    const survivorCard = created.cards.find((c) => c.templateOrd === 0)!;
    const droppedCard = created.cards.find((c) => c.templateOrd === 1)!;

    // The edit clears Extra → Card 2 (ord 1) drops.
    __setAiClientForTests({
      embed: fakeEmbed,
      chatStreamAgentic: scriptedAgentStream([
        writeTurn({
          id: 'w_edit',
          // Full field set with Extra cleared (PATCH /notes is full-replace).
          name: 'edit_card',
          args: { noteId, fieldValues: { Front: 'F', Back: 'B', Extra: '' } },
        }),
        answerTurn('Updated the note.'),
      ]),
    });

    const convId = await createConversation(cookie);
    const streamFrames = await readSse(await streamReq(cookie, convId, 'remove the extra side'));

    const await_ = streamFrames.find((f) => f.event === 'await_confirmation');
    expect(await_).toBeTruthy();
    const impact = (await_!.data as { impact?: { willDeleteCards?: number; affectsSiblings?: boolean } }).impact;
    expect(impact).toBeTruthy();
    expect(impact!.willDeleteCards).toBeGreaterThanOrEqual(1);
    expect(impact!.affectsSiblings).toBe(true);

    // Apply → the wrapped PATCH /notes regeneration runs: dropped card gone,
    // survivor (ord 0) keeps its row + FSRS state.
    const resumeFrames = await readSse(
      await resumeReq(cookie, convId, { resumeToolCallId: 'w_edit', decision: 'apply' }),
    );
    expect((resumeFrames.find((f) => f.event === 'tool_result')!.data as { ok: boolean }).ok).toBe(true);
    expect(resumeFrames.some((f) => f.event === 'done')).toBe(true);

    const remaining = await db
      .select()
      .from(cardsTable)
      .where(eq(cardsTable.noteId, noteId))
      .orderBy(asc(cardsTable.templateOrd));
    expect(remaining.length).toBe(1);
    expect(remaining[0]!.id).toBe(survivorCard.id); // survivor kept (same row id → FSRS intact)
    expect(remaining[0]!.templateOrd).toBe(0);
    // The dropped card is truly gone.
    const droppedStill = await db
      .select()
      .from(cardsTable)
      .where(eq(cardsTable.id, droppedCard.id));
    expect(droppedStill.length).toBe(0);

    // Sanity: the surviving card belongs to this user.
    expect(remaining[0]!.userId).toBe(userId);
  });

  // ── 4b. edit_card MERGES partial fieldValues (no silent wipe) ─────────────────
  // edit_card's description advertises a PARTIAL field→value map. The tool now
  // overlays the provided fields onto the note's CURRENT fieldValues before
  // handing the FULL set to the (full-replace) PATCH /notes helper, so editing
  // only "Front" leaves "Back" untouched — no silent blanking. A Basic note has
  // Front+Back; we edit only Front and assert Back's content survives.
  test('edit_card: partial fieldValues merges — editing one field preserves the others', async () => {
    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);

    // Seed a Basic (Front/Back) note with BOTH fields populated.
    const noteRes = await callApp(app, 'POST', '/notes', {
      cookie,
      body: {
        noteTypeId: '96bb6f6a-ad97-4e2d-9044-78a173d3df51', // BASIC_NOTE_TYPE.id (global builtin)
        deckId,
        fieldValues: { Front: 'Original front', Back: 'Original back' },
        tags: [],
      },
    });
    expect(noteRes.status).toBe(200);
    const created = await noteRes.json<{ note: { id: string }; cards: { id: string }[] }>();
    const noteId = created.note.id;
    const cardId = created.cards[0]!.id;

    // edit_card with ONLY the Front field (the data-loss footgun: a naive
    // full-replace would blank Back).
    __setAiClientForTests({
      embed: fakeEmbed,
      chatStreamAgentic: scriptedAgentStream([
        writeTurn({
          id: 'w_merge',
          name: 'edit_card',
          args: { noteId, fieldValues: { Front: 'Edited front' } },
        }),
        answerTurn('Updated the front.'),
      ]),
    });

    const convId = await createConversation(cookie);
    const streamFrames = await readSse(await streamReq(cookie, convId, 'change the front'));

    // Count-neutral edit (Basic still generates one card): no deletions surfaced.
    const await_ = streamFrames.find((f) => f.event === 'await_confirmation');
    expect(await_).toBeTruthy();
    const impact = (await_!.data as { impact?: { willDeleteCards?: number } }).impact;
    expect(impact?.willDeleteCards ?? 0).toBe(0);

    // Apply → the merged update runs.
    const resumeFrames = await readSse(
      await resumeReq(cookie, convId, { resumeToolCallId: 'w_merge', decision: 'apply' }),
    );
    expect((resumeFrames.find((f) => f.event === 'tool_result')!.data as { ok: boolean }).ok).toBe(true);
    expect(resumeFrames.some((f) => f.event === 'done')).toBe(true);

    // Still exactly one card; Front changed, Back PRESERVED (not blanked).
    const after = await db.select().from(cardsTable).where(eq(cardsTable.noteId, noteId));
    expect(after.length).toBe(1);
    expect(after[0]!.id).toBe(cardId); // same row → FSRS intact
    expect(after[0]!.renderFrontText).toBe('Edited front');
    expect(after[0]!.renderBackText).toBe('Original back'); // <-- the survivor

    // The note's stored fieldValues reflect the merge (Back untouched).
    const [noteAfter] = await db.select().from(notesTable).where(eq(notesTable.id, noteId));
    expect((noteAfter!.fieldValues as Record<string, string>).Front).toBe('Edited front');
    expect((noteAfter!.fieldValues as Record<string, string>).Back).toBe('Original back');
    expect(noteAfter!.userId).toBe(userId);
  });

  // ── 5. ownership / unknown id → 404, never executes ──────────────────────────
  test('resume with an id not in the user conversation → 404 and no mutation', async () => {
    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);

    __setAiClientForTests({
      embed: fakeEmbed,
      chatStreamAgentic: scriptedAgentStream([
        writeTurn({
          id: 'w_real',
          name: 'create_card',
          args: { deckId, fieldValues: { Front: 'real', Back: 'pending' } },
        }),
        answerTurn('Created.'),
      ]),
    });

    const convId = await createConversation(cookie);
    await readSse(await streamReq(cookie, convId, 'create a card'));

    // A resume id that does NOT match any persisted assistant tool_calls row.
    const res = await resumeReq(cookie, convId, {
      resumeToolCallId: 'totally-unknown-id',
      decision: 'apply',
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'unknown_tool_call' });

    // The real pending call was NOT executed (no card created).
    const cardsAfter = await db.select().from(cardsTable).where(eq(cardsTable.userId, userId));
    expect(cardsAfter.length).toBe(0);

    // Cross-user: a foreign conversation 404s pre-flush (never reaches the loop).
    const other = await signUpAndCookie(app, uniqueEmail('b'));
    const foreign = await resumeReq(other.cookie, convId, {
      resumeToolCallId: 'w_real',
      decision: 'apply',
    });
    expect(foreign.status).toBe(404);
    const stillNoCards = await db.select().from(cardsTable).where(eq(cardsTable.userId, userId));
    expect(stillNoCards.length).toBe(0);
  });

  // ── 6. suspend (SRS) confirm cycle ───────────────────────────────────────────
  test('suspend: confirm cycle flips the card suspended flag via the handler path', async () => {
    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);

    // Seed a real card to suspend (through the create_card confirm path would also
    // work, but a direct note create is simpler and unrelated to the assertion).
    const noteRes = await callApp(app, 'POST', '/notes', {
      cookie,
      body: {
        noteTypeId: '96bb6f6a-ad97-4e2d-9044-78a173d3df51', // BASIC_NOTE_TYPE.id (global builtin)
        deckId,
        fieldValues: { Front: 'suspend me', Back: 'please' },
        tags: [],
      },
    });
    expect(noteRes.status).toBe(200);
    const { cards: seeded } = await noteRes.json<{ cards: { id: string; suspended: boolean }[] }>();
    const cardId = seeded[0]!.id;
    expect(seeded[0]!.suspended).toBe(false);

    __setAiClientForTests({
      embed: fakeEmbed,
      chatStreamAgentic: scriptedAgentStream([
        writeTurn({ id: 'w_susp', name: 'suspend', args: { cardId, suspended: true } }),
        answerTurn('Suspended that card.'),
      ]),
    });

    const convId = await createConversation(cookie);
    const streamFrames = await readSse(await streamReq(cookie, convId, 'suspend this card'));

    // SRS tools have an empty impact → the await_confirmation carries no `impact`.
    const await_ = streamFrames.find((f) => f.event === 'await_confirmation');
    expect(await_).toBeTruthy();
    expect((await_!.data as { toolCall: { name: string } }).toolCall.name).toBe('suspend');
    expect((await_!.data as { impact?: unknown }).impact).toBeUndefined();
    expect(streamFrames.some((f) => f.event === 'done')).toBe(false);

    // Not suspended yet (pause, no mutation).
    const [beforeApply] = await db.select().from(cardsTable).where(eq(cardsTable.id, cardId));
    expect(beforeApply!.suspended).toBe(false);

    // Apply → the card flips suspended via the existing patchCard handler.
    const resumeFrames = await readSse(
      await resumeReq(cookie, convId, { resumeToolCallId: 'w_susp', decision: 'apply' }),
    );
    expect((resumeFrames.find((f) => f.event === 'tool_result')!.data as { ok: boolean }).ok).toBe(true);
    expect(resumeFrames.some((f) => f.event === 'done')).toBe(true);

    const [afterApply] = await db.select().from(cardsTable).where(eq(cardsTable.id, cardId));
    expect(afterApply!.suspended).toBe(true);
    expect(afterApply!.userId).toBe(userId);
  });

  // ── C8 — confirm previews (fieldDiffs / tagsChange / proposedFields) ─────────

  test('edit_card: await_confirmation carries before/after fieldDiffs + tagsChange (C8)', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);

    const { cards: seededCards } = await seedNote(app, cookie, {
      deckId,
      fields: { Front: 'Old front text', Back: 'Old back' },
      tags: ['old-tag'],
    });
    const cardId = seededCards[0]!.id;

    __setAiClientForTests({
      embed: fakeEmbed,
      chatStreamAgentic: scriptedAgentStream([
        writeTurn({
          id: 'w_diff',
          name: 'edit_card',
          args: {
            cardId,
            fieldValues: { Front: 'New front text' },
            tags: ['new-tag'],
          },
        }),
        answerTurn('Edited.'),
      ]),
    });

    const convId = await createConversation(cookie);
    const streamFrames = await readSse(await streamReq(cookie, convId, 'fix the front'));

    const await_ = streamFrames.find((f) => f.event === 'await_confirmation');
    expect(await_).toBeTruthy();
    const impact = (
      await_!.data as {
        impact?: {
          fieldDiffs?: { field: string; before: string; after: string }[];
          tagsChange?: { before: string[]; after: string[] };
        };
      }
    ).impact;
    expect(impact).toBeTruthy();
    // Only the CHANGED field appears (Back is untouched by the partial edit).
    expect(impact!.fieldDiffs).toEqual([
      { field: 'Front', before: 'Old front text', after: 'New front text' },
    ]);
    expect(impact!.tagsChange).toEqual({ before: ['old-tag'], after: ['new-tag'] });
  });

  test('create_card: await_confirmation carries proposedFields (C8)', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);

    __setAiClientForTests({
      embed: fakeEmbed,
      chatStreamAgentic: scriptedAgentStream([
        writeTurn({
          id: 'w_new',
          name: 'create_card',
          args: { deckId, fieldValues: { Front: 'Proposed Q', Back: 'Proposed A' } },
        }),
        answerTurn('Created.'),
      ]),
    });

    const convId = await createConversation(cookie);
    const streamFrames = await readSse(await streamReq(cookie, convId, 'add a card'));

    const await_ = streamFrames.find((f) => f.event === 'await_confirmation');
    const impact = (
      await_!.data as {
        impact?: { willCreateCards?: number; proposedFields?: { field: string; value: string }[] };
      }
    ).impact;
    expect(impact!.willCreateCards).toBe(1);
    expect(impact!.proposedFields).toEqual([
      { field: 'Front', value: 'Proposed Q' },
      { field: 'Back', value: 'Proposed A' },
    ]);
  });
});
