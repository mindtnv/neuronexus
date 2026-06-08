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
import { cards, db, decks, noteTypes, notes } from '@neuronexus/db';
import {
  generateCards,
  newFsrsCard,
  stateLabel,
  type FieldValues,
} from '@neuronexus/shared';
import { authPlugin } from '../auth-plugin.ts';
import { rootLogger } from '../logger.ts';
import { sanitizeFieldValues } from '../sanitize.ts';
import { defFromRow } from './note-types.ts';
import { enqueueIndex } from '../ai/index-queue.ts';

/**
 * Fire-and-forget RAG index enqueue for created/updated cards. Runs AFTER the
 * note transaction commits; `enqueueIndex` is sync + non-blocking (and a no-op
 * when embeddings are disabled), so a queue error can never affect the HTTP
 * response. Wrapped defensively all the same.
 */
function enqueueCardsForIndex(cardIds: Array<string | undefined>): void {
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

export const notesModule = new Elysia({ prefix: '/notes' })
  .use(authPlugin)
  .post(
    '/',
    async ({ user, body, status }) => {
      // Authorize deck ownership.
      const [deck] = await db
        .select({ id: decks.id })
        .from(decks)
        .where(and(eq(decks.id, body.deckId), eq(decks.userId, user.id)))
        .limit(1);
      if (!deck) return status(400, { error: 'deck_not_found' });

      // Resolve the note-type: must be owned OR a global builtin.
      const [noteType] = await db
        .select()
        .from(noteTypes)
        .where(eq(noteTypes.id, body.noteTypeId))
        .limit(1);
      if (!noteType || (noteType.userId !== null && noteType.userId !== user.id)) {
        return status(400, { error: 'note_type_not_found' });
      }

      const sanitized = sanitizeFieldValues(body.fieldValues);
      const def = defFromRow(noteType);
      const generated = generateCards(def, sanitized);

      const now = new Date();
      const result = await db.transaction(async (tx) => {
        const [note] = await tx
          .insert(notes)
          .values({
            userId: user.id,
            noteTypeId: body.noteTypeId,
            fieldValues: sanitized,
            tags: body.tags ?? [],
          })
          .returning();

        const createdCards = [];
        for (const g of generated) {
          const [card] = await tx
            .insert(cards)
            .values({
              userId: user.id,
              deckId: body.deckId,
              noteId: note!.id,
              templateOrd: g.templateOrd,
              renderText: g.renderText,
              renderFrontText: g.renderFrontText,
              renderBackText: g.renderBackText,
              renderKind: g.renderKind,
              ...freshFsrsColumns(now),
            })
            .returning();
          createdCards.push(card);
        }
        return { note: note!, cards: createdCards };
      });

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
      const [note] = await db
        .select()
        .from(notes)
        .where(and(eq(notes.id, params.id), eq(notes.userId, user.id)))
        .limit(1);
      if (!note) return status(404, { error: 'not_found' });

      const [noteType] = await db
        .select()
        .from(noteTypes)
        .where(eq(noteTypes.id, note.noteTypeId))
        .limit(1);
      if (!noteType) return status(404, { error: 'note_type_not_found' });

      const nextFieldValues =
        body.fieldValues !== undefined
          ? sanitizeFieldValues(body.fieldValues)
          : (note.fieldValues as FieldValues);
      const nextTags = body.tags ?? note.tags;

      const def = defFromRow(noteType);
      const generated = generateCards(def, nextFieldValues);
      const generatedByOrd = new Map(generated.map((g) => [g.templateOrd, g]));

      const now = new Date();
      const result = await db.transaction(async (tx) => {
        const [updatedNote] = await tx
          .update(notes)
          .set({ fieldValues: nextFieldValues, tags: nextTags, updatedAt: now })
          .where(eq(notes.id, params.id))
          .returning();

        // Existing cards for this note, keyed by templateOrd. Regeneration diffs
        // by templateOrd: surviving ords keep their FSRS state (update render*),
        // new ords insert (fresh FSRS), removed ords delete.
        const existing = await tx
          .select()
          .from(cards)
          .where(eq(cards.noteId, params.id));
        const existingByOrd = new Map(existing.map((c) => [c.templateOrd, c]));
        // All cards of a note share one deck (Decision A1). New cards inserted by
        // a regeneration inherit that deck. If a note had zero cards (every
        // template's front was empty) there's no deck to inherit — newly-generated
        // cards then have no home, so they are skipped (matches the empty-skip
        // rule: a note with no cards can't suddenly acquire one without a deck
        // choice, which only POST provides).
        const noteDeckId = existing[0]?.deckId;

        let updated = 0;
        let inserted = 0;
        let deleted = 0;

        // Update / insert.
        for (const g of generated) {
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
            await tx
              .insert(cards)
              .values({
                userId: user.id,
                deckId: noteDeckId,
                noteId: params.id,
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

        // Delete removed ords.
        for (const c of existing) {
          if (!generatedByOrd.has(c.templateOrd)) {
            await tx.delete(cards).where(eq(cards.id, c.id));
            deleted += 1;
          }
        }

        const finalCards = await tx
          .select()
          .from(cards)
          .where(eq(cards.noteId, params.id));

        return { note: updatedNote!, cards: finalCards, updated, inserted, deleted };
      });

      rootLogger.info(
        {
          noteId: params.id,
          noteTypeId: note.noteTypeId,
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
