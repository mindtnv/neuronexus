// Note-types CRUD (Milestone 1, Phase 4 — Decision C-4 global builtins).
//
//   GET    /note-types      → rows owned by the user OR global builtins
//   POST   /note-types      → create a user-owned note-type
//   PATCH  /note-types/:id   → edit own; CLONE-ON-EDIT for builtins/global rows
//   DELETE /note-types/:id   → delete own (cascade: notes → cards via FK)
//
// All routes pass `{ auth: true }` and scope by `user.id`. Builtins (userId NULL,
// isBuiltin=true) are visible to everyone but never mutated — editing one creates
// a user-owned copy with the requested changes (clone-on-edit).
//
// Mass re-render (plan must-fix #6 / C-5): when a PATCH changes templates/styling,
// the denormalized plaintext search columns (render*) of ALL cards of ALL notes
// of that type are recomputed IN-TRANSACTION (FSRS preserved), and the change is
// logged `{ noteTypeId, cardsRerendered }`.

import { Elysia, t } from 'elysia';
import { and, eq, isNull, or } from 'drizzle-orm';
import { cards, db, noteTypes, notes } from '@neuronexus/db';
import {
  generateCards,
  type CardTemplate,
  type FieldValues,
  type NoteField,
  type NoteTypeDef,
  type RenderKind,
} from '@neuronexus/shared';
import { authPlugin } from '../auth-plugin.ts';
import { rootLogger } from '../logger.ts';

const renderKindSchema = t.Union([
  t.Literal('basic'),
  t.Literal('cloze'),
  t.Literal('typein'),
  t.Literal('custom'),
]);

const noteFieldSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 128 }),
  ord: t.Integer({ minimum: 0 }),
});

const cardTemplateSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 128 }),
  ord: t.Integer({ minimum: 0 }),
  frontTemplate: t.String({ maxLength: 16384 }),
  backTemplate: t.String({ maxLength: 16384 }),
});

/**
 * Validate that field/template ordinals are dense (0..n-1) and unique, and that
 * there is at least one field and one template. Returns an error code or null.
 */
export function validateOrdinals(
  fields: { ord: number }[],
  templates: { ord: number }[],
): 'no_fields' | 'no_templates' | 'bad_field_ords' | 'bad_template_ords' | null {
  if (fields.length === 0) return 'no_fields';
  if (templates.length === 0) return 'no_templates';
  if (!isDenseUnique(fields.map((f) => f.ord))) return 'bad_field_ords';
  if (!isDenseUnique(templates.map((tpl) => tpl.ord))) return 'bad_template_ords';
  return null;
}

function isDenseUnique(ords: number[]): boolean {
  const sorted = [...ords].sort((a, b) => a - b);
  return sorted.every((o, i) => o === i);
}

/** Reconstruct a NoteTypeDef from a persisted row (drives generation). */
export function defFromRow(row: {
  id: string;
  name: string;
  fields: NoteField[];
  templates: CardTemplate[];
  styling: string;
  kind: string;
  isBuiltin: boolean;
}): NoteTypeDef {
  return {
    id: row.id,
    name: row.name,
    fields: row.fields,
    templates: row.templates,
    styling: row.styling,
    isBuiltin: row.isBuiltin,
    kind: row.kind as RenderKind,
  };
}

export const noteTypesModule = new Elysia({ prefix: '/note-types' })
  .use(authPlugin)
  // Owned rows + global builtins.
  .get(
    '/',
    async ({ user }) => {
      const rows = await db
        .select()
        .from(noteTypes)
        .where(or(eq(noteTypes.userId, user.id), isNull(noteTypes.userId)));
      return rows;
    },
    { auth: true },
  )
  .post(
    '/',
    async ({ user, body, status }) => {
      const err = validateOrdinals(body.fields, body.templates);
      if (err) return status(400, { error: err });
      const [created] = await db
        .insert(noteTypes)
        .values({
          userId: user.id,
          name: body.name,
          fields: body.fields,
          templates: body.templates,
          styling: body.styling ?? '',
          kind: body.kind ?? 'custom',
          isBuiltin: false,
        })
        .returning();
      return created;
    },
    {
      auth: true,
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 128 }),
        fields: t.Array(noteFieldSchema, { minItems: 1, maxItems: 64 }),
        templates: t.Array(cardTemplateSchema, { minItems: 1, maxItems: 32 }),
        styling: t.Optional(t.String({ maxLength: 32768 })),
        kind: t.Optional(renderKindSchema),
      }),
    },
  )
  .patch(
    '/:id',
    async ({ user, params, body, status }) => {
      // Resolve the target row: must be owned OR a global builtin.
      const [target] = await db
        .select()
        .from(noteTypes)
        .where(
          and(
            eq(noteTypes.id, params.id),
            or(eq(noteTypes.userId, user.id), isNull(noteTypes.userId)),
          ),
        )
        .limit(1);
      if (!target) return status(404, { error: 'not_found' });

      // Compute the merged next shape (used both for ordinal validation and for
      // deciding whether a re-render is needed).
      const nextFields = body.fields ?? target.fields;
      const nextTemplates = body.templates ?? target.templates;
      const nextStyling = body.styling ?? target.styling;
      const nextName = body.name ?? target.name;
      const nextKind = (body.kind ?? target.kind) as RenderKind;

      const err = validateOrdinals(nextFields, nextTemplates);
      if (err) return status(400, { error: err });

      // CLONE-ON-EDIT: a builtin / global row (userId NULL or isBuiltin) is never
      // mutated. Create a user-owned copy carrying the requested changes.
      if (target.userId === null || target.isBuiltin) {
        const [clone] = await db
          .insert(noteTypes)
          .values({
            userId: user.id,
            name: nextName,
            fields: nextFields,
            templates: nextTemplates,
            styling: nextStyling,
            kind: nextKind,
            isBuiltin: false,
          })
          .returning();
        return clone;
      }

      // Owned row: detect whether render output could change (templates/styling/
      // kind). Field renames also change render output (template references).
      const templatesChanged = body.templates !== undefined;
      const stylingChanged = body.styling !== undefined && body.styling !== target.styling;
      const kindChanged = body.kind !== undefined && body.kind !== target.kind;
      const fieldsChanged = body.fields !== undefined;
      const needsRerender = templatesChanged || stylingChanged || kindChanged || fieldsChanged;

      return await db.transaction(async (tx) => {
        // Pin one timestamp for the note-type row + every re-rendered card
        // (mirrors notes.ts, which pins `now` for the whole transaction).
        const now = new Date();
        const [updated] = await tx
          .update(noteTypes)
          .set({
            name: nextName,
            fields: nextFields,
            templates: nextTemplates,
            styling: nextStyling,
            kind: nextKind,
            updatedAt: now,
          })
          .where(eq(noteTypes.id, params.id))
          .returning();
        if (!updated) return status(404, { error: 'not_found' });

        let cardsRerendered = 0;
        if (needsRerender) {
          const def = defFromRow(updated);
          // All notes of this type for this user.
          const typeNotes = await tx
            .select({ id: notes.id, fieldValues: notes.fieldValues })
            .from(notes)
            .where(and(eq(notes.noteTypeId, params.id), eq(notes.userId, user.id)));

          for (const note of typeNotes) {
            const generated = generateCards(def, note.fieldValues as FieldValues);
            const byOrd = new Map(generated.map((g) => [g.templateOrd, g]));
            // Refresh render* (+ renderKind) on existing card rows by templateOrd.
            // We never delete/insert here — generation diffing is a notes-PATCH
            // concern; a note-type edit only refreshes the search cache for the
            // cards that still correspond to a surviving template.
            const noteCards = await tx
              .select({ id: cards.id, templateOrd: cards.templateOrd })
              .from(cards)
              .where(eq(cards.noteId, note.id));
            for (const card of noteCards) {
              const g = byOrd.get(card.templateOrd);
              if (!g) continue;
              await tx
                .update(cards)
                .set({
                  renderText: g.renderText,
                  renderFrontText: g.renderFrontText,
                  renderBackText: g.renderBackText,
                  renderKind: g.renderKind,
                  updatedAt: now,
                })
                .where(eq(cards.id, card.id));
              cardsRerendered += 1;
            }
          }
          rootLogger.info({ noteTypeId: params.id, cardsRerendered }, 'note_type.rerender');
        }

        return updated;
      });
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Partial(
        t.Object({
          name: t.String({ minLength: 1, maxLength: 128 }),
          fields: t.Array(noteFieldSchema, { minItems: 1, maxItems: 64 }),
          templates: t.Array(cardTemplateSchema, { minItems: 1, maxItems: 32 }),
          styling: t.String({ maxLength: 32768 }),
          kind: renderKindSchema,
        }),
      ),
    },
  )
  .delete(
    '/:id',
    async ({ user, params, status }) => {
      // Own rows only — builtins (userId NULL) are never deletable. Cascade drops
      // notes → cards via FK ON DELETE CASCADE.
      const [deleted] = await db
        .delete(noteTypes)
        .where(and(eq(noteTypes.id, params.id), eq(noteTypes.userId, user.id)))
        .returning({ id: noteTypes.id });
      if (!deleted) return status(404, { error: 'not_found' });
      return { ok: true };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  );
