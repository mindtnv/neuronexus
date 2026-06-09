// Notes CRUD + card generation (Milestone 1, Phase 4).
//
//   POST   /notes        → create a note + generate one card per template
//   PATCH  /notes/:id     → re-generate; FSRS preserved on surviving templateOrds
//   DELETE /notes/:id     → delete (cascade drops cards via FK)
//
// Trust boundary (plan must-fix #1/#2): field values are SANITIZED here on save
// via `sanitizeFieldValues` (parser-based `sanitize-html`). The card render*
// columns are a plaintext SEARCH cache derived from the sanitized values via the
// shared `generateCards` — never a security artifact (display HTML is rendered
// lazily + re-sanitized in the browser).
//
// Deck assignment (Decision A1): all generated cards get the note's chosen
// deckId. FSRS is initialised per generated card via `newFsrsCard`.

import { Elysia, t } from 'elysia';
import { and, eq } from 'drizzle-orm';
import { cards, db, decks, noteTypes, notes, type Db } from '@neuronexus/db';
import {
  generateCards,
  newFsrsCard,
  stateLabel,
  type FieldValues,
  type NoteTypeDef,
} from '@neuronexus/shared';
import { authPlugin } from '../auth-plugin.ts';
import { rootLogger } from '../logger.ts';
import { sanitizeFieldValues } from '../sanitize.ts';
import { defFromRow } from './note-types.ts';
import { enqueueIndex } from '../ai/index-queue.ts';

/** A Drizzle transaction handle (the arg passed to `db.transaction(async (tx) => …)`). */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Fire-and-forget RAG index enqueue for created/updated cards. Runs AFTER the
 * note transaction commits; `enqueueIndex` is sync + non-blocking (and a no-op
 * when embeddings are disabled), so a queue error can never affect the HTTP
 * response. Wrapped defensively all the same.
 *
 * Exported so the agentic `create_card`/`edit_card` tools (which reuse the
 * extracted note helpers below) enqueue identically after their own commit.
 */
export function enqueueCardsForIndex(cardIds: Array<string | undefined>): void {
  try {
    for (const id of cardIds) if (id) enqueueIndex(id);
  } catch (err) {
    rootLogger.warn({ err }, 'ai.index.enqueue_failed');
  }
}

// Size caps (DoS hardening): bound field-name length, per-value HTML length, and
// the number of fields a single note may carry.
const fieldValuesSchema = t.Record(
  t.String({ maxLength: 128 }),
  t.String({ maxLength: 65536 }),
  { maxProperties: 64 },
);

/** Build the FSRS-initialised column set for a freshly generated card. */
function freshFsrsColumns(now: Date) {
  const initial = newFsrsCard(now);
  return {
    due: new Date(initial.due),
    stability: initial.stability,
    difficulty: initial.difficulty,
    elapsedDays: initial.elapsed_days,
    scheduledDays: initial.scheduled_days,
    learningSteps: initial.learning_steps,
    reps: initial.reps,
    lapses: initial.lapses,
    state: stateLabel(initial.state),
  };
}

// ── Extracted, reuse-by-the-agentic-tools helpers (Phase B) ──────────────────
//
// These hoist the deck/note-type-ownership + sanitize + generateCards logic out
// of the route bodies so the `create_card`/`edit_card` chat tools (apps/api/src/
// ai/tools.ts) can wrap the EXACT same path — no FSRS/sanitizer/regenerate
// reimplementation (Principle 2). The route handlers below call these verbatim,
// so route behavior is unchanged. The DB-writing halves take a transaction
// handle so a caller (e.g. the resume route) can run the mutation atomically
// with its own `role:tool` insert.

/** Resolved (validation-only, no DB write) inputs for a note create. */
export type NoteCreateResolution =
  | { ok: true; def: NoteTypeDef; sanitized: FieldValues; generated: ReturnType<typeof generateCards> }
  | { ok: false; error: 'deck_not_found' | 'note_type_not_found' };

/**
 * Validate deck + note-type ownership and pre-compute the sanitized field values
 * + generated card descriptors for a note create. No DB writes. Shared by the
 * POST /notes route and the `create_card` tool so ownership/sanitize/gen match.
 */
export async function resolveNoteCreate(
  userId: string,
  input: { deckId: string; noteTypeId: string; fieldValues: FieldValues },
): Promise<NoteCreateResolution> {
  const [deck] = await db
    .select({ id: decks.id })
    .from(decks)
    .where(and(eq(decks.id, input.deckId), eq(decks.userId, userId)))
    .limit(1);
  if (!deck) return { ok: false, error: 'deck_not_found' };

  const [noteType] = await db
    .select()
    .from(noteTypes)
    .where(eq(noteTypes.id, input.noteTypeId))
    .limit(1);
  if (!noteType || (noteType.userId !== null && noteType.userId !== userId)) {
    return { ok: false, error: 'note_type_not_found' };
  }

  const sanitized = sanitizeFieldValues(input.fieldValues);
  const def = defFromRow(noteType);
  const generated = generateCards(def, sanitized);
  return { ok: true, def, sanitized, generated };
}

/**
 * Insert a note + its generated cards inside the supplied transaction. Pure DB
 * write — the caller passes an already-resolved `sanitized`/`generated` pair
 * (from {@link resolveNoteCreate}) and is responsible for the index enqueue
 * AFTER commit (route + tool both call `enqueueCardsForIndex`).
 */
export async function insertNoteAndCards(
  tx: Tx,
  input: {
    userId: string;
    deckId: string;
    noteTypeId: string;
    sanitized: FieldValues;
    tags: string[];
    generated: ReturnType<typeof generateCards>;
    now?: Date;
  },
): Promise<{ note: typeof notes.$inferSelect; cards: (typeof cards.$inferSelect)[] }> {
  const now = input.now ?? new Date();
  const [note] = await tx
    .insert(notes)
    .values({
      userId: input.userId,
      noteTypeId: input.noteTypeId,
      fieldValues: input.sanitized,
      tags: input.tags,
    })
    .returning();

  const createdCards: (typeof cards.$inferSelect)[] = [];
  for (const g of input.generated) {
    const [card] = await tx
      .insert(cards)
      .values({
        userId: input.userId,
        deckId: input.deckId,
        noteId: note!.id,
        templateOrd: g.templateOrd,
        renderText: g.renderText,
        renderFrontText: g.renderFrontText,
        renderBackText: g.renderBackText,
        renderKind: g.renderKind,
        ...freshFsrsColumns(now),
      })
      .returning();
    createdCards.push(card!);
  }
  return { note: note!, cards: createdCards };
}

/** Resolved (validation-only, no DB write) inputs for a note field/tags update. */
export type NoteUpdateResolution =
  | {
      ok: true;
      note: typeof notes.$inferSelect;
      nextFieldValues: FieldValues;
      nextTags: string[];
      generated: ReturnType<typeof generateCards>;
    }
  | { ok: false; error: 'not_found' | 'note_type_not_found' };

/**
 * Load + validate a note for a field/tags update and pre-compute the next
 * sanitized field values + regenerated card descriptors. No DB writes. Shared by
 * the PATCH /notes/:id route, the `edit_card` tool's `dryRun` (count diff), and
 * its `execute` (so ownership/sanitize/regenerate match the route exactly).
 */
export async function resolveNoteUpdate(
  userId: string,
  noteId: string,
  patch: { fieldValues?: FieldValues; tags?: string[] },
): Promise<NoteUpdateResolution> {
  const [note] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .limit(1);
  if (!note) return { ok: false, error: 'not_found' };

  const [noteType] = await db
    .select()
    .from(noteTypes)
    .where(eq(noteTypes.id, note.noteTypeId))
    .limit(1);
  if (!noteType) return { ok: false, error: 'note_type_not_found' };

  const nextFieldValues =
    patch.fieldValues !== undefined
      ? sanitizeFieldValues(patch.fieldValues)
      : (note.fieldValues as FieldValues);
  const nextTags = patch.tags ?? note.tags;

  const def = defFromRow(noteType);
  const generated = generateCards(def, nextFieldValues);
  return { ok: true, note, nextFieldValues, nextTags, generated };
}

/**
 * Apply a resolved note update inside the supplied transaction: update the note
 * row + regenerate cards (diff by `templateOrd` — surviving ords keep their FSRS
 * state, new ords insert fresh, removed ords delete). Identical to the PATCH
 * route body; FSRS-on-survivors and the destructive drop are NOT reimplemented
 * by callers (Principle 2). The caller enqueues the index after commit.
 */
export async function applyNoteUpdate(
  tx: Tx,
  input: {
    userId: string;
    noteId: string;
    nextFieldValues: FieldValues;
    nextTags: string[];
    generated: ReturnType<typeof generateCards>;
    now?: Date;
  },
): Promise<{
  note: typeof notes.$inferSelect;
  cards: (typeof cards.$inferSelect)[];
  updated: number;
  inserted: number;
  deleted: number;
}> {
  const now = input.now ?? new Date();
  const generatedByOrd = new Map(input.generated.map((g) => [g.templateOrd, g]));

  const [updatedNote] = await tx
    .update(notes)
    .set({ fieldValues: input.nextFieldValues, tags: input.nextTags, updatedAt: now })
    .where(eq(notes.id, input.noteId))
    .returning();

  const existing = await tx.select().from(cards).where(eq(cards.noteId, input.noteId));
  const existingByOrd = new Map(existing.map((c) => [c.templateOrd, c]));
  const noteDeckId = existing[0]?.deckId;

  let updated = 0;
  let inserted = 0;
  let deleted = 0;

  for (const g of input.generated) {
    const prior = existingByOrd.get(g.templateOrd);
    if (prior) {
      await tx
        .update(cards)
        .set({
          renderText: g.renderText,
          renderFrontText: g.renderFrontText,
          renderBackText: g.renderBackText,
          renderKind: g.renderKind,
          updatedAt: now,
        })
        .where(eq(cards.id, prior.id));
      updated += 1;
    } else if (noteDeckId) {
      await tx.insert(cards).values({
        userId: input.userId,
        deckId: noteDeckId,
        noteId: input.noteId,
        templateOrd: g.templateOrd,
        renderText: g.renderText,
        renderFrontText: g.renderFrontText,
        renderBackText: g.renderBackText,
        renderKind: g.renderKind,
        ...freshFsrsColumns(now),
      });
      inserted += 1;
    }
  }

  for (const c of existing) {
    if (!generatedByOrd.has(c.templateOrd)) {
      await tx.delete(cards).where(eq(cards.id, c.id));
      deleted += 1;
    }
  }

  const finalCards = await tx.select().from(cards).where(eq(cards.noteId, input.noteId));
  return { note: updatedNote!, cards: finalCards, updated, inserted, deleted };
}

/**
 * Read-only blast-radius diff for a note field update: how many cards a
 * regeneration would CREATE vs DELETE, given the resolved `generated` set vs the
 * note's existing cards-by-`templateOrd`. Mirrors {@link applyNoteUpdate}'s
 * diff (a survivor whose deck is missing can't be inserted — same `noteDeckId`
 * guard) so `dryRun` predicts what `execute` will actually do. No writes.
 */
export async function noteUpdateImpact(
  noteId: string,
  generated: ReturnType<typeof generateCards>,
): Promise<{ willCreateCards: number; willDeleteCards: number }> {
  const existing = await db
    .select({ id: cards.id, templateOrd: cards.templateOrd, deckId: cards.deckId })
    .from(cards)
    .where(eq(cards.noteId, noteId));
  const existingOrds = new Set(existing.map((c) => c.templateOrd));
  const generatedOrds = new Set(generated.map((g) => g.templateOrd));
  const noteDeckId = existing[0]?.deckId;

  let willCreateCards = 0;
  for (const g of generated) {
    // A new ord only materialises when there's a deck to inherit (applyNoteUpdate
    // skips otherwise) — match that so the prediction is exact.
    if (!existingOrds.has(g.templateOrd) && noteDeckId) willCreateCards += 1;
  }
  let willDeleteCards = 0;
  for (const c of existing) {
    if (!generatedOrds.has(c.templateOrd)) willDeleteCards += 1;
  }
  return { willCreateCards, willDeleteCards };
}

export const notesModule = new Elysia({ prefix: '/notes' })
  .use(authPlugin)
  .post(
    '/',
    async ({ user, body, status }) => {
      // Authorize deck + note-type ownership and pre-compute sanitize+gen.
      const resolved = await resolveNoteCreate(user.id, {
        deckId: body.deckId,
        noteTypeId: body.noteTypeId,
        fieldValues: body.fieldValues,
      });
      if (!resolved.ok) return status(400, { error: resolved.error });

      const now = new Date();
      const result = await db.transaction((tx) =>
        insertNoteAndCards(tx, {
          userId: user.id,
          deckId: body.deckId,
          noteTypeId: body.noteTypeId,
          sanitized: resolved.sanitized,
          tags: body.tags ?? [],
          generated: resolved.generated,
          now,
        }),
      );

      rootLogger.info(
        {
          noteId: result.note.id,
          noteTypeId: body.noteTypeId,
          cardsGenerated: result.cards.length,
        },
        'note.create',
      );

      // RAG index hook (Slice 3): enqueue each generated card after commit.
      enqueueCardsForIndex(result.cards.map((c) => c?.id));

      return result;
    },
    {
      auth: true,
      body: t.Object({
        noteTypeId: t.String({ format: 'uuid' }),
        fieldValues: fieldValuesSchema,
        tags: t.Optional(t.Array(t.String())),
        deckId: t.String({ format: 'uuid' }),
      }),
    },
  )
  .patch(
    '/:id',
    async ({ user, params, body, status }) => {
      const resolved = await resolveNoteUpdate(user.id, params.id, {
        fieldValues: body.fieldValues,
        tags: body.tags,
      });
      if (!resolved.ok) return status(404, { error: resolved.error });

      const now = new Date();
      const result = await db.transaction((tx) =>
        applyNoteUpdate(tx, {
          userId: user.id,
          noteId: params.id,
          nextFieldValues: resolved.nextFieldValues,
          nextTags: resolved.nextTags,
          generated: resolved.generated,
          now,
        }),
      );

      rootLogger.info(
        {
          noteId: params.id,
          noteTypeId: resolved.note.noteTypeId,
          cardsUpdated: result.updated,
          cardsInserted: result.inserted,
          cardsDeleted: result.deleted,
        },
        'note.update',
      );

      // RAG index hook (Slice 3): re-enqueue surviving + new cards after commit.
      // The sourceHash skip means an unchanged render_text costs nothing.
      enqueueCardsForIndex(result.cards.map((c) => c.id));

      return { note: result.note, cards: result.cards };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Partial(
        t.Object({
          fieldValues: fieldValuesSchema,
          tags: t.Array(t.String()),
        }),
      ),
    },
  )
  .delete(
    '/:id',
    async ({ user, params, status }) => {
      // Cascade drops cards (and their reviews) via FK ON DELETE CASCADE.
      const [deleted] = await db
        .delete(notes)
        .where(and(eq(notes.id, params.id), eq(notes.userId, user.id)))
        .returning({ id: notes.id });
      if (!deleted) return status(404, { error: 'not_found' });
      return { ok: true };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  );
