import { Elysia, t } from 'elysia';
import { and, asc, desc, eq, gt, inArray, lt, lte, ne, or, sql } from 'drizzle-orm';
import {
  cards,
  db,
  deckOptionsPreset,
  decks,
  filteredDeck,
  noteTypes,
  notes,
  profile,
} from '@neuronexus/db';
import { parseCardQuery, CardQueryError, fsrsResetColumns, todayISO } from '@neuronexus/shared';
import { authPlugin } from '../auth-plugin.ts';
import { buildCardWhere } from './card-query-sql.ts';
import { resolveDeckConfig } from './deck-config.ts';
import { SORT_ORDERS, type SortOrder } from './filtered-decks.ts';

// ── Card read-payload enrichment (M1 Phase 5a) ────────────────────────────────
//
// The web review/browser screens render display HTML lazily from the note's
// SANITIZED field values + the note-type template (then DOMPurify in the
// browser). They consume CARD payloads, so the card read endpoints must embed,
// per card, the minimal render descriptor:
//   note:     { id, fieldValues, tags }
//   noteType: { id, name, kind, templates, styling }
// Field values are sanitized-at-save, so the payload HTML is safe-at-source; the
// client still DOMPurifies (defense in depth). Plaintext render* columns stay on
// the card row for SQL search + the browser table (no client render there).

type CardRow = typeof cards.$inferSelect;
type EnrichedCard = CardRow & {
  note: { id: string; fieldValues: Record<string, string>; tags: string[] } | null;
  noteType: {
    id: string;
    name: string;
    kind: string;
    templates: (typeof noteTypes.$inferSelect)['templates'];
    styling: string;
  } | null;
};

/**
 * Attach `note` + `noteType` to a list of card rows in TWO batched queries
 * (notes by id, then note-types by id). Returns the same rows in the same order
 * with the embedded descriptors merged in — the card columns stay top-level so
 * existing consumers (cursor logic, tests) are untouched.
 */
async function enrichCards(rows: CardRow[]): Promise<EnrichedCard[]> {
  if (rows.length === 0) return [];
  const noteIds = [...new Set(rows.map((r) => r.noteId))];
  const noteRows = await db
    .select({
      id: notes.id,
      fieldValues: notes.fieldValues,
      tags: notes.tags,
      noteTypeId: notes.noteTypeId,
    })
    .from(notes)
    .where(inArray(notes.id, noteIds));
  const noteById = new Map(noteRows.map((n) => [n.id, n]));

  const noteTypeIds = [...new Set(noteRows.map((n) => n.noteTypeId))];
  const noteTypeRows =
    noteTypeIds.length > 0
      ? await db
          .select({
            id: noteTypes.id,
            name: noteTypes.name,
            kind: noteTypes.kind,
            templates: noteTypes.templates,
            styling: noteTypes.styling,
          })
          .from(noteTypes)
          .where(inArray(noteTypes.id, noteTypeIds))
      : [];
  const noteTypeById = new Map(noteTypeRows.map((nt) => [nt.id, nt]));

  return rows.map((row) => {
    const note = noteById.get(row.noteId);
    const noteType = note ? noteTypeById.get(note.noteTypeId) : undefined;
    return {
      ...row,
      note: note
        ? { id: note.id, fieldValues: note.fieldValues, tags: note.tags }
        : null,
      noteType: noteType
        ? {
            id: noteType.id,
            name: noteType.name,
            kind: noteType.kind,
            templates: noteType.templates,
            styling: noteType.styling,
          }
        : null,
    };
  });
}

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
  // `sort:front` is kept (C-7) but now targets the denormalized rendered front
  // plaintext column (content lives on notes, the search cache on cards).
  front: cards.renderFrontText,
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
      return row.renderFrontText;
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
 * Recursively collect the ids of every descendant of `deckId` over `userDecks`
 * (the subtree, NOT including `deckId` itself). Cycle-safe via a `seen` set so a
 * malformed parent loop can't infinitely recurse. Mirrors
 * lib/decks.ts:getDescendantIds — kept server-side so both the deck-name
 * resolver (`makeDeckResolver`) and the regular `/queue` subtree aggregation
 * share ONE implementation.
 */
function descendantIds(deckId: string, userDecks: DeckRow[], seen = new Set<string>()): string[] {
  if (seen.has(deckId)) return [];
  seen.add(deckId);
  const children = userDecks.filter((d) => d.parentId === deckId).map((d) => d.id);
  return children.flatMap((id) => [id, ...descendantIds(id, userDecks, seen)]);
}

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
  const descendantsOf = (deckId: string): string[] => descendantIds(deckId, userDecks);
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
      return { items: await enrichCards(rows), nextCursor };
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
  // Today's review queue (M3 Phase 4 — REGULAR paths). Returns, in order:
  //   1. Due cards (state != new, due <= now), ordered by earliest due first
  //   2. New cards
  // Both lists respect `suspended = false`. Callers render the concatenation.
  //
  // Limit VALUES come from `resolveDeckConfig` (per-deck preset → profile →
  // ANKI_DEFAULTS) instead of hardcoded 20/200, and the GLOBAL per-user daily
  // counter (`profile.{newIntroducedToday,reviewsDoneToday}` with a same-day
  // guard) is subtracted so reloading the reviewer can't re-serve a fresh
  // budget. Two paths:
  //   • `?deckId=<id>` (scoped): subtree-aggregated (deck + descendants), limit
  //     values from the TARGET deck's resolved config.
  //   • no `deckId` (whole-collection, Decision 8 — the shipped reviewer path):
  //     spans ALL the user's non-suspended cards, limits from
  //     `resolveDeckConfig(null, …)` (profile / ANKI_DEFAULTS).
  // Explicit `newLimit`/`reviewLimit` query params clamp DOWN to the derived
  // daily-remaining (they can shrink a fetch, never exceed the daily budget).
  // Envelope carries `mode: 'regular'`. (The `?filteredDeckId=` branch +
  // `mode: 'filtered'` come in Phase 7.)
  .get(
    '/queue',
    async ({ user, query, status }) => {
      // ── Filtered branch (M3 Phase 7, `?filteredDeckId=`, Decision 4/5/7) ──────
      //
      // An EARLY return ABOVE the regular logic: load the saved filtered-deck row
      // (user-scoped, 404 if foreign), re-run its query via the shared SQL builder
      // (verbatim, no edit), apply the sortOrder enum as an OUTER `.orderBy()` +
      // `.limit(row.cardLimit)`, and return EVERYTHING under the `due` key so the
      // reviewer's `[...due, ...new]` stays single-path. `mode: 'filtered'`.
      if (query.filteredDeckId) {
        const now = new Date();
        const [row] = await db
          .select()
          .from(filteredDeck)
          .where(
            and(eq(filteredDeck.id, query.filteredDeckId), eq(filteredDeck.userId, user.id)),
          )
          .limit(1);
        if (!row) return status(404, { error: 'not_found' });

        // Defensive: POST/PATCH already validate, but a malformed stored query
        // shouldn't 500 — surface a clear 400.
        let ast;
        try {
          ast = parseCardQuery(row.query);
        } catch (err) {
          if (err instanceof CardQueryError) return status(400, { error: 'bad_query' });
          throw err;
        }

        // Reuse the same deck-name resolver setup the /cards/search handler uses.
        const fUserDecks = await db
          .select({ id: decks.id, parentId: decks.parentId, name: decks.name })
          .from(decks)
          .where(eq(decks.userId, user.id));
        const resolveDeckIds = makeDeckResolver(fUserDecks);
        const where = buildCardWhere(ast, { userId: user.id, now, resolveDeckIds });

        const sortOrder = (SORT_ORDERS as readonly string[]).includes(row.sortOrder)
          ? (row.sortOrder as SortOrder)
          : 'due';

        // WHERE: query predicate AND (suspended gate unless includeSuspended) AND
        // (an `overdue` due-gate when sortOrder === 'overdue'). `cram` intentionally
        // drops the due-gate (Decision 5 — future-due cards are returned).
        const conditions = [where];
        if (!row.includeSuspended) conditions.push(eq(cards.suspended, false));
        if (sortOrder === 'overdue') conditions.push(lte(cards.due, now));

        const orderBy =
          sortOrder === 'added'
            ? desc(cards.createdAt)
            : sortOrder === 'random'
              ? sql`random()`
              : sortOrder === 'difficultyDesc'
                ? desc(cards.difficulty)
                : sortOrder === 'lapses'
                  ? desc(cards.lapses)
                  : // 'due' | 'overdue' | 'cram' all order by due ASC
                    asc(cards.due);

        const sessionRows = await db
          .select()
          .from(cards)
          .where(and(...conditions))
          .orderBy(orderBy)
          .limit(row.cardLimit);

        const sessionCards = await enrichCards(sessionRows);
        return {
          due: sessionCards,
          new: [] as typeof sessionCards,
          total: sessionCards.length,
          mode: 'filtered' as const,
        };
      }

      const deckId = query.deckId;

      // Snapshot for the resolver (Principle 1): the user's decks, presets, and
      // profile — a few cheap selects, mirroring the grade handler's batch.
      const userDecks = await db.select().from(decks).where(eq(decks.userId, user.id));
      const userPresets = await db
        .select()
        .from(deckOptionsPreset)
        .where(eq(deckOptionsPreset.userId, user.id));
      const presetsById = new Map(userPresets.map((p) => [p.id, p]));
      const [existingProfile] = await db
        .select()
        .from(profile)
        .where(eq(profile.userId, user.id))
        .limit(1);
      const snapshot = { userDecks, presetsById, profile: existingProfile ?? null };

      // GLOBAL consumed-today, with the same-day reset guard: if the stored
      // counter date isn't today, treat consumption as 0 (a stale counter from a
      // previous day — the next grade's nextDailyCounts rolls it over).
      const today = todayISO(new Date());
      const consumedNew =
        existingProfile?.dailyCountsDate === today ? existingProfile.newIntroducedToday : 0;
      const consumedReviews =
        existingProfile?.dailyCountsDate === today ? existingProfile.reviewsDoneToday : 0;

      // Limit VALUES — scoped resolves the TARGET deck; whole-collection passes
      // null so everything falls to profile / ANKI_DEFAULTS (Decision 8).
      const cfg = resolveDeckConfig(deckId ?? null, snapshot);
      let newLimit = Math.max(0, cfg.newPerDay - consumedNew);
      let reviewLimit = Math.max(0, cfg.reviewsPerDay - consumedReviews);

      // Explicit query params clamp DOWN to the daily-remaining (never above it).
      if (query.newLimit !== undefined) {
        const requested = Number(query.newLimit);
        if (Number.isFinite(requested)) newLimit = Math.min(newLimit, Math.max(0, requested));
      }
      if (query.reviewLimit !== undefined) {
        const requested = Number(query.reviewLimit);
        if (Number.isFinite(requested)) reviewLimit = Math.min(reviewLimit, Math.max(0, requested));
      }

      const base = [eq(cards.userId, user.id), eq(cards.suspended, false)];
      if (deckId) {
        // Scoped path: aggregate the deck + its whole subtree (descendants).
        const subtree = [deckId, ...descendantIds(deckId, userDecks)];
        base.push(inArray(cards.deckId, subtree));
      }
      // Whole-collection path (no deckId): no extra filter — spans all the
      // user's non-suspended cards.

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

      const [dueEnriched, freshEnriched] = await Promise.all([
        enrichCards(due),
        enrichCards(fresh),
      ]);
      return {
        due: dueEnriched,
        new: freshEnriched,
        total: dueEnriched.length + freshEnriched.length,
        mode: 'regular' as const,
      };
    },
    {
      auth: true,
      query: t.Object({
        deckId: t.Optional(t.String({ format: 'uuid' })),
        filteredDeckId: t.Optional(t.String()),
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

      return { items: await enrichCards(rows), nextCursor };
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
      // Tags are note-level (Anki-correct). DISTINCT unnest over notes.tags.
      const rows = await db.execute<{ tag: string }>(
        sql`SELECT DISTINCT unnest(${notes.tags}) AS tag FROM ${notes} WHERE ${notes.userId} = ${user.id} ORDER BY tag`,
      );
      const list = rows as unknown as Array<{ tag: string }>;
      return { tags: list.map((r) => r.tag) };
    },
    { auth: true },
  )
  // Single card by id (auth, user-scoped). 404 on a foreign/missing id.
  // Returns the enriched card (note + noteType descriptors merged in) so the
  // chat screen can resolve a CITED card for `RichCard` rendering when that card
  // is outside the ≤500-row bootstrap mirror (SHOULD-FIX #4). Eden-typed.
  .get(
    '/:id',
    async ({ user, params, status }) => {
      const [row] = await db
        .select()
        .from(cards)
        .where(and(eq(cards.id, params.id), eq(cards.userId, user.id)))
        .limit(1);
      if (!row) return status(404, { error: 'not_found' });
      const [enriched] = await enrichCards([row]);
      return enriched!;
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
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
          // Tags are note-level (Anki-correct): resolve the notes of the selected
          // cards, then array_append where the tag isn't already present (dedup).
          // Scoped to the user via the card ownership filter on the subquery.
          const noteScope = sql`${notes.id} IN (SELECT ${cards.noteId} FROM ${cards} WHERE ${scope})`;
          const updated = await db
            .update(notes)
            .set({ tags: sql`array_append(${notes.tags}, ${tag})`, updatedAt: new Date() })
            .where(
              and(
                eq(notes.userId, user.id),
                noteScope,
                sql`NOT (${notes.tags} @> ARRAY[${tag}]::text[])`,
              ),
            )
            .returning({ id: notes.id });
          // No RAG re-index: tags live on the `notes` table and tag-filtered
          // retrieval JOINs the live notes row, so a chunk re-index would be a
          // no-op churn write (kb_chunk carries no tag/meta column).
          return { updated: updated.length };
        }

        case 'removeTag': {
          const tag = body.payload?.tag;
          if (!tag) return status(400, { error: 'tag_required' });
          const noteScope = sql`${notes.id} IN (SELECT ${cards.noteId} FROM ${cards} WHERE ${scope})`;
          const updated = await db
            .update(notes)
            .set({ tags: sql`array_remove(${notes.tags}, ${tag})`, updatedAt: new Date() })
            .where(and(eq(notes.userId, user.id), noteScope))
            .returning({ id: notes.id });
          // No RAG re-index (see addTag): tag-filtered retrieval reads live
          // notes, so re-indexing here would only churn the chunk.
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
  // Card content is derived from notes (note-types model, M1). Card creation
  // happens via POST /notes, not here. PATCH keeps card-level (not note-level)
  // mutations: deck-move, suspend, and manual scheduling control —
  //   - `forget`  → reset FSRS state to "new" (Anki "Forget").
  //   - `setDue`  → set the due date to a specific instant (Anki "Set Due Date").
  // Control fields are mapped EXPLICITLY (no `...body` spread) so a malicious /
  // mistyped key can never reach the column set, and forget/setDue can't smuggle
  // arbitrary FSRS columns. `forget` + `setDue` are mutually exclusive (forget
  // resets due to now, setDue picks a specific instant — conflicting intents).
  // Manual schedule changes bump `updatedAt`, which is what trips the undo
  // stale-guard (`POST /reviews/undo` refuses once a card was modified after its
  // last grade) — that's intentional. render* cache is NOT touched (scheduling
  // doesn't change content).
  .patch(
    '/:id',
    async ({ user, params, body, status }) => {
      if (body.forget === true && body.setDue !== undefined) {
        return status(400, { error: 'forget_and_setdue_exclusive' });
      }

      const patch: Record<string, unknown> = { updatedAt: new Date() };

      // If moving the card to a different deck, verify ownership of the target deck.
      if (body.deckId !== undefined) {
        const deck = await db
          .select({ id: decks.id })
          .from(decks)
          .where(and(eq(decks.id, body.deckId), eq(decks.userId, user.id)))
          .limit(1);
        if (deck.length === 0) return status(400, { error: 'deck_not_found' });
        patch.deckId = body.deckId;
      }

      if (body.suspended !== undefined) patch.suspended = body.suspended;

      if (body.forget === true) {
        // Reuse the shared FSRS defaults — no hard-coded magic. Resets state to
        // "new" with zeroed reps/lapses, due=now, lastReview=null.
        Object.assign(patch, fsrsResetColumns());
      }

      if (body.setDue !== undefined) {
        const d = new Date(body.setDue);
        if (Number.isNaN(d.getTime())) return status(400, { error: 'invalid_date' });
        patch.due = d;
      }

      const [updated] = await db
        .update(cards)
        .set(patch)
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
          suspended: t.Boolean(),
          forget: t.Boolean(),
          setDue: t.String(),
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
