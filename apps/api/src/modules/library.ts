// Library module (L1) — the user's personal material store (`/library`). A
// "library item" IS a `sources` row (Р1 — the table is NOT renamed; the library
// is a UI/ownership concept over it). Sources are user-level now (notebooks
// attach via `notebook_sources`), so this module owns the source LIFECYCLE
// (create/presign/finalize/delete) shared with the legacy notebook routes via
// `sources-shared.ts`, plus reading-state + metadata that are library-only.
//
//   GET    /library                       — paginated list + filters + aggregates.
//   POST   /library/items                 — inline url/text create (+ optional attach).
//   POST   /library/items/presign         — pdf/epub claim + presign.
//   POST   /library/items/:id/finalize    — verify + dedup + enqueue (+ optional attach).
//   GET    /library/items/:id             — one item: metadata + status + notebooks + cardCount.
//   PATCH  /library/items/:id             — edit metadata (title/author/description/tags/readingStatus).
//   DELETE /library/items/:id             — full source delete (edges cascade, card tombstones).
//   PUT    /library/items/:id/reading-state — upsert reading position/status.
//
// Every query is `user.id`-FIRST-conjunct scoped; a foreign/missing id is 404.

import { Elysia, t } from 'elysia';
import { and, asc, count, countDistinct, desc, eq, ilike, lt, or, sql } from 'drizzle-orm';
import {
  cardSources,
  db,
  notebooks,
  notebookSources,
  sourceChunks,
  sourceReadingState,
  sources,
  type Source,
} from '@neuronexus/db';
import { authPlugin } from '../auth-plugin.ts';
import { env } from '../env.ts';
import {
  countLibraryItems,
  createInlineSource,
  deleteSourceCompletely,
  finalizeUploadSource,
  presignUploadSource,
} from './sources-shared.ts';

const LIBRARY_PAGE = env.ai.LIBRARY_PAGE;
const MAX_LIBRARY_PAGE = 200;

// Metadata caps (explicit-field PATCH).
const TITLE_MAX = 300;
const AUTHOR_MAX = 500;
const DESCRIPTION_MAX = 2000;
const TAGS_MAX = 32;
const TAG_LEN_MAX = 64;

type ReadingStatus = 'unread' | 'reading' | 'finished';
const READING_STATUSES = new Set<ReadingStatus>(['unread', 'reading', 'finished']);

/**
 * Shape one library item for the list/detail response. The aggregate columns
 * (indexed/notebookCount/cardCount/readingStatus/percent) are joined in by the
 * caller's query (no N+1) and merged here.
 */
interface LibraryItemAggregates {
  indexed: number;
  notebookCount: number;
  cardCount: number;
  readingStatus: ReadingStatus;
  percent: number | null;
}

function shapeLibraryItem(s: Source, agg: LibraryItemAggregates): Record<string, unknown> {
  return {
    id: s.id,
    kind: s.kind,
    title: s.title,
    author: s.author,
    description: s.description,
    language: s.language,
    tags: s.tags,
    status: s.status,
    errorCode: s.errorCode,
    indexed: agg.indexed,
    total: s.chunkCount ?? 0,
    readingStatus: agg.readingStatus,
    percent: agg.percent,
    pageCount: s.pageCount,
    byteSize: s.byteSize,
    coverMediaId: s.coverMediaId,
    notebookCount: agg.notebookCount,
    cardCount: agg.cardCount,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export const libraryModule = new Elysia({ prefix: '/library' })
  .use(authPlugin)
  // ── list ─────────────────────────────────────────────────────────────────────
  // Paginated material list with filters + one-query aggregates. Filters: q
  // (ILIKE title|author), kind, tag (array containment), reading (status), shelf
  // (reading|unattached). Sort: added (created_at DESC, default) | title |
  // lastRead (reading-state updated_at DESC NULLS LAST). Cursor by created_at
  // (added-sort only; the simple/shipped path — other sorts return one page).
  .get(
    '/',
    async ({ user, query }) => {
      const rawLimit = Number(query.limit ?? LIBRARY_PAGE);
      const limit = Math.max(
        1,
        Math.min(MAX_LIBRARY_PAGE, Number.isFinite(rawLimit) ? rawLimit : LIBRARY_PAGE),
      );

      // Per-source aggregate subqueries (correlated, one SELECT — no N+1).
      const indexedSq = db
        .select({
          sourceId: sourceChunks.sourceId,
          indexed: count().as('indexed'),
        })
        .from(sourceChunks)
        .where(eq(sourceChunks.embedded, true))
        .groupBy(sourceChunks.sourceId)
        .as('indexed_sq');
      const notebookSq = db
        .select({
          sourceId: notebookSources.sourceId,
          notebookCount: count().as('notebook_count'),
        })
        .from(notebookSources)
        .groupBy(notebookSources.sourceId)
        .as('notebook_sq');
      const cardSq = db
        .select({
          sourceId: cardSources.sourceId,
          cardCount: countDistinct(cardSources.cardId).as('card_count'),
        })
        .from(cardSources)
        .groupBy(cardSources.sourceId)
        .as('card_sq');

      const conditions = [
        eq(sources.userId, user.id),
        sql`${sources.status} <> 'deleting'`,
      ];
      if (query.q) {
        const pat = `%${query.q}%`;
        conditions.push(or(ilike(sources.title, pat), ilike(sources.author, pat))!);
      }
      if (query.kind) conditions.push(eq(sources.kind, query.kind));
      if (query.tag) conditions.push(sql`${sources.tags} @> ARRAY[${query.tag}]::text[]`);
      // reading filter: unread = no reading-state row OR status='unread'.
      if (query.reading === 'unread') {
        conditions.push(
          sql`(${sourceReadingState.status} IS NULL OR ${sourceReadingState.status} = 'unread')`,
        );
      } else if (query.reading === 'reading' || query.reading === 'finished') {
        conditions.push(eq(sourceReadingState.status, query.reading));
      }
      // shelf: reading = status 'reading'; unattached = no notebook edges.
      if (query.shelf === 'reading') {
        conditions.push(eq(sourceReadingState.status, 'reading'));
      } else if (query.shelf === 'unattached') {
        conditions.push(sql`${notebookSq.notebookCount} IS NULL`);
      }
      // Cursor (added-sort keyset by created_at).
      if (query.cursor) {
        const parsed = new Date(query.cursor);
        if (!Number.isNaN(parsed.getTime())) conditions.push(lt(sources.createdAt, parsed));
      }

      const orderBy =
        query.sort === 'title'
          ? [asc(sources.title)]
          : query.sort === 'lastRead'
            ? [sql`${sourceReadingState.updatedAt} DESC NULLS LAST`, desc(sources.createdAt)]
            : [desc(sources.createdAt)];

      const rows = await db
        .select({
          source: sources,
          indexed: indexedSq.indexed,
          notebookCount: notebookSq.notebookCount,
          cardCount: cardSq.cardCount,
          readingStatus: sourceReadingState.status,
          percent: sourceReadingState.percent,
        })
        .from(sources)
        .leftJoin(
          sourceReadingState,
          and(
            eq(sourceReadingState.sourceId, sources.id),
            eq(sourceReadingState.userId, user.id),
          ),
        )
        .leftJoin(indexedSq, eq(indexedSq.sourceId, sources.id))
        .leftJoin(notebookSq, eq(notebookSq.sourceId, sources.id))
        .leftJoin(cardSq, eq(cardSq.sourceId, sources.id))
        .where(and(...conditions))
        .orderBy(...orderBy)
        .limit(limit);

      const items = rows.map((r) =>
        shapeLibraryItem(r.source, {
          indexed: Number(r.indexed ?? 0),
          notebookCount: Number(r.notebookCount ?? 0),
          cardCount: Number(r.cardCount ?? 0),
          readingStatus: (r.readingStatus as ReadingStatus) ?? 'unread',
          percent: r.percent ?? null,
        }),
      );

      // nextCursor only for the default added-sort keyset (a full page implies more).
      const nextCursor =
        query.sort === undefined || query.sort === 'added'
          ? rows.length === limit
            ? rows[rows.length - 1]!.source.createdAt.toISOString()
            : null
          : null;

      return { items, nextCursor };
    },
    {
      auth: true,
      query: t.Object({
        q: t.Optional(t.String({ maxLength: 200 })),
        kind: t.Optional(t.String({ maxLength: 16 })),
        tag: t.Optional(t.String({ maxLength: TAG_LEN_MAX })),
        reading: t.Optional(
          t.Union([t.Literal('unread'), t.Literal('reading'), t.Literal('finished')]),
        ),
        shelf: t.Optional(t.Union([t.Literal('reading'), t.Literal('unattached')])),
        sort: t.Optional(
          t.Union([t.Literal('added'), t.Literal('title'), t.Literal('lastRead')]),
        ),
        limit: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
      }),
    },
  )
  // ── inline create (url / text) ────────────────────────────────────────────────
  // Mirrors the notebook source-create (minus the per-notebook cap) + an optional
  // `notebookId` that attaches in the same tx (Р8). Enforces the per-user cap.
  .post(
    '/items',
    async ({ user, body, status }) => {
      if ((await countLibraryItems(user.id)) >= env.ai.MAX_LIBRARY_ITEMS_PER_USER) {
        return status(409, { error: 'library_full' });
      }
      if (body.notebookId) {
        const [nb] = await db
          .select({ id: notebooks.id })
          .from(notebooks)
          .where(and(eq(notebooks.id, body.notebookId), eq(notebooks.userId, user.id)))
          .limit(1);
        if (!nb) return status(404, { error: 'not_found' });
      }
      const row = await createInlineSource(
        user.id,
        body.kind === 'url'
          ? { kind: 'url', title: body.title, url: body.url }
          : { kind: 'text', title: body.title, text: body.text },
        body.notebookId,
      );
      return row;
    },
    {
      auth: true,
      body: t.Union([
        t.Object({
          kind: t.Literal('url'),
          title: t.String({ minLength: 1, maxLength: TITLE_MAX }),
          url: t.String({ minLength: 1, maxLength: 2000 }),
          notebookId: t.Optional(t.String({ format: 'uuid' })),
        }),
        t.Object({
          kind: t.Literal('text'),
          title: t.String({ minLength: 1, maxLength: TITLE_MAX }),
          text: t.String({ minLength: 1 }),
          notebookId: t.Optional(t.String({ format: 'uuid' })),
        }),
      ]),
    },
  )
  // ── presign (pdf / epub) ──────────────────────────────────────────────────────
  // Claim a uuid + presign a POST policy. The optional notebook attach lands at
  // finalize (the upload may never complete). Enforces the per-user cap up front.
  .post(
    '/items/presign',
    async ({ user, body, status }) => {
      if ((await countLibraryItems(user.id)) >= env.ai.MAX_LIBRARY_ITEMS_PER_USER) {
        return status(409, { error: 'library_full' });
      }
      const res = await presignUploadSource(user.id, body);
      if (!res.ok) {
        const code = res.error === 'source_conflict' ? 409 : 400;
        return status(code, { error: res.error });
      }
      return { sourceId: res.sourceId, upload: res.upload };
    },
    {
      auth: true,
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: TITLE_MAX }),
        mime: t.String({ maxLength: 128 }),
        size: t.Integer({ minimum: 0 }),
      }),
    },
  )
  // Verify the uploaded object + per-user byte dedup + enqueue ingest, then
  // optionally attach to a notebook. 409 `duplicate_source` carries the existing
  // source id so the UI can offer "attach the existing one instead".
  .post(
    '/items/:id/finalize',
    async ({ user, params, body, status }) => {
      if (body.notebookId) {
        const [nb] = await db
          .select({ id: notebooks.id })
          .from(notebooks)
          .where(and(eq(notebooks.id, body.notebookId), eq(notebooks.userId, user.id)))
          .limit(1);
        if (!nb) return status(404, { error: 'not_found' });
      }
      const res = await finalizeUploadSource(user.id, params.id, body.notebookId);
      if (!res.ok) {
        return status(res.status, {
          error: res.error,
          ...(res.existingSourceId ? { existingSourceId: res.existingSourceId } : {}),
        });
      }
      return res.source;
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({ notebookId: t.Optional(t.String({ format: 'uuid' })) }),
    },
  )
  // ── detail ─────────────────────────────────────────────────────────────────────
  // One item: metadata + ingest status/progress + reading state + the notebooks
  // it's attached to + cardCount. 404 if foreign.
  .get(
    '/items/:id',
    async ({ user, params, status }) => {
      const [source] = await db
        .select()
        .from(sources)
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
        .limit(1);
      if (!source) return status(404, { error: 'not_found' });

      const [[indexedRow], [cardRow], [readingRow], notebookRows] = await Promise.all([
        db
          .select({ n: count() })
          .from(sourceChunks)
          .where(and(eq(sourceChunks.sourceId, params.id), eq(sourceChunks.embedded, true))),
        db
          .select({ n: countDistinct(cardSources.cardId) })
          .from(cardSources)
          .where(and(eq(cardSources.userId, user.id), eq(cardSources.sourceId, params.id))),
        db
          .select({
            status: sourceReadingState.status,
            percent: sourceReadingState.percent,
            page: sourceReadingState.page,
            chunkPos: sourceReadingState.chunkPos,
          })
          .from(sourceReadingState)
          .where(
            and(
              eq(sourceReadingState.sourceId, params.id),
              eq(sourceReadingState.userId, user.id),
            ),
          )
          .limit(1),
        db
          .select({ id: notebooks.id, title: notebooks.title })
          .from(notebookSources)
          .innerJoin(notebooks, eq(notebooks.id, notebookSources.notebookId))
          .where(
            and(
              eq(notebookSources.userId, user.id),
              eq(notebookSources.sourceId, params.id),
            ),
          )
          .orderBy(desc(notebookSources.addedAt)),
      ]);

      const shaped = shapeLibraryItem(source, {
        indexed: indexedRow?.n ?? 0,
        notebookCount: notebookRows.length,
        cardCount: cardRow?.n ?? 0,
        readingStatus: (readingRow?.status as ReadingStatus) ?? 'unread',
        percent: readingRow?.percent ?? null,
      });
      // L2 — the reader restores its exact position from the persisted page
      // (PDF) / chunkPos (text); null when never opened (falls back to the
      // localStorage nn:pdf:pos cache + one-time migration PUT).
      const readingState = readingRow
        ? {
            status: (readingRow.status as ReadingStatus) ?? 'unread',
            page: readingRow.page ?? null,
            chunkPos: readingRow.chunkPos ?? null,
            percent: readingRow.percent ?? null,
          }
        : null;
      return { ...shaped, notebooks: notebookRows, readingState };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // ── edit metadata ────────────────────────────────────────────────────────────
  // EXPLICIT field mapping (no body spread — a stray key never reaches a column).
  // title 1..300 / author ≤500 / description ≤2000 / tags ≤32×≤64. readingStatus
  // upserts source_reading_state.status. Empty body → 400 nothing_to_update.
  .patch(
    '/items/:id',
    async ({ user, params, body, status }) => {
      const [source] = await db
        .select({ id: sources.id })
        .from(sources)
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
        .limit(1);
      if (!source) return status(404, { error: 'not_found' });

      const patch: Record<string, unknown> = {};
      if (body.title !== undefined) {
        const title = body.title.trim();
        if (title.length < 1 || title.length > TITLE_MAX) {
          return status(400, { error: 'invalid_metadata' });
        }
        patch.title = title;
      }
      if (body.author !== undefined) {
        patch.author = body.author.length === 0 ? null : body.author.slice(0, AUTHOR_MAX);
      }
      if (body.description !== undefined) {
        patch.description =
          body.description.length === 0 ? null : body.description.slice(0, DESCRIPTION_MAX);
      }
      if (body.tags !== undefined) {
        if (body.tags.length > TAGS_MAX) return status(400, { error: 'invalid_metadata' });
        const tags: string[] = [];
        for (const raw of body.tags) {
          const tag = raw.trim().slice(0, TAG_LEN_MAX);
          if (tag.length === 0) continue;
          if (!tags.includes(tag)) tags.push(tag);
        }
        patch.tags = tags;
      }

      const hasMetaPatch = Object.keys(patch).length > 0;
      const hasReading = body.readingStatus !== undefined;
      if (!hasMetaPatch && !hasReading) return status(400, { error: 'nothing_to_update' });

      let row = source;
      if (hasMetaPatch) {
        patch.updatedAt = new Date();
        const [updated] = await db
          .update(sources)
          .set(patch)
          .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
          .returning();
        if (updated) row = updated;
      }

      if (hasReading) {
        const readingStatus = body.readingStatus as ReadingStatus;
        if (!READING_STATUSES.has(readingStatus)) {
          return status(400, { error: 'invalid_metadata' });
        }
        await db
          .insert(sourceReadingState)
          .values({ userId: user.id, sourceId: params.id, status: readingStatus })
          .onConflictDoUpdate({
            target: [sourceReadingState.sourceId, sourceReadingState.userId],
            set: { status: readingStatus, updatedAt: new Date() },
          });
      }

      // Return the (possibly) updated source row.
      const [out] = await db
        .select()
        .from(sources)
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
        .limit(1);
      return out ?? row;
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        title: t.Optional(t.String({ maxLength: TITLE_MAX + 1 })),
        author: t.Optional(t.String({ maxLength: AUTHOR_MAX + 1 })),
        description: t.Optional(t.String({ maxLength: DESCRIPTION_MAX + 1 })),
        tags: t.Optional(t.Array(t.String({ maxLength: TAG_LEN_MAX + 1 }), { maxItems: TAGS_MAX + 1 })),
        readingStatus: t.Optional(t.String({ maxLength: 16 })),
      }),
    },
  )
  // ── delete ─────────────────────────────────────────────────────────────────────
  // Full source delete (the shared flow): kb_chunk cleanup + cascade edges +
  // card_sources tombstones + S3. 404 if foreign.
  .delete(
    '/items/:id',
    async ({ user, params, status }) => {
      const ok = await deleteSourceCompletely(user.id, params.id);
      if (!ok) return status(404, { error: 'not_found' });
      return { ok: true };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // ── reading state ──────────────────────────────────────────────────────────────
  // Upsert reading position/percent. The first progress PUT (or any PUT on an
  // 'unread'/absent row) flips status → 'reading'; 'finished' is set ONLY via
  // PATCH readingStatus. page/chunkPos are non-negative ints, percent ∈ [0,1].
  .put(
    '/items/:id/reading-state',
    async ({ user, params, body, status }) => {
      const [source] = await db
        .select({ id: sources.id })
        .from(sources)
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
        .limit(1);
      if (!source) return status(404, { error: 'not_found' });

      const [existing] = await db
        .select({ status: sourceReadingState.status })
        .from(sourceReadingState)
        .where(
          and(
            eq(sourceReadingState.sourceId, params.id),
            eq(sourceReadingState.userId, user.id),
          ),
        )
        .limit(1);

      // A progress PUT moves unread→reading; an already-'finished'/'reading' row
      // keeps its status (a manual 'finished' isn't undone by a stray scroll).
      const nextStatus = existing?.status === undefined || existing.status === 'unread'
        ? 'reading'
        : existing.status;

      const set: Record<string, unknown> = { status: nextStatus, updatedAt: new Date() };
      if (body.page !== undefined) set.page = body.page;
      if (body.chunkPos !== undefined) set.chunkPos = body.chunkPos;
      if (body.percent !== undefined) set.percent = body.percent;

      await db
        .insert(sourceReadingState)
        .values({
          userId: user.id,
          sourceId: params.id,
          status: nextStatus,
          page: body.page ?? null,
          chunkPos: body.chunkPos ?? null,
          percent: body.percent ?? null,
        })
        .onConflictDoUpdate({
          target: [sourceReadingState.sourceId, sourceReadingState.userId],
          set,
        });
      return { ok: true, status: nextStatus };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        page: t.Optional(t.Integer({ minimum: 0 })),
        chunkPos: t.Optional(t.Integer({ minimum: 0 })),
        percent: t.Optional(t.Number({ minimum: 0, maximum: 1 })),
      }),
    },
  );
