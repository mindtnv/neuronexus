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
import { and, eq } from 'drizzle-orm';
import { cards, db, notes, type Citation, type Db } from '@neuronexus/db';
import { BASIC_NOTE_TYPE, type FieldValues } from '@neuronexus/shared';
import { embed } from './openai-client.ts';
import { retrieve } from './retrieve.ts';
import { resolveCitations } from './citations.ts';
import { getWebSearchProvider, isWebSearchEnabled } from './web-search.ts';
import {
  enqueueCardsForIndex,
  insertNoteAndCards,
  resolveNoteCreate,
  resolveNoteUpdate,
  applyNoteUpdate,
  noteUpdateImpact,
} from '../modules/notes.ts';
import { patchCard } from '../modules/cards.ts';
import { env } from '../env.ts';

const RETRIEVE_K = env.ai.RETRIEVE_K;
const RETRIEVE_MIN_SCORE = env.ai.RETRIEVE_MIN_SCORE;
const TOOL_RESULT_MAX_CHARS = env.ai.TOOL_RESULT_MAX_CHARS;

/** A Drizzle transaction handle (the arg passed to `db.transaction`). */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Per-call execution context. User-scoped — every tool MUST scope by `userId`.
 *
 * `tx` is supplied ONLY on the confirm-resume path (apps/api/src/modules/ai.ts):
 * a write tool's mutation then runs in the SAME transaction as the resume
 * route's `role:tool` insert, so a unique-index violation on
 * `messages_tool_result_uq` rolls the mutation back too (atomic double-apply
 * guard). On the auto-exec read path `tx` is absent and write tools (never hit
 * in Phase A) would open their own transaction.
 */
export interface ToolContext {
  userId: string;
  log: Logger;
  /** Optional caller-supplied transaction (confirm-resume atomicity). */
  tx?: Tx;
}

/**
 * Discriminated result of a tool execution. NEVER thrown — always returned. The
 * optional `cardIds` on a write success lets the loop enqueue those cards for
 * RAG indexing AFTER the (possibly caller-owned) transaction commits.
 */
export type ToolResult =
  | { ok: true; text: string; citations?: Citation[]; cardIds?: string[] }
  | { ok: false; error: string };

/** Blast-radius prediction for a write/SRS tool, computed WITHOUT mutating. */
export interface ToolImpact {
  willCreateCards?: number;
  willDeleteCards?: number;
  affectsSiblings?: boolean;
}

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
  /**
   * Compute the blast radius WITHOUT mutating. Present on every `write`/`srs`
   * tool (the loop calls it before `await_confirmation` so the confirm UI can
   * render what the write will do). Read tools omit it.
   */
  dryRun?(ctx: ToolContext, args: unknown): Promise<ToolImpact>;
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

// ── create_card (write) ──────────────────────────────────────────────────────
//
// Wraps the POST /notes create path (grounding correction #3 — cards are
// generated FROM a note; there is no POST /cards). Reuses the extracted
// `resolveNoteCreate` (deck + note-type ownership, sanitize, generateCards) +
// `insertNoteAndCards` (the same per-template insert with fresh FSRS). NEVER
// reimplements sanitize/gen/FSRS (Principle 2). `noteTypeId` defaults to the
// builtin "Basic" (guaranteed to exist via ensureBuiltins) when omitted.

interface CreateCardArgs {
  deckId?: unknown;
  noteTypeId?: unknown;
  fieldValues?: unknown;
  tags?: unknown;
}

/** Coerce/validate the raw create args into typed inputs (no DB access). */
function parseCreateCardArgs(
  rawArgs: unknown,
): { ok: true; deckId: string; noteTypeId: string; fieldValues: Record<string, string>; tags: string[] } | { ok: false; error: string } {
  const args = (rawArgs ?? {}) as CreateCardArgs;
  const deckId = typeof args.deckId === 'string' ? args.deckId.trim() : '';
  if (!deckId) return { ok: false, error: 'create_card: missing "deckId" argument' };
  const noteTypeId =
    typeof args.noteTypeId === 'string' && args.noteTypeId.trim()
      ? args.noteTypeId.trim()
      : BASIC_NOTE_TYPE.id!; // builtin Basic always carries its stable UUID literal
  if (!args.fieldValues || typeof args.fieldValues !== 'object' || Array.isArray(args.fieldValues)) {
    return { ok: false, error: 'create_card: "fieldValues" must be an object of field→string' };
  }
  const fieldValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(args.fieldValues as Record<string, unknown>)) {
    if (typeof v !== 'string') {
      return { ok: false, error: `create_card: field "${k}" must be a string` };
    }
    fieldValues[k] = v;
  }
  const tags = Array.isArray(args.tags) ? args.tags.filter((x): x is string => typeof x === 'string') : [];
  return { ok: true, deckId, noteTypeId, fieldValues, tags };
}

const createCard: Tool = {
  name: 'create_card',
  kind: 'write',
  description:
    "Create a new flashcard (a note) in one of the user's decks. Provide the " +
    'target `deckId` and the `fieldValues` for the note. For a simple front/back ' +
    'card you may OMIT `noteTypeId` — it defaults to the builtin "Basic" type, ' +
    'whose fields are "Front" and "Back". This is a WRITE: it pauses for the ' +
    'user to confirm before anything is created.',
  parameters: {
    type: 'object',
    properties: {
      deckId: { type: 'string', description: 'UUID of the deck to create the card in.' },
      noteTypeId: {
        type: 'string',
        description: 'Optional UUID of the note-type. Omit for a Basic (Front/Back) card.',
      },
      fieldValues: {
        type: 'object',
        description: 'Field name → value map (e.g. {"Front": "...", "Back": "..."}).',
        additionalProperties: { type: 'string' },
      },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags.' },
    },
    required: ['deckId', 'fieldValues'],
  },
  async dryRun(_ctx, rawArgs): Promise<ToolImpact> {
    const parsed = parseCreateCardArgs(rawArgs);
    if (!parsed.ok) return {};
    const resolved = await resolveNoteCreate(_ctx.userId, {
      deckId: parsed.deckId,
      noteTypeId: parsed.noteTypeId,
      fieldValues: parsed.fieldValues,
    });
    if (!resolved.ok) return {};
    return { willCreateCards: resolved.generated.length };
  },
  async execute(ctx, rawArgs): Promise<ToolResult> {
    const parsed = parseCreateCardArgs(rawArgs);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const resolved = await resolveNoteCreate(ctx.userId, {
      deckId: parsed.deckId,
      noteTypeId: parsed.noteTypeId,
      fieldValues: parsed.fieldValues,
    });
    if (!resolved.ok) return { ok: false, error: `create_card: ${resolved.error}` };
    if (resolved.generated.length === 0) {
      return { ok: false, error: 'create_card: the field values produced no cards (empty front)' };
    }

    const run = (tx: Tx) =>
      insertNoteAndCards(tx, {
        userId: ctx.userId,
        deckId: parsed.deckId,
        noteTypeId: parsed.noteTypeId,
        sanitized: resolved.sanitized,
        tags: parsed.tags,
        generated: resolved.generated,
      });
    // Run in the caller's transaction (resume atomicity) or our own.
    const created = ctx.tx ? await run(ctx.tx) : await db.transaction(run);
    const cardIds = created.cards.map((c) => c.id);

    return {
      ok: true,
      text: `Created note ${created.note.id} with ${created.cards.length} card(s) in deck ${parsed.deckId}.`,
      cardIds,
    };
  },
};

// ── edit_card (write) ─────────────────────────────────────────────────────────
//
// Phase B scope: COUNT-NEUTRAL field-value edits (front/back text on the same
// template set), plus deck-move/suspend via the card path. Wraps PATCH /notes/:id
// (field edits — `resolveNoteUpdate` + `applyNoteUpdate`, the SAME regenerate
// that keeps FSRS on surviving templateOrds and DELETES dropped ords) and/or
// PATCH /cards/:id (deck-move/suspend via `patchCard`). The dryRun surfaces
// `willDeleteCards` so a destructive regeneration is confirmed knowingly.

interface EditCardArgs {
  cardId?: unknown;
  noteId?: unknown;
  fieldValues?: unknown;
  tags?: unknown;
  deckId?: unknown;
  suspended?: unknown;
}

/**
 * Resolve the note id for an edit (given an explicit noteId or a cardId) AND
 * load that note's CURRENT `fieldValues` — both user-scoped. The current values
 * are the merge base: a partial `edit_card` overlays its provided fields on top
 * of these (`{ ...current, ...provided }`) so the wrapped FULL-REPLACE PATCH
 * /notes path only changes the named fields and leaves the rest intact (matching
 * the tool description, no silent wipe).
 */
async function resolveEditNote(
  userId: string,
  args: EditCardArgs,
): Promise<{ ok: true; noteId: string; current: FieldValues } | { ok: false; error: string }> {
  let noteId: string;
  if (typeof args.noteId === 'string' && args.noteId.trim()) {
    noteId = args.noteId.trim();
  } else if (typeof args.cardId === 'string' && args.cardId.trim()) {
    const [row] = await db
      .select({ noteId: cards.noteId })
      .from(cards)
      .where(and(eq(cards.id, args.cardId.trim()), eq(cards.userId, userId)))
      .limit(1);
    if (!row) return { ok: false, error: 'edit_card: card not found' };
    noteId = row.noteId;
  } else {
    return { ok: false, error: 'edit_card: provide a "cardId" or "noteId"' };
  }

  const [note] = await db
    .select({ fieldValues: notes.fieldValues })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .limit(1);
  if (!note) return { ok: false, error: 'edit_card: note not found' };
  return { ok: true, noteId, current: note.fieldValues };
}

const editCard: Tool = {
  name: 'edit_card',
  kind: 'write',
  description:
    "Edit an existing card. Pass a `cardId` (or `noteId`) to identify it. To " +
    'change the text, pass `fieldValues` (a partial field→value map — only the ' +
    'fields you change). To move it to another deck pass `deckId`; to suspend/' +
    'unsuspend it pass `suspended`. This is a WRITE: it pauses for confirmation. ' +
    'Changing fields regenerates the cards of the note; if that would change how ' +
    'many cards exist, the confirmation will warn that scheduling history is lost.',
  parameters: {
    type: 'object',
    properties: {
      cardId: { type: 'string', description: 'UUID of a card of the note to edit.' },
      noteId: { type: 'string', description: 'UUID of the note to edit (alternative to cardId).' },
      fieldValues: {
        type: 'object',
        description: 'Partial field name → new value map.',
        additionalProperties: { type: 'string' },
      },
      tags: { type: 'array', items: { type: 'string' }, description: 'Replace the note tags.' },
      deckId: { type: 'string', description: 'Move the card to this deck (card-level).' },
      suspended: { type: 'boolean', description: 'Suspend (true) or unsuspend (false) the card.' },
    },
  },
  async dryRun(ctx, rawArgs): Promise<ToolImpact> {
    const args = (rawArgs ?? {}) as EditCardArgs;
    const editsFields = args.fieldValues !== undefined || args.tags !== undefined;
    if (!editsFields) {
      // Deck-move / suspend only — count-neutral.
      return {};
    }
    const noteRes = await resolveEditNote(ctx.userId, args);
    if (!noteRes.ok) return {};
    const fieldValues = mergeFieldValues(noteRes.current, args.fieldValues);
    const tags = Array.isArray(args.tags)
      ? args.tags.filter((x): x is string => typeof x === 'string')
      : undefined;
    const resolved = await resolveNoteUpdate(ctx.userId, noteRes.noteId, { fieldValues, tags });
    if (!resolved.ok) return { affectsSiblings: true };
    const impact = await noteUpdateImpact(noteRes.noteId, resolved.generated);
    return { ...impact, affectsSiblings: true };
  },
  async execute(ctx, rawArgs): Promise<ToolResult> {
    const args = (rawArgs ?? {}) as EditCardArgs;
    const editsFields = args.fieldValues !== undefined || args.tags !== undefined;
    const movesOrSuspends = args.deckId !== undefined || args.suspended !== undefined;
    if (!editsFields && !movesOrSuspends) {
      return { ok: false, error: 'edit_card: nothing to change (pass fieldValues/tags/deckId/suspended)' };
    }

    const summaries: string[] = [];
    let cardIds: string[] = [];

    // 1) Field/tags edit → regenerate the note's cards (FSRS-on-survivors).
    if (editsFields) {
      const noteRes = await resolveEditNote(ctx.userId, args);
      if (!noteRes.ok) return { ok: false, error: noteRes.error };
      const fieldValues = mergeFieldValues(noteRes.current, args.fieldValues);
      const tags = Array.isArray(args.tags)
        ? args.tags.filter((x): x is string => typeof x === 'string')
        : undefined;
      const resolved = await resolveNoteUpdate(ctx.userId, noteRes.noteId, { fieldValues, tags });
      if (!resolved.ok) return { ok: false, error: `edit_card: ${resolved.error}` };

      const run = (tx: Tx) =>
        applyNoteUpdate(tx, {
          userId: ctx.userId,
          noteId: noteRes.noteId,
          nextFieldValues: resolved.nextFieldValues,
          nextTags: resolved.nextTags,
          generated: resolved.generated,
        });
      const updated = ctx.tx ? await run(ctx.tx) : await db.transaction(run);
      cardIds = updated.cards.map((c) => c.id);
      summaries.push(
        `Updated note ${noteRes.noteId} (${updated.updated} unchanged-ord, ${updated.inserted} new, ${updated.deleted} removed).`,
      );
    }

    // 2) Deck-move / suspend at the card level (count-neutral, no FSRS reset).
    if (movesOrSuspends) {
      const cardId = typeof args.cardId === 'string' ? args.cardId.trim() : '';
      if (!cardId) return { ok: false, error: 'edit_card: deckId/suspended require a "cardId"' };
      const res = await patchCard(ctx.userId, cardId, {
        deckId: typeof args.deckId === 'string' ? args.deckId : undefined,
        suspended: typeof args.suspended === 'boolean' ? args.suspended : undefined,
      });
      if (!res.ok) return { ok: false, error: `edit_card: ${res.error}` };
      summaries.push(`Updated card ${cardId} (deck/suspend).`);
    }

    return { ok: true, text: summaries.join(' '), cardIds: cardIds.length > 0 ? cardIds : undefined };
  },
};

/**
 * Build the FULL next field-value map for an edit by overlaying the model's
 * PARTIAL `edit_card` args onto the note's CURRENT values (`{ ...current,
 * ...provided }`, non-string provided entries dropped). The wrapped PATCH /notes
 * path is full-replace, so passing the merged set keeps untouched fields intact
 * — a partial edit changes only the named fields. Returns `undefined` when no
 * fieldValues arg was provided (tags-only edit: resolveNoteUpdate then keeps the
 * note's existing values, unchanged behavior).
 */
function mergeFieldValues(current: FieldValues, raw: unknown): FieldValues | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...current };
  const out: FieldValues = { ...current };
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

// ── SRS tools (suspend / set_due / forget) ───────────────────────────────────
//
// Thin wrappers over PATCH /cards/:id via the extracted `patchCard` helper —
// reuse the explicit-field map + forget/setDue mutual-exclusion + ISO guards.
// All count-neutral, so `dryRun` is empty. No FSRS/undo/leech reimplementation.

interface CardIdArg {
  cardId?: unknown;
  suspended?: unknown;
  due?: unknown;
}

function requireCardId(rawArgs: unknown): { ok: true; cardId: string; args: CardIdArg } | { ok: false; error: string } {
  const args = (rawArgs ?? {}) as CardIdArg;
  const cardId = typeof args.cardId === 'string' ? args.cardId.trim() : '';
  if (!cardId) return { ok: false, error: 'missing "cardId" argument' };
  return { ok: true, cardId, args };
}

const suspend: Tool = {
  name: 'suspend',
  kind: 'srs',
  description:
    'Suspend a card (remove it from review) or unsuspend it. Pass `cardId` and ' +
    '`suspended` (true to suspend, false to unsuspend). WRITE: pauses for confirmation.',
  parameters: {
    type: 'object',
    properties: {
      cardId: { type: 'string', description: 'UUID of the card.' },
      suspended: { type: 'boolean', description: 'true = suspend, false = unsuspend (default true).' },
    },
    required: ['cardId'],
  },
  async dryRun(): Promise<ToolImpact> {
    return {};
  },
  async execute(ctx, rawArgs): Promise<ToolResult> {
    const p = requireCardId(rawArgs);
    if (!p.ok) return { ok: false, error: `suspend: ${p.error}` };
    const suspended = typeof p.args.suspended === 'boolean' ? p.args.suspended : true;
    const res = await patchCard(ctx.userId, p.cardId, { suspended });
    if (!res.ok) return { ok: false, error: `suspend: ${res.error}` };
    return { ok: true, text: `Card ${p.cardId} ${suspended ? 'suspended' : 'unsuspended'}.` };
  },
};

const setDue: Tool = {
  name: 'set_due',
  kind: 'srs',
  description:
    'Set a card\'s next due date to a specific instant (Anki "Set Due Date"). ' +
    'Pass `cardId` and `due` as an ISO-8601 timestamp. WRITE: pauses for confirmation.',
  parameters: {
    type: 'object',
    properties: {
      cardId: { type: 'string', description: 'UUID of the card.' },
      due: { type: 'string', description: 'ISO-8601 timestamp for the new due date.' },
    },
    required: ['cardId', 'due'],
  },
  async dryRun(): Promise<ToolImpact> {
    return {};
  },
  async execute(ctx, rawArgs): Promise<ToolResult> {
    const p = requireCardId(rawArgs);
    if (!p.ok) return { ok: false, error: `set_due: ${p.error}` };
    const due = typeof p.args.due === 'string' ? p.args.due : '';
    if (!due) return { ok: false, error: 'set_due: missing "due" ISO timestamp' };
    const res = await patchCard(ctx.userId, p.cardId, { setDue: due });
    if (!res.ok) return { ok: false, error: `set_due: ${res.error}` };
    return { ok: true, text: `Card ${p.cardId} due date set to ${due}.` };
  },
};

const forget: Tool = {
  name: 'forget',
  kind: 'srs',
  description:
    'Reset a card to a fresh "new" state (Anki "Forget") — clears its scheduling ' +
    'progress so it is learned from scratch. Pass `cardId`. WRITE: pauses for confirmation.',
  parameters: {
    type: 'object',
    properties: {
      cardId: { type: 'string', description: 'UUID of the card.' },
    },
    required: ['cardId'],
  },
  async dryRun(): Promise<ToolImpact> {
    return {};
  },
  async execute(ctx, rawArgs): Promise<ToolResult> {
    const p = requireCardId(rawArgs);
    if (!p.ok) return { ok: false, error: `forget: ${p.error}` };
    const res = await patchCard(ctx.userId, p.cardId, { forget: true });
    if (!res.ok) return { ok: false, error: `forget: ${res.error}` };
    return { ok: true, text: `Card ${p.cardId} reset to new (forgotten).` };
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Build the tool registry offered to the model.
 *  - `search_cards` is always present.
 *  - `web_search` is included only when web search is enabled (Brave key or a
 *    test-injected provider) — Principle 1: absent ⇒ tool simply not offered.
 *  - The write/SRS tools (`create_card`, `edit_card`, `suspend`, `set_due`,
 *    `forget`) are ALWAYS present in Phase B (no extra env gate beyond
 *    chatEnabled — the loop pauses each for confirmation before any mutation).
 */
export function buildToolRegistry(
  opts: { webSearchEnabled?: boolean } = {},
): Tool[] {
  const webOn = opts.webSearchEnabled ?? isWebSearchEnabled();
  const registry: Tool[] = [searchCards];
  if (webOn) registry.push(webSearch);
  registry.push(createCard, editCard, suspend, setDue, forget);
  return registry;
}

/**
 * Fire-and-forget RAG index enqueue for cards a write tool created/updated. The
 * loop calls this AFTER the (possibly caller-owned) transaction commits — same
 * post-commit discipline as the notes/cards routes. No-op when embeddings off.
 */
export function enqueueToolCardsForIndex(cardIds: string[] | undefined): void {
  if (cardIds && cardIds.length > 0) enqueueCardsForIndex(cardIds);
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
