import { Elysia, t } from 'elysia';
import { and, asc, count, desc, eq, inArray, lt, lte, ne } from 'drizzle-orm';
import { cards, db, decks } from '@neuronexus/db';
import { newFsrsCard, stateLabel } from '@neuronexus/shared';
import { authPlugin } from '../auth-plugin.ts';
import { apiErrorBody, getRequestLogger, requestFields } from '../logger.ts';

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
    async ({ user, query, status, store }) => {
      const log = getRequestLogger(store);
      const deckId = query.deckId;
      const newLimit = Math.max(0, Math.min(200, Number(query.newLimit ?? DAILY_NEW_LIMIT)));
      const reviewLimit = Math.max(
        0,
        Math.min(1000, Number(query.reviewLimit ?? DAILY_REVIEW_LIMIT)),
      );

      const base = [eq(cards.userId, user.id), eq(cards.suspended, false)];
      if (deckId) {
        const allDecks = await db
          .select({ id: decks.id, parentId: decks.parentId })
          .from(decks)
          .where(eq(decks.userId, user.id));
        if (!allDecks.some((deck) => deck.id === deckId)) {
          log.warn(
            requestFields(store, {
              errorCode: 'QUEUE_DECK_NOT_FOUND',
              userId: user.id,
              deckId,
            }),
            'cards.queue.deck_not_found',
          );
          return status(404, apiErrorBody(store, 'QUEUE_DECK_NOT_FOUND', 'Deck not found.'));
        }

        const childrenByParent = new Map<string, string[]>();
        for (const deck of allDecks) {
          if (!deck.parentId) continue;
          const children = childrenByParent.get(deck.parentId) ?? [];
          children.push(deck.id);
          childrenByParent.set(deck.parentId, children);
        }

        const scopedDeckIds = [deckId];
        for (let i = 0; i < scopedDeckIds.length; i++) {
          for (const childId of childrenByParent.get(scopedDeckIds[i]!) ?? []) {
            scopedDeckIds.push(childId);
          }
        }

        base.push(inArray(cards.deckId, scopedDeckIds));
      }

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

      const payload = { due, new: fresh, total: due.length + fresh.length };
      log.info(
        requestFields(store, {
          userId: user.id,
          deckId: deckId ?? null,
          dueCount: due.length,
          newCount: fresh.length,
          total: payload.total,
          queueState: payload.total === 0 ? 'empty' : 'ready',
        }),
        'cards.queue.loaded',
      );
      return payload;
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
    async ({ user, body, status, store }) => {
      // Authorize: deck must belong to this user.
      const log = getRequestLogger(store);
      const deck = await db
        .select({ id: decks.id })
        .from(decks)
        .where(and(eq(decks.id, body.deckId), eq(decks.userId, user.id)))
        .limit(1);
      if (deck.length === 0) {
        log.warn(
          requestFields(store, {
            errorCode: 'CARD_DECK_NOT_FOUND',
            userId: user.id,
            deckId: body.deckId,
          }),
          'cards.create.deck_not_found',
        );
        return status(400, apiErrorBody(store, 'CARD_DECK_NOT_FOUND', 'Deck not found.'));
      }

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
    async ({ user, params, body, status, store }) => {
      const [updated] = await db
        .update(cards)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(cards.id, params.id), eq(cards.userId, user.id)))
        .returning();
      if (!updated) return status(404, apiErrorBody(store, 'CARD_NOT_FOUND', 'Card not found.'));
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
    async ({ user, params, status, store }) => {
      const [deleted] = await db
        .delete(cards)
        .where(and(eq(cards.id, params.id), eq(cards.userId, user.id)))
        .returning({ id: cards.id });
      if (!deleted) return status(404, apiErrorBody(store, 'CARD_NOT_FOUND', 'Card not found.'));
      return { ok: true };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  .get(
    '/stats',
    async ({ user }) => {
      const [all, dueNow, suspended] = await Promise.all([
        db.select({ n: count() }).from(cards).where(eq(cards.userId, user.id)),
        db
          .select({ n: count() })
          .from(cards)
          .where(and(eq(cards.userId, user.id), eq(cards.suspended, false), lte(cards.due, new Date()))),
        db
          .select({ n: count() })
          .from(cards)
          .where(and(eq(cards.userId, user.id), eq(cards.suspended, true))),
      ]);
      return {
        total: all[0]?.n ?? 0,
        due: dueNow[0]?.n ?? 0,
        suspended: suspended[0]?.n ?? 0,
      };
    },
    { auth: true },
  );
