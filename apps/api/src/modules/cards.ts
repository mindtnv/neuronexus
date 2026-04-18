import { Elysia, t } from 'elysia';
import { and, asc, count, desc, eq, inArray, lt, lte, ne } from 'drizzle-orm';
import { cards, db, decks } from '@neuronexus/db';
import { newFsrsCard, stateLabel } from '@neuronexus/shared';
import { authPlugin } from '../auth-plugin.ts';

const cardVariantSchema = t.Union([t.Literal('basic'), t.Literal('cloze'), t.Literal('type')]);

// Anki-style per-session caps. Reasonable starting point; we can expose them
// in user preferences later.
const DAILY_NEW_LIMIT = 20;
const DAILY_REVIEW_LIMIT = 200;

// Pagination defaults for GET /cards. The hard ceiling protects us against
// a client asking for everything at once on a 10k-card account.
const DEFAULT_CARDS_PAGE = 500;
const MAX_CARDS_PAGE = 1000;

export const cardsModule = new Elysia({ prefix: '/cards' })
  .use(authPlugin)
  // List cards. Cursor-paginated: ordered by `created_at DESC`, cursor is
  // the ISO createdAt of the last item you saw.
  //
  //   GET /cards                 → first page (500 most recent, suspended excluded)
  //   GET /cards?limit=200       → smaller page
  //   GET /cards?cursor=<iso>    → next page after that createdAt
  //   GET /cards?includeSuspended=true  → include suspended
  //   GET /cards?due=true        → only what's currently due (ad-hoc filter;
  //                                the full scheduler queue lives under /cards/queue)
  //
  // Response: `{ items, nextCursor }`. `nextCursor` is null when the page was
  // shorter than the requested limit.
  .get(
    '/',
    async ({ user, query }) => {
      const rawLimit = Number(query.limit ?? DEFAULT_CARDS_PAGE);
      const limit = Math.max(
        1,
        Math.min(MAX_CARDS_PAGE, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_CARDS_PAGE),
      );
      const conditions = [eq(cards.userId, user.id)];
      if (query.deckId) conditions.push(eq(cards.deckId, query.deckId));
      if (query.due === 'true') conditions.push(lte(cards.due, new Date()));
      if (query.includeSuspended !== 'true') conditions.push(eq(cards.suspended, false));
      if (query.cursor) {
        const parsed = new Date(query.cursor);
        if (!Number.isNaN(parsed.getTime())) {
          conditions.push(lt(cards.createdAt, parsed));
        }
      }
      const rows = await db
        .select()
        .from(cards)
        .where(and(...conditions))
        .orderBy(desc(cards.createdAt))
        .limit(limit);
      const nextCursor =
        rows.length === limit ? rows[rows.length - 1]!.createdAt.toISOString() : null;
      return { items: rows, nextCursor };
    },
    {
      auth: true,
      query: t.Object({
        deckId: t.Optional(t.String({ format: 'uuid' })),
        due: t.Optional(t.String()),
        includeSuspended: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
      }),
    },
  )
  // Today's review queue. Returns, in order:
  //   1. Due cards (state != new, due <= now), ordered by earliest due first
  //   2. New cards, capped at `newLimit` (default 20)
  // Both lists respect `suspended = false`. Callers render the concatenation.
  .get(
    '/queue',
    async ({ user, query }) => {
      const deckId = query.deckId;
      const newLimit = Math.max(0, Math.min(200, Number(query.newLimit ?? DAILY_NEW_LIMIT)));
      const reviewLimit = Math.max(
        0,
        Math.min(1000, Number(query.reviewLimit ?? DAILY_REVIEW_LIMIT)),
      );

      const base = [eq(cards.userId, user.id), eq(cards.suspended, false)];
      if (deckId) base.push(eq(cards.deckId, deckId));

      // Due (not-new) cards first — sorted by due ASC.
      const due = await db
        .select()
        .from(cards)
        .where(and(...base, ne(cards.state, 'new'), lte(cards.due, new Date())))
        .orderBy(asc(cards.due))
        .limit(reviewLimit);

      // New cards — capped.
      const fresh = await db
        .select()
        .from(cards)
        .where(and(...base, eq(cards.state, 'new')))
        .orderBy(asc(cards.createdAt))
        .limit(newLimit);

      return { due, new: fresh, total: due.length + fresh.length };
    },
    {
      auth: true,
      query: t.Object({
        deckId: t.Optional(t.String({ format: 'uuid' })),
        newLimit: t.Optional(t.String()),
        reviewLimit: t.Optional(t.String()),
      }),
    },
  )
  .post(
    '/',
    async ({ user, body, status }) => {
      // Authorize: deck must belong to this user.
      const deck = await db
        .select({ id: decks.id })
        .from(decks)
        .where(and(eq(decks.id, body.deckId), eq(decks.userId, user.id)))
        .limit(1);
      if (deck.length === 0) return status(400, { error: 'deck_not_found' });

      const initial = newFsrsCard(new Date());
      const [created] = await db
        .insert(cards)
        .values({
          userId: user.id,
          deckId: body.deckId,
          variant: body.variant ?? 'basic',
          front: body.front,
          back: body.back,
          clozeText: body.clozeText,
          tags: body.tags ?? [],
          due: new Date(initial.due),
          stability: initial.stability,
          difficulty: initial.difficulty,
          elapsedDays: initial.elapsed_days,
          scheduledDays: initial.scheduled_days,
          learningSteps: initial.learning_steps,
          reps: initial.reps,
          lapses: initial.lapses,
          state: stateLabel(initial.state),
        })
        .returning();
      return created;
    },
    {
      auth: true,
      body: t.Object({
        deckId: t.String({ format: 'uuid' }),
        variant: t.Optional(cardVariantSchema),
        front: t.String({ minLength: 1 }),
        back: t.String({ minLength: 0 }),
        clozeText: t.Optional(t.String()),
        tags: t.Optional(t.Array(t.String())),
      }),
    },
  )
  .patch(
    '/:id',
    async ({ user, params, body, status }) => {
      const [updated] = await db
        .update(cards)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(cards.id, params.id), eq(cards.userId, user.id)))
        .returning();
      if (!updated) return status(404, { error: 'not_found' });
      return updated;
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Partial(
        t.Object({
          variant: cardVariantSchema,
          front: t.String({ minLength: 1 }),
          back: t.String(),
          clozeText: t.Union([t.String(), t.Null()]),
          tags: t.Array(t.String()),
          suspended: t.Boolean(),
        }),
      ),
    },
  )
  .delete(
    '/:id',
    async ({ user, params, status }) => {
      const [deleted] = await db
        .delete(cards)
        .where(and(eq(cards.id, params.id), eq(cards.userId, user.id)))
        .returning({ id: cards.id });
      if (!deleted) return status(404, { error: 'not_found' });
      return { ok: true };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  );

// No-ops re-exports to silence unused-import warnings if we add stats later.
void count;
void inArray;
