import { Elysia, t } from 'elysia';
import { and, eq } from 'drizzle-orm';
import { db, deckOptionsPreset, decks } from '@neuronexus/db';
import { authPlugin } from '../auth-plugin.ts';

const deckColorSchema = t.Union([
  t.Literal('lime'),
  t.Literal('amber'),
  t.Literal('violet'),
  t.Literal('sky'),
  t.Literal('rose'),
  t.Literal('neutral'),
]);

export const decksModule = new Elysia({ prefix: '/decks' })
  .use(authPlugin)
  .get('/', async ({ user }) => {
    const rows = await db.select().from(decks).where(eq(decks.userId, user.id));
    return rows;
  }, { auth: true })
  .post(
    '/',
    async ({ user, body, status }) => {
      if (body.parentId) {
        const parent = await db
          .select({ id: decks.id })
          .from(decks)
          .where(and(eq(decks.id, body.parentId), eq(decks.userId, user.id)))
          .limit(1);
        if (parent.length === 0) return status(400, { error: 'parent_not_found' });
      }
      const [created] = await db
        .insert(decks)
        .values({
          userId: user.id,
          name: body.name,
          color: body.color ?? 'lime',
          icon: body.icon,
          parentId: body.parentId,
        })
        .returning();
      return created;
    },
    {
      auth: true,
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
        color: t.Optional(deckColorSchema),
        icon: t.Optional(t.String()),
        parentId: t.Optional(t.String({ format: 'uuid' })),
      }),
    },
  )
  .patch(
    '/:id',
    async ({ user, params, body, status }) => {
      // Cycle guard: if setting parentId, ensure target isn't a descendant of this deck.
      if (body.parentId) {
        if (body.parentId === params.id) return status(400, { error: 'cycle' });
        const all = await db
          .select({ id: decks.id, parentId: decks.parentId })
          .from(decks)
          .where(eq(decks.userId, user.id));
        let cursor: string | null = body.parentId;
        const seen = new Set<string>();
        while (cursor) {
          if (cursor === params.id) return status(400, { error: 'cycle' });
          if (seen.has(cursor)) break;
          seen.add(cursor);
          const row: { id: string; parentId: string | null } | undefined = all.find((d) => d.id === cursor);
          cursor = row?.parentId ?? null;
        }
      }
      // Preset binding: a non-null presetId must reference a preset owned by the
      // same user before we bind it. `null` unbinds (FK is nullable). The DB FK
      // `ON DELETE SET NULL` only unbinds on preset DELETE — this guards the
      // bind direction so a user can't attach another user's preset.
      if (body.presetId) {
        const owned = await db
          .select({ id: deckOptionsPreset.id })
          .from(deckOptionsPreset)
          .where(and(eq(deckOptionsPreset.id, body.presetId), eq(deckOptionsPreset.userId, user.id)))
          .limit(1);
        if (owned.length === 0) return status(404, { error: 'preset_not_found' });
      }
      const [updated] = await db
        .update(decks)
        .set(body)
        .where(and(eq(decks.id, params.id), eq(decks.userId, user.id)))
        .returning();
      if (!updated) return status(404, { error: 'not_found' });
      return updated;
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Partial(
        t.Object({
          name: t.String({ minLength: 1, maxLength: 100 }),
          color: deckColorSchema,
          icon: t.String(),
          parentId: t.Union([t.String({ format: 'uuid' }), t.Null()]),
          presetId: t.Union([t.String({ format: 'uuid' }), t.Null()]),
        }),
      ),
    },
  )
  .delete(
    '/:id',
    async ({ user, params, status }) => {
      // Cascade handled by FK ON DELETE CASCADE on parent_id + deck_id (cards/reviews).
      const [deleted] = await db
        .delete(decks)
        .where(and(eq(decks.id, params.id), eq(decks.userId, user.id)))
        .returning({ id: decks.id });
      if (!deleted) return status(404, { error: 'not_found' });
      return { ok: true };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  );
