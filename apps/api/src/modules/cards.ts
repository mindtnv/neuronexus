import { Elysia, t } from 'elysia';
import { and, asc, desc, eq, gt, inArray, lt, lte, ne, or, sql } from 'drizzle-orm';
import { cards, db, decks } from '@neuronexus/db';
import { newFsrsCard, parseCardQuery, CardQueryError, stateLabel } from '@neuronexus/shared';
import { authPlugin } from '../auth-plugin.ts';
import { buildCardWhere } from './card-query-sql.ts';

const cardVariantSchema = t.Union([t.Literal('basic'), t.Literal('cloze'), t.Literal('type')]);

// Anki-style per-session caps. Reasonable starting point; we can expose them
// in user preferences later.
const DAILY_NEW_LIMIT = 20;
const DAILY_REVIEW_LIMIT = 200;

// Pagination defaults for GET /cards. The hard ceiling protects us against
// a client asking for everything at once on a 10k-card account.
const DEFAULT_CARDS_PAGE = 500;
const MAX_CARDS_PAGE = 1000;

// ── /cards/search sort + tuple-keyset cursor helpers ──────────────────────────

// Sort allowlist (Architect must-fix #3): `<field> <dir>` validated against
// these maps; anything else → 400. Default `created desc`.
const SORT_COLUMNS = {
  created: cards.createdAt,
  updated: cards.updatedAt,
  due: cards.due,
  lapses: cards.lapses,
  reps: cards.reps,
  front: cards.front,
} as const;
type SortField = keyof typeof SORT_COLUMNS;
const SORT_FIELDS = new Set<string>(Object.keys(SORT_COLUMNS));

/**
 * Parse a `sort` query value like `"lapses desc"` (space or `:` separated) into
 * `{ field, dir }`, or `null` when it is off the allowlist. Missing `sort`
 * defaults to `created desc`.
 */
function parseSort(raw: string | undefined): { field: SortField; dir: 'asc' | 'desc' } | null {
  if (!raw) return { field: 'created', dir: 'desc' };
  const [fieldRaw, dirRaw = 'desc'] = raw.trim().split(/[\s:]+/);
  const field = (fieldRaw ?? '').toLowerCase();
  const dir = dirRaw.toLowerCase();
  if (!SORT_FIELDS.has(field)) return null;
  if (dir !== 'asc' && dir !== 'desc') return null;
  return { field: field as SortField, dir };
}

interface CursorPayload {
  v: string | number;
  id: string;
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function decodeCursor(raw: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.id === 'string' &&
      (typeof parsed.v === 'string' || typeof parsed.v === 'number')
    ) {
      return parsed as CursorPayload;
    }
  } catch {
    // malformed cursor → ignore (treated as no cursor)
  }
  return null;
}

/** Serialize the sort field's value from a row for the cursor (ISO for dates). */
function encodeSortValue(field: SortField, row: typeof cards.$inferSelect): string | number {
  switch (field) {
    case 'created':
      return row.createdAt.toISOString();
    case 'updated':
      return row.updatedAt.toISOString();
    case 'due':
      return row.due.toISOString();
    case 'lapses':
      return row.lapses;
    case 'reps':
      return row.reps;
    case 'front':
      return row.front;
  }
}

/**
 * Inverse of encodeSortValue: turn the cursor `v` back into a comparable.
 * Returns `null` when the value can't be decoded (e.g. a crafted cursor whose
 * date is unparseable) so the caller degrades to "no cursor" instead of 500ing —
 * consistent with decodeCursor's try/catch contract.
 */
function decodeSortValue(field: SortField, v: string | number): Date | number | string | null {
  switch (field) {
    case 'created':
    case 'updated':
    case 'due': {
      const d = new Date(v as string);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    case 'lapses':
    case 'reps':
      return Number(v);
    case 'front':
      return String(v);
  }
}

type DeckRow = { id: string; parentId: string | null; name: string };

/**
 * Build a `resolveDeckIds(value, nested)` closure over the user's decks. Plain
 * `deck:` resolves to the named deck plus its whole subtree (descendants), which
 * matches the client predicate's behavior and AC7. A deck matches when its name
 * OR its full path label (e.g. `"Parent / Child"`) equals the target — both
 * compared case-INSENSITIVELY, identical to the client `resolveDeckIds` +
 * `deckPathLabel` in cards-browser.tsx. Replicates lib/decks.ts:getDescendantIds
 * and deckPathLabel server-side so the SQL builder stays deck-table-agnostic.
 */
function makeDeckResolver(userDecks: DeckRow[]): (value: string, nested: boolean) => string[] {
  const byId = new Map(userDecks.map((d) => [d.id, d]));
  const descendantsOf = (deckId: string): string[] => {
    const children = userDecks.filter((d) => d.parentId === deckId).map((d) => d.id);
    return children.flatMap((id) => [id, ...descendantsOf(id)]);
  };
  // Full root→deck path label, joined ` / ` — mirrors lib/decks.ts:deckPathLabel
  // (with the same cycle guard).
  const pathLabel = (deckId: string): string => {
    const names: string[] = [];
    const seen = new Set<string>();
    let current = byId.get(deckId);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      names.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return names.join(' / ');
  };
  return (value: string, nested: boolean): string[] => {
    const lower = value.toLowerCase();
    const matches = userDecks.filter(
      (d) => d.name.toLowerCase() === lower || pathLabel(d.id).toLowerCase() === lower,
    );
    if (matches.length === 0) return [];
    const ids = new Set<string>();
    for (const m of matches) {
      ids.add(m.id);
      if (nested) for (const id of descendantsOf(m.id)) ids.add(id);
    }
    return [...ids];
  };
}

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
  // Anki-style Browse search. Parses `q` (shared parser) into an AST and
  // translates it to a SQL WHERE via buildCardWhere. Pagination is a
  // TUPLE-KEYSET cursor over `(sortValue, id)` — correct for non-unique sort
  // keys (e.g. ties on `lapses`). Distinct from GET /cards' scalar created_at
  // cursor, which is left untouched.
  //
  //   GET /cards/search?q=is:due
  //   GET /cards/search?q=front:hund&sort=lapses%20desc
  //   GET /cards/search?sort=created%20asc&cursor=<base64>
  //
  // `now` is computed once per request (Critic C2) and passed into the AST
  // translator; under NODE_ENV=test a `now` query param (epoch ms) can pin it
  // for parity tests.
  .get(
    '/search',
    async ({ user, query, status }) => {
      // Parse the query → AST. Cap violations map to 400.
      let ast;
      try {
        ast = parseCardQuery(query.q ?? '');
      } catch (err) {
        if (err instanceof CardQueryError) return status(400, { error: 'bad_query' });
        throw err;
      }

      // Sort allowlist (Architect must-fix #3). Reject anything off-list → 400.
      const sortSpec = parseSort(query.sort);
      if (sortSpec === null) return status(400, { error: 'bad_sort' });
      const { field: sortField, dir } = sortSpec;

      const rawLimit = Number(query.limit ?? DEFAULT_CARDS_PAGE);
      const limit = Math.max(
        1,
        Math.min(MAX_CARDS_PAGE, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_CARDS_PAGE),
      );

      // Per-request clock. Test-only override via ?now=<epochMs>.
      let now = new Date();
      if (process.env.NODE_ENV === 'test' && query.now) {
        const t = Number(query.now);
        if (Number.isFinite(t)) now = new Date(t);
      }

      // Load the user's decks once for deck-name → id (subtree) resolution.
      const userDecks = await db
        .select({ id: decks.id, parentId: decks.parentId, name: decks.name })
        .from(decks)
        .where(eq(decks.userId, user.id));
      const resolveDeckIds = makeDeckResolver(userDecks);

      const where = buildCardWhere(ast, { userId: user.id, now, resolveDeckIds });

      // Tuple-keyset cursor predicate.
      const col = SORT_COLUMNS[sortField];
      const cmp = dir === 'asc' ? gt : lt;
      const conditions = [where];
      if (query.cursor) {
        const decoded = decodeCursor(query.cursor);
        if (decoded) {
          const v = decodeSortValue(sortField, decoded.v);
          // A cursor whose sort value is unparseable (crafted/invalid date) → drop
          // it rather than 500. decodeSortValue returns null in that case.
          if (v !== null) {
            conditions.push(
              or(cmp(col, v), and(eq(col, v), cmp(cards.id, decoded.id)))!,
            );
          }
        }
      }

      const order = dir === 'asc' ? asc : desc;
      const rows = await db
        .select()
        .from(cards)
        .where(and(...conditions))
        .orderBy(order(col), order(cards.id))
        .limit(limit);

      let nextCursor: string | null = null;
      if (rows.length === limit) {
        const last = rows[rows.length - 1]!;
        nextCursor = encodeCursor({ v: encodeSortValue(sortField, last), id: last.id });
      }

      return { items: rows, nextCursor };
    },
    {
      auth: true,
      query: t.Object({
        q: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
        sort: t.Optional(t.String()),
        now: t.Optional(t.String()),
      }),
    },
  )
  // Distinct tag universe for the sidebar (Critic must-fix C3). Avoids the
  // ≤500-mirror incompleteness — the sidebar must see every tag, not just the
  // tags on loaded cards.
  .get(
    '/tags',
    async ({ user }) => {
      const rows = await db.execute<{ tag: string }>(
        sql`SELECT DISTINCT unnest(${cards.tags}) AS tag FROM ${cards} WHERE ${cards.userId} = ${user.id} ORDER BY tag`,
      );
      const list = rows as unknown as Array<{ tag: string }>;
      return { tags: list.map((r) => r.tag) };
    },
    { auth: true },
  )
  // Bulk operations over a set of card ids. All ops are scoped to the caller
  // (`user_id = $user AND id = ANY($cardIds)`), so foreign ids are silent
  // no-ops, never leaks or errors.
  .post(
    '/bulk',
    async ({ user, body, status }) => {
      const scope = and(eq(cards.userId, user.id), inArray(cards.id, body.cardIds))!;

      switch (body.action) {
        case 'move': {
          const deckId = body.payload?.deckId;
          if (!deckId) return status(400, { error: 'deck_required' });
          // Verify target deck ownership first.
          const deck = await db
            .select({ id: decks.id })
            .from(decks)
            .where(and(eq(decks.id, deckId), eq(decks.userId, user.id)))
            .limit(1);
          if (deck.length === 0) return status(400, { error: 'deck_not_found' });
          const updated = await db
            .update(cards)
            .set({ deckId, updatedAt: new Date() })
            .where(scope)
            .returning({ id: cards.id });
          return { updated: updated.length };
        }

        case 'delete': {
          const deleted = await db.delete(cards).where(scope).returning({ id: cards.id });
          return { deleted: deleted.length };
        }

        case 'suspend':
        case 'unsuspend': {
          const updated = await db
            .update(cards)
            .set({ suspended: body.action === 'suspend', updatedAt: new Date() })
            .where(scope)
            .returning({ id: cards.id });
          return { updated: updated.length };
        }

        case 'addTag': {
          const tag = body.payload?.tag;
          if (!tag) return status(400, { error: 'tag_required' });
          // array_append only where the tag isn't already present (dedup).
          const updated = await db
            .update(cards)
            .set({ tags: sql`array_append(${cards.tags}, ${tag})`, updatedAt: new Date() })
            .where(and(scope, sql`NOT (${cards.tags} @> ARRAY[${tag}]::text[])`))
            .returning({ id: cards.id });
          return { updated: updated.length };
        }

        case 'removeTag': {
          const tag = body.payload?.tag;
          if (!tag) return status(400, { error: 'tag_required' });
          const updated = await db
            .update(cards)
            .set({ tags: sql`array_remove(${cards.tags}, ${tag})`, updatedAt: new Date() })
            .where(scope)
            .returning({ id: cards.id });
          return { updated: updated.length };
        }
      }
    },
    {
      auth: true,
      body: t.Object({
        action: t.Union([
          t.Literal('move'),
          t.Literal('delete'),
          t.Literal('suspend'),
          t.Literal('unsuspend'),
          t.Literal('addTag'),
          t.Literal('removeTag'),
        ]),
        cardIds: t.Array(t.String({ format: 'uuid' }), { minItems: 1, maxItems: 1000 }),
        payload: t.Optional(
          t.Object({
            deckId: t.Optional(t.String({ format: 'uuid' })),
            tag: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
          }),
        ),
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
      // If moving the card to a different deck, verify ownership of the target deck.
      if (body.deckId !== undefined) {
        const deck = await db
          .select({ id: decks.id })
          .from(decks)
          .where(and(eq(decks.id, body.deckId), eq(decks.userId, user.id)))
          .limit(1);
        if (deck.length === 0) return status(400, { error: 'deck_not_found' });
      }

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
          deckId: t.String({ format: 'uuid' }),
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
