// NotebookLM sources — CRUD + ingest routes (M1, T3 + T7). Every query is
// `user.id`-FIRST-conjunct scoped; a foreign/missing id is a 404 (no leak about
// which case). Mirrors the rest of apps/api (Elysia module, drizzle, the media
// claim-on-presign ownership pattern).
//
//   GET    /notebooks                         — list, newest-first.
//   POST   /notebooks {title}                 — create (MAX_NOTEBOOKS_PER_USER).
//   PATCH  /notebooks/:id {title}             — rename.
//   DELETE /notebooks/:id                     — delete (sources cascade).
//   GET    /notebooks/:id/sources             — list w/ status + computed progress.
//   POST   /notebooks/:id/sources             — add a source (MAX_SOURCES_PER_NOTEBOOK):
//                                               pdf/epub → claiming presign + source id;
//                                               url/text → inline create + enqueue.
//   POST   /sources/:id/finalize              — verify upload + byte-dedup + enqueue (T3).
//   GET    /sources/:id                        — status + computed progress + errorCode.
//   PATCH  /sources/:id {title}               — rename.
//   DELETE /sources/:id                        — soft-delete + kb_chunk cleanup + S3 delete.
//
// Storage path (T3): uploaded source bytes live in S3 under `source/{uuid}`,
// presigned/HEAD-verified via the SAME key-agnostic storage.ts helpers as media
// (`media` is untouched). The ingest worker (`source-ingest.ts`) owns parsing +
// embedding; these routes only enqueue.

import { Elysia, t } from 'elysia';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  cardSources,
  cards,
  db,
  decks,
  notebooks,
  notebookSources,
  sourceAnnotations,
  sourceChunks,
  sourceMarks,
  sources,
  type Db,
  type Source,
} from '@neuronexus/db';
import {
  ANNOTATION_MAX_POINTS,
  ANNOTATION_MAX_STROKES,
  MARK_NOTE_MAX,
  MARK_QUOTE_MAX,
  MARK_RECTS_MAX,
  MARKED_TEXT_MAX,
  SOURCE_MARK_COLORS,
  type InkStroke,
  type MarkRect,
  type PageAnnotations,
  type SourceMarkKind,
} from '@neuronexus/shared';
import { authPlugin } from '../auth-plugin.ts';
import { env } from '../env.ts';
import { rootLogger } from '../logger.ts';
import { getObjectBytes } from '../storage.ts';
import { isChatEnabled } from '../ai/openai-client.ts';
import { suggestCard } from '../ai/suggest-card.ts';
import { resolveNoteTypeForCreate, enqueueToolCardsForIndex } from '../ai/tools.ts';
import { resolveNoteCreate, insertNoteAndCards } from './notes.ts';
import {
  countLibraryItems,
  countNotebookSources,
  createInlineSource,
  deleteSourceCompletely,
  finalizeUploadSource,
  isFkViolation,
  MAX_INLINE_TEXT,
  presignUploadSource,
} from './sources-shared.ts';

/** Computed ingest progress numerator: COUNT(source_chunks WHERE embedded=true). */
async function indexedCountFor(sourceId: string): Promise<number> {
  const [row] = await db
    .select({ indexed: count() })
    .from(sourceChunks)
    .where(and(eq(sourceChunks.sourceId, sourceId), eq(sourceChunks.embedded, true)));
  return row?.indexed ?? 0;
}

/**
 * Batched progress numerators for a set of sources (one GROUP BY query, no
 * N+1) — `Map<sourceId, COUNT(embedded=true)>`. Scoped by source_id (NOT
 * notebook_id; document chunks are user-level now). Empty set ⇒ empty map.
 */
export async function indexedCountsFor(sourceIds: string[]): Promise<Map<string, number>> {
  if (sourceIds.length === 0) return new Map();
  const rows = await db
    .select({ sourceId: sourceChunks.sourceId, indexed: count() })
    .from(sourceChunks)
    .where(and(inArray(sourceChunks.sourceId, sourceIds), eq(sourceChunks.embedded, true)))
    .groupBy(sourceChunks.sourceId);
  return new Map(rows.map((r) => [r.sourceId, r.indexed]));
}

/** Shape one source row for the client: row + computed progress. */
function withProgress(source: Source, indexed: number): Record<string, unknown> {
  return {
    ...source,
    indexed,
    total: source.chunkCount ?? 0,
  };
}

/** `#rrggbb` hex literal (case-insensitive) — the only color shape persisted. */
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

/**
 * Leniency band for normalized coordinates (S3 / M5.1): `setPointerCapture`
 * keeps streaming pointermoves slightly OUTSIDE the canvas, so an ink point or
 * selection rect can land at e.g. -0.004 / 1.012. We CLAMP such small overflows
 * into [0,1] (mutating the validated-and-persisted copy) instead of rejecting
 * the whole page payload; only a GROSS overflow beyond this band (or a
 * NaN/±Inf/non-number) is rejected. Mirrors the web-side `canvasToNorm` clamp.
 */
const COORD_OVERFLOW_TOLERANCE = 0.05;

/** Clamp a value into [0,1]. Caller guarantees `n` is a finite number. */
function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Structural validation of a PUT annotations body's strokes (M4). Rejects
 * malformed ink before it reaches the DB: each stroke must declare a known tool,
 * a `#rrggbb` color, a finite positive width, and a flat `points` list of finite
 * numbers whose length is a multiple of 3 (x/y/p triples) with x/y in [0,1]. The
 * per-page stroke/point caps bound the row size (the byte cap is checked at the
 * route). Returns `true` for a well-formed PageAnnotations (v===1).
 */
function validateStrokes(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const ann = body as { v?: unknown; strokes?: unknown };
  if (ann.v !== 1) return false;
  if (!Array.isArray(ann.strokes)) return false;
  if (ann.strokes.length > ANNOTATION_MAX_STROKES) return false;

  let totalPoints = 0;
  for (const raw of ann.strokes) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const s = raw as Partial<InkStroke>;
    if (s.tool !== 'pen' && s.tool !== 'highlighter') return false;
    if (typeof s.color !== 'string' || !HEX_COLOR_RE.test(s.color)) return false;
    if (typeof s.width !== 'number' || !Number.isFinite(s.width) || s.width <= 0) {
      return false;
    }
    if (!Array.isArray(s.points) || s.points.length === 0 || s.points.length % 3 !== 0) {
      return false;
    }
    for (let i = 0; i < s.points.length; i++) {
      const n = s.points[i];
      if (typeof n !== 'number' || !Number.isFinite(n)) return false;
      // x/y (i % 3 === 0 or 1) are normalized page coordinates. A small overflow
      // (|n| within the tolerance band) is CLAMPED into [0,1] in place — the
      // persisted strokes carry the clamped values; a gross overflow rejects.
      if (i % 3 !== 2 && (n < 0 || n > 1)) {
        if (n < -COORD_OVERFLOW_TOLERANCE || n > 1 + COORD_OVERFLOW_TOLERANCE) return false;
        s.points[i] = clamp01(n);
      }
    }
    totalPoints += s.points.length / 3;
    if (totalPoints > ANNOTATION_MAX_POINTS) return false;
  }
  return true;
}

/** A Drizzle transaction handle (the arg passed to `db.transaction`). */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Per-source cap on the number of marks (DoS guard) → 409 over the line. */
const MARKS_PER_SOURCE_CAP = 2000;

const MARK_KINDS = new Set<SourceMarkKind>(['highlight', 'note']);
const MARK_COLORS = new Set<string>(SOURCE_MARK_COLORS);

/**
 * Structural validation of a mark's `rects` payload (M5). Mirrors
 * `validateStrokes`'s plain-boolean style: 1..MARK_RECTS_MAX rects, each with
 * finite x/y/w/h in [0,1] (normalized page coords). Returns `true` for a
 * well-formed `MarkRect[]`. The kind/color/quote/note caps are checked at the
 * route (they map to distinct error fields); this guards only the geometry.
 */
function validateMarkRects(raw: unknown): raw is MarkRect[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MARK_RECTS_MAX) return false;
  for (const r of raw) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
    const rect = r as Partial<MarkRect>;
    // Same S3 leniency as validateStrokes: a small overflow is CLAMPED into
    // [0,1] in place (the persisted rect carries the clamped value); a gross
    // overflow or a non-finite value rejects.
    for (const k of ['x', 'y', 'w', 'h'] as const) {
      const v = rect[k];
      if (typeof v !== 'number' || !Number.isFinite(v)) return false;
      if (v < 0 || v > 1) {
        if (v < -COORD_OVERFLOW_TOLERANCE || v > 1 + COORD_OVERFLOW_TOLERANCE) return false;
        rect[k] = clamp01(v);
      }
    }
  }
  return true;
}

export const notebooksModule = new Elysia({ prefix: '/notebooks' })
  .use(authPlugin)
  // ── notebooks ───────────────────────────────────────────────────────────────
  .get(
    '/',
    async ({ user }) => {
      const rows = await db
        .select()
        .from(notebooks)
        .where(eq(notebooks.userId, user.id))
        .orderBy(desc(notebooks.createdAt));
      return { items: rows };
    },
    { auth: true },
  )
  .post(
    '/',
    async ({ user, body, status }) => {
      const [{ n }] = await db
        .select({ n: count() })
        .from(notebooks)
        .where(eq(notebooks.userId, user.id));
      if (n >= env.ai.MAX_NOTEBOOKS_PER_USER) {
        return status(409, { error: 'too_many_notebooks' });
      }
      const [row] = await db
        .insert(notebooks)
        .values({ userId: user.id, title: body.title })
        .returning();
      return row!;
    },
    {
      auth: true,
      body: t.Object({ title: t.String({ minLength: 1, maxLength: 200 }) }),
    },
  )
  .patch(
    '/:id',
    async ({ user, params, body, status }) => {
      const [row] = await db
        .update(notebooks)
        .set({ title: body.title, updatedAt: new Date() })
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .returning();
      if (!row) return status(404, { error: 'not_found' });
      return row;
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({ title: t.String({ minLength: 1, maxLength: 200 }) }),
    },
  )
  .delete(
    '/:id',
    async ({ user, params, status }) => {
      // Ownership check first (avoids leaking whether the id exists at all).
      const [nb] = await db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!nb) return status(404, { error: 'not_found' });

      // Library refactor (Р3/Р4): deleting a notebook does NOT touch sources or
      // their vectors — they live in the library and may be shared by other
      // notebooks. Only the join edges (notebook_sources) + conversations die,
      // via FK cascade. No kb_chunk cleanup here (that's source-delete's job).
      await db
        .delete(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)));

      return { ok: true };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // ── sources within a notebook ────────────────────────────────────────────────
  .get(
    '/:id/sources',
    async ({ user, params, status }) => {
      const [nb] = await db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!nb) return status(404, { error: 'not_found' });
      // Attached sources via the join edge, newest-attach first.
      const rows = await db
        .select({ source: sources })
        .from(notebookSources)
        .innerJoin(sources, eq(sources.id, notebookSources.sourceId))
        .where(and(eq(notebookSources.notebookId, params.id), eq(sources.userId, user.id)))
        .orderBy(desc(notebookSources.addedAt));
      const items = rows.map((r) => r.source);
      // Computed progress per source: COUNT(embedded) over its chunks (by source_id).
      const indexedBySource = await indexedCountsFor(items.map((s) => s.id));
      return { items: items.map((s) => withProgress(s, indexedBySource.get(s.id) ?? 0)) };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // Add a source TO a notebook (UX shortcut, Р8: create a library item AND
  // attach it in one call). pdf/epub → claim a uuid + presign (attach lands at
  // finalize). url/text → inline create + attach + enqueue. Enforces BOTH the
  // per-notebook cap (attach target) and the per-user library cap.
  .post(
    '/:id/sources',
    async ({ user, params, body, status }) => {
      const [nb] = await db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!nb) return status(404, { error: 'not_found' });

      if ((await countNotebookSources(user.id, params.id)) >= env.ai.MAX_SOURCES_PER_NOTEBOOK) {
        return status(409, { error: 'too_many_sources' });
      }
      if ((await countLibraryItems(user.id)) >= env.ai.MAX_LIBRARY_ITEMS_PER_USER) {
        return status(409, { error: 'library_full' });
      }

      // ── upload kinds (pdf/epub): claim + presign (attach at finalize) ──────────
      if (body.kind === 'upload') {
        const res = await presignUploadSource(user.id, body);
        if (!res.ok) {
          const code = res.error === 'source_conflict' ? 409 : 400;
          return status(code, { error: res.error });
        }
        return { sourceId: res.sourceId, upload: res.upload };
      }

      // ── url / text: inline create + attach in one tx ──────────────────────────
      const row = await createInlineSource(
        user.id,
        body.kind === 'url'
          ? { kind: 'url', title: body.title, url: body.url }
          : { kind: 'text', title: body.title, text: body.text },
        params.id,
      );
      return row;
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Union([
        t.Object({
          kind: t.Literal('upload'),
          title: t.String({ minLength: 1, maxLength: 300 }),
          mime: t.String({ maxLength: 128 }),
          size: t.Integer({ minimum: 0 }),
        }),
        t.Object({
          kind: t.Literal('url'),
          title: t.String({ minLength: 1, maxLength: 300 }),
          url: t.String({ minLength: 1, maxLength: 2000 }),
        }),
        t.Object({
          kind: t.Literal('text'),
          title: t.String({ minLength: 1, maxLength: 300 }),
          text: t.String({ minLength: 1, maxLength: MAX_INLINE_TEXT }),
        }),
      ]),
    },
  )
  // ── attach / detach (library refactor §4.2) ──────────────────────────────────
  // Attach existing library sources to this notebook. Body `{ sourceIds }` (cap
  // MAX_ATTACH_BATCH per call → 400). Foreign/missing source → 404 first. The
  // resulting attached count must not exceed MAX_SOURCES_PER_NOTEBOOK → 409.
  // Idempotent (onConflictDoNothing on the plain (notebook_id, source_id) unique).
  .post(
    '/:id/sources/attach',
    async ({ user, params, body, status }) => {
      const [nb] = await db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!nb) return status(404, { error: 'not_found' });

      const ids = Array.from(new Set(body.sourceIds));
      if (ids.length === 0) return { ok: true, attached: 0 };
      if (ids.length > env.ai.MAX_ATTACH_BATCH) {
        return status(400, { error: 'too_many_sources' });
      }

      // Ownership: every id must be a live (non-deleting) source of the caller.
      const owned = await db
        .select({ id: sources.id })
        .from(sources)
        .where(
          and(
            eq(sources.userId, user.id),
            inArray(sources.id, ids),
            sql`${sources.status} <> 'deleting'`,
          ),
        );
      if (owned.length !== ids.length) return status(404, { error: 'not_found' });

      // Subtract the ids ALREADY attached — re-attaching an existing source is a
      // no-op (onConflictDoNothing) and must not consume the per-notebook cap.
      const already = await db
        .select({ sourceId: notebookSources.sourceId })
        .from(notebookSources)
        .where(
          and(
            eq(notebookSources.userId, user.id),
            eq(notebookSources.notebookId, params.id),
            inArray(notebookSources.sourceId, ids),
          ),
        );
      const attachedSet = new Set(already.map((r) => r.sourceId));
      const newIds = ids.filter((id) => !attachedSet.has(id));
      if (newIds.length === 0) return { ok: true, attached: 0 };

      // Cap on the resulting attached set (current + actually-new).
      const current = await countNotebookSources(user.id, params.id);
      if (current + newIds.length > env.ai.MAX_SOURCES_PER_NOTEBOOK) {
        return status(409, { error: 'notebook_full' });
      }

      try {
        const inserted = await db
          .insert(notebookSources)
          .values(newIds.map((sourceId) => ({ userId: user.id, notebookId: params.id, sourceId })))
          .onConflictDoNothing({
            target: [notebookSources.notebookId, notebookSources.sourceId],
          })
          .returning({ id: notebookSources.id });
        return { ok: true, attached: inserted.length };
      } catch (err) {
        // A source physically deleted between the ownership SELECT and this
        // INSERT trips the notebook_sources.source_id FK (23503) → clean 404.
        if (isFkViolation(err)) return status(404, { error: 'not_found' });
        throw err;
      }
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        sourceIds: t.Array(t.String({ format: 'uuid' }), { minItems: 1, maxItems: 100 }),
      }),
    },
  )
  // Detach one source from this notebook (NOT a delete — the source + its
  // chunks/vectors/markup are untouched in the library). 404 if the edge or the
  // notebook is foreign/missing.
  .delete(
    '/:id/sources/:sourceId',
    async ({ user, params, status }) => {
      const [nb] = await db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!nb) return status(404, { error: 'not_found' });

      const [row] = await db
        .delete(notebookSources)
        .where(
          and(
            eq(notebookSources.userId, user.id),
            eq(notebookSources.notebookId, params.id),
            eq(notebookSources.sourceId, params.sourceId),
          ),
        )
        .returning({ id: notebookSources.id });
      if (!row) return status(404, { error: 'not_found' });
      return { ok: true };
    },
    {
      auth: true,
      params: t.Object({
        id: t.String({ format: 'uuid' }),
        sourceId: t.String({ format: 'uuid' }),
      }),
    },
  );

// Source-level routes (finalize / get / rename / delete) live under their own
// `/sources` prefix — they're not nested under a notebook id.
export const sourcesModule = new Elysia({ prefix: '/sources' })
  .use(authPlugin)
  // Verify the uploaded object + dedup, then enqueue ingest (T3). SELECT the
  // pending row by (id, userId): a uuid the caller didn't claim → 404, so user B
  // can NEVER finalize user A's presigned uuid (mirrors media finalize).
  .post(
    '/:id/finalize',
    async ({ user, params, status }) => {
      const res = await finalizeUploadSource(user.id, params.id);
      if (!res.ok) {
        return status(res.status, {
          error: res.error,
          ...(res.existingSourceId ? { existingSourceId: res.existingSourceId } : {}),
        });
      }
      return res.source;
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // Status + computed progress + machine error code. 404 if foreign.
  .get(
    '/:id',
    async ({ user, params, status }) => {
      const [source] = await db
        .select()
        .from(sources)
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
        .limit(1);
      if (!source) return status(404, { error: 'not_found' });
      const indexed = await indexedCountFor(source.id);
      return withProgress(source, indexed);
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  .patch(
    '/:id',
    async ({ user, params, body, status }) => {
      const [row] = await db
        .update(sources)
        .set({ title: body.title, updatedAt: new Date() })
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
        .returning();
      if (!row) return status(404, { error: 'not_found' });
      return row;
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({ title: t.String({ minLength: 1, maxLength: 300 }) }),
    },
  )
  // SOFT-DELETE (delete-race safety, CRITIC-C2): set status='deleting' so the
  // worker's pre-batch re-check bails as a clean terminal, THEN explicitly delete
  // the document kb_chunk rows (NO FK cascade on kb_chunk.source_id — it's a plain
  // uuid, not an FK), THEN delete the sources row (source_chunks cascade via FK),
  // best-effort S3 delete. 404 if foreign.
  .delete(
    '/:id',
    async ({ user, params, status }) => {
      const ok = await deleteSourceCompletely(user.id, params.id);
      if (!ok) return status(404, { error: 'not_found' });
      return { ok: true };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // Reader pagination (M2 / AC2.8): a window of a source's parsed chunks (the
  // SoT `source_chunks`), ordered by position. `from` = start position (default
  // 0), `limit` (1..200, default SOURCE_CHUNKS_PAGE). user-scoped 404. Returns
  // `{ items:[{id,position,text,page,heading}], total, nextFrom }` — `nextFrom`
  // is the position to request next, or null at the end of the source.
  .get(
    '/:id/chunks',
    async ({ user, params, query, status }) => {
      const [source] = await db
        .select({ id: sources.id })
        .from(sources)
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
        .limit(1);
      if (!source) return status(404, { error: 'not_found' });

      const from = query.from ?? 0;
      const limit = Math.min(query.limit ?? env.ai.SOURCE_CHUNKS_PAGE, 200);

      const [{ total }] = await db
        .select({ total: count() })
        .from(sourceChunks)
        .where(and(eq(sourceChunks.sourceId, params.id), eq(sourceChunks.userId, user.id)));

      const rows = await db
        .select({
          id: sourceChunks.id,
          position: sourceChunks.position,
          text: sourceChunks.text,
          page: sourceChunks.page,
          heading: sourceChunks.heading,
        })
        .from(sourceChunks)
        .where(
          and(
            eq(sourceChunks.sourceId, params.id),
            eq(sourceChunks.userId, user.id),
            sql`${sourceChunks.position} >= ${from}`,
          ),
        )
        .orderBy(asc(sourceChunks.position))
        .limit(limit);

      // nextFrom = position after the last returned chunk, or null at the end.
      const last = rows[rows.length - 1];
      const nextFrom =
        rows.length === limit && last !== undefined && last.position + 1 < total
          ? last.position + 1
          : null;

      return { items: rows, total: Number(total), nextFrom };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      query: t.Object({
        from: t.Optional(t.Integer({ minimum: 0 })),
        limit: t.Optional(t.Integer({ minimum: 1, maximum: 200 })),
      }),
    },
  )
  // Backlinks (M3 / AC3.5): cards generated from this source. DISTINCT cards via
  // card_sources, joined to their deck for a name + a front excerpt. user-scoped
  // 404. Newest-first (latest link), limit 200. `{ items: [] }` when none.
  .get(
    '/:id/cards',
    async ({ user, params, status }) => {
      const [source] = await db
        .select({ id: sources.id })
        .from(sources)
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
        .limit(1);
      if (!source) return status(404, { error: 'not_found' });

      const rows = await db
        .select({
          cardId: cards.id,
          renderFrontText: cards.renderFrontText,
          renderText: cards.renderText,
          deckId: cards.deckId,
          deckName: decks.name,
          links: sql<number>`count(${cardSources.id})::int`,
          createdAt: sql<Date>`max(${cardSources.createdAt})`,
        })
        .from(cardSources)
        .innerJoin(cards, eq(cards.id, cardSources.cardId))
        .leftJoin(decks, eq(decks.id, cards.deckId))
        .where(and(eq(cardSources.userId, user.id), eq(cardSources.sourceId, params.id)))
        .groupBy(cards.id, cards.renderFrontText, cards.renderText, cards.deckId, decks.name)
        .orderBy(desc(sql`max(${cardSources.createdAt})`))
        .limit(200);

      const items = rows.map((r) => ({
        cardId: r.cardId,
        front: excerptFront(r.renderFrontText || r.renderText, 120),
        deckId: r.deckId,
        deckName: r.deckName ?? null,
        count: Number(r.links),
        createdAt: r.createdAt,
      }));
      return { items };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // ── PDF reader: original bytes + ink annotations (M4) ────────────────────────
  // Stream the ORIGINAL uploaded bytes (the pdf.js viewer fetches this). Only for
  // sources that carry a `storageKey` (pdf/epub) — url/text kinds have no bytes →
  // 404. A getObjectBytes failure (missing object / S3 hiccup) degrades to 404, not
  // a 500. Returns a raw `Response` (Elysia supports it) with content-type from the
  // row's mime, a content-length, and a private cache header.
  .get(
    '/:id/file',
    async ({ user, params, status }) => {
      const [source] = await db
        .select({ storageKey: sources.storageKey, mime: sources.mime })
        .from(sources)
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
        .limit(1);
      if (!source) return status(404, { error: 'not_found' });
      if (!source.storageKey) return status(404, { error: 'not_found' });

      let bytes: Uint8Array;
      try {
        bytes = await getObjectBytes(source.storageKey);
      } catch {
        // Object missing / storage error — degrade to 404, never a 500.
        return status(404, { error: 'not_found' });
      }
      // Hand the raw bytes back as a plain ArrayBuffer (a valid BodyInit — a
      // Uint8Array's `ArrayBufferLike` generic doesn't satisfy the lib's typing).
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      return new Response(buffer, {
        headers: {
          'content-type': source.mime ?? 'application/octet-stream',
          'content-length': String(bytes.byteLength),
          'cache-control': 'private, max-age=3600',
        },
      });
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // List a source's per-page ink annotations, ordered by page (1-based). The
  // client replays the strokes onto the matching pdf.js pages. user-scoped 404.
  .get(
    '/:id/annotations',
    async ({ user, params, status }) => {
      const [source] = await db
        .select({ id: sources.id })
        .from(sources)
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
        .limit(1);
      if (!source) return status(404, { error: 'not_found' });

      const rows = await db
        .select({
          page: sourceAnnotations.page,
          strokes: sourceAnnotations.strokes,
          markedText: sourceAnnotations.markedText,
          updatedAt: sourceAnnotations.updatedAt,
        })
        .from(sourceAnnotations)
        .where(and(eq(sourceAnnotations.sourceId, params.id), eq(sourceAnnotations.userId, user.id)))
        .orderBy(asc(sourceAnnotations.page));
      return { items: rows };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // Upsert (or clear) one page's ink annotations. The debounced client PUTs the
  // page's full stroke set + the `marked_text` extracted from under the strokes
  // (the AI-visible markup). Validation: structurally-bad strokes → 400
  // `invalid_annotation`; oversize JSON → 400 `annotation_too_large`. An EMPTY
  // strokes array DELETES the row (a cleared page) → `{ ok, cleared:true }`. Else
  // UPSERT via the plain (source_id,page) unique. `markedText` is re-capped
  // server-side to MARKED_TEXT_MAX. user-scoped 404. `page` is 1-based.
  .put(
    '/:id/annotations/:page',
    async ({ user, params, body, status }) => {
      const [source] = await db
        .select({ id: sources.id })
        .from(sources)
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
        .limit(1);
      if (!source) return status(404, { error: 'not_found' });

      if (!validateStrokes(body.strokes)) {
        return status(400, { error: 'invalid_annotation' });
      }
      // Byte cap on the stroke payload (JSON.stringify length).
      if (JSON.stringify(body.strokes).length > env.ai.SOURCE_ANNOTATION_MAX_BYTES) {
        return status(400, { error: 'annotation_too_large' });
      }
      const strokes = body.strokes as PageAnnotations;

      // An empty stroke set ⇒ the page was cleared: drop the row entirely.
      if (strokes.strokes.length === 0) {
        await db
          .delete(sourceAnnotations)
          .where(
            and(
              eq(sourceAnnotations.sourceId, params.id),
              eq(sourceAnnotations.userId, user.id),
              eq(sourceAnnotations.page, params.page),
            ),
          );
        return { ok: true, cleared: true };
      }

      const markedText =
        typeof body.markedText === 'string'
          ? body.markedText.slice(0, MARKED_TEXT_MAX)
          : null;

      // UPSERT on the PLAIN (source_id, page) unique — no `where` needed (unlike a
      // partial index). `updatedAt` bumps on every save.
      const [row] = await db
        .insert(sourceAnnotations)
        .values({
          userId: user.id,
          sourceId: params.id,
          page: params.page,
          strokes,
          markedText,
        })
        .onConflictDoUpdate({
          target: [sourceAnnotations.sourceId, sourceAnnotations.page],
          set: { strokes, markedText, updatedAt: new Date() },
        })
        .returning({
          page: sourceAnnotations.page,
          strokes: sourceAnnotations.strokes,
          markedText: sourceAnnotations.markedText,
          updatedAt: sourceAnnotations.updatedAt,
        });
      return { ok: true, cleared: false, item: row! };
    },
    {
      auth: true,
      params: t.Object({
        id: t.String({ format: 'uuid' }),
        // 1-based page (pdf.js convention); bounded to a sane ceiling.
        page: t.Integer({ minimum: 1, maximum: 10000 }),
      }),
      body: t.Object({
        // Structural validation runs in the handler (validateStrokes) — keep the
        // wire schema permissive so a bad shape returns our `invalid_annotation`
        // 400, not Elysia's generic validation error.
        strokes: t.Unknown(),
        markedText: t.Optional(t.String()),
      }),
    },
  )
  // ── reading-workflow text marks (M5): highlight / note CRUD ──────────────────
  // A `source_marks` row is a TEXT-selection highlight or place-anchored note
  // (distinct from the M4 ink `source_annotations`). All routes are user-scoped
  // (a foreign source / mark is a 404), validate geometry/kind/color in-handler
  // (→ 400 `invalid_mark`), and feed `list_marked_passages` + quick-card.

  // List a source's text marks, ordered (page ASC, created_at ASC). user-scoped 404.
  .get(
    '/:id/marks',
    async ({ user, params, status }) => {
      const [source] = await db
        .select({ id: sources.id })
        .from(sources)
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
        .limit(1);
      if (!source) return status(404, { error: 'not_found' });

      const items = await db
        .select()
        .from(sourceMarks)
        .where(and(eq(sourceMarks.sourceId, params.id), eq(sourceMarks.userId, user.id)))
        .orderBy(asc(sourceMarks.page), asc(sourceMarks.createdAt));
      return { items };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // Create a text mark. Body `{ page, kind, quote, rects, color?, note? }`.
  // kind 'note' allows an empty note body (''); kind 'highlight' stores null.
  // Per-source cap → 409 `too_many_marks`. user-scoped 404 on a foreign source.
  .post(
    '/:id/marks',
    async ({ user, params, body, status }) => {
      const [source] = await db
        .select({ id: sources.id })
        .from(sources)
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
        .limit(1);
      if (!source) return status(404, { error: 'not_found' });

      // Validation → 400 `invalid_mark`. Note kind 'card' is NOT in MARK_KINDS,
      // so a client trying to create a card-marker directly is rejected here
      // (card markers are OUTPUTS, written only by the quick-card route, S1).
      if (!MARK_KINDS.has(body.kind as SourceMarkKind)) return status(400, { error: 'invalid_mark' });
      const color = body.color ?? 'lime';
      if (!MARK_COLORS.has(color)) return status(400, { error: 'invalid_mark' });
      if (!validateMarkRects(body.rects)) return status(400, { error: 'invalid_mark' });
      const quote = body.quote.slice(0, MARK_QUOTE_MAX);
      if (quote.trim().length === 0) return status(400, { error: 'invalid_mark' });

      // Per-source cap (DoS guard).
      const [{ n }] = await db
        .select({ n: count() })
        .from(sourceMarks)
        .where(and(eq(sourceMarks.sourceId, params.id), eq(sourceMarks.userId, user.id)));
      if (n >= MARKS_PER_SOURCE_CAP) return status(409, { error: 'too_many_marks' });

      const note =
        body.kind === 'note' ? (body.note ?? '').slice(0, MARK_NOTE_MAX) : null;

      const [row] = await db
        .insert(sourceMarks)
        .values({
          userId: user.id,
          sourceId: params.id,
          page: body.page,
          kind: body.kind,
          quote,
          rects: body.rects as MarkRect[],
          color,
          note,
        })
        .returning();
      return row!;
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        // 1-based page (pdf.js convention); bounded to a sane ceiling.
        page: t.Integer({ minimum: 1, maximum: 10000 }),
        kind: t.String({ maxLength: 16 }),
        quote: t.String({ minLength: 1, maxLength: MARK_QUOTE_MAX + 1 }),
        // Geometry validated in-handler (validateMarkRects) — keep permissive so
        // a bad shape returns our `invalid_mark` 400, not Elysia's generic error.
        rects: t.Unknown(),
        color: t.Optional(t.String({ maxLength: 16 })),
        note: t.Optional(t.String({ maxLength: MARK_NOTE_MAX + 1 })),
      }),
    },
  )
  // Patch a mark's color and/or note (the popover editor). Nothing to change →
  // 400 `nothing_to_update`. user-scoped 404 on a foreign source/mark. A kind
  // 'card' marker is IMMUTABLE (it is an output, not a user emphasis) → any PATCH
  // on it is rejected 400 `invalid_mark` (DELETE is still allowed). S1 / M5.1.
  .patch(
    '/:id/marks/:markId',
    async ({ user, params, body, status }) => {
      const hasColor = body.color !== undefined;
      const hasNote = body.note !== undefined;
      if (!hasColor && !hasNote) return status(400, { error: 'nothing_to_update' });
      if (hasColor && !MARK_COLORS.has(body.color!)) return status(400, { error: 'invalid_mark' });

      // Reject edits to a 'card' marker (immutable); 404 a foreign/missing mark.
      const [existing] = await db
        .select({ kind: sourceMarks.kind })
        .from(sourceMarks)
        .where(
          and(
            eq(sourceMarks.id, params.markId),
            eq(sourceMarks.sourceId, params.id),
            eq(sourceMarks.userId, user.id),
          ),
        )
        .limit(1);
      if (!existing) return status(404, { error: 'not_found' });
      if (existing.kind === 'card') return status(400, { error: 'invalid_mark' });

      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (hasColor) set.color = body.color;
      if (hasNote) set.note = (body.note ?? '').slice(0, MARK_NOTE_MAX);

      const [row] = await db
        .update(sourceMarks)
        .set(set)
        .where(
          and(
            eq(sourceMarks.id, params.markId),
            eq(sourceMarks.sourceId, params.id),
            eq(sourceMarks.userId, user.id),
          ),
        )
        .returning();
      if (!row) return status(404, { error: 'not_found' });
      return row;
    },
    {
      auth: true,
      params: t.Object({
        id: t.String({ format: 'uuid' }),
        markId: t.String({ format: 'uuid' }),
      }),
      body: t.Object({
        color: t.Optional(t.String({ maxLength: 16 })),
        note: t.Optional(t.String({ maxLength: MARK_NOTE_MAX + 1 })),
      }),
    },
  )
  // Delete a mark. user-scoped 404 on a foreign source/mark.
  .delete(
    '/:id/marks/:markId',
    async ({ user, params, status }) => {
      const [row] = await db
        .delete(sourceMarks)
        .where(
          and(
            eq(sourceMarks.id, params.markId),
            eq(sourceMarks.sourceId, params.id),
            eq(sourceMarks.userId, user.id),
          ),
        )
        .returning({ id: sourceMarks.id });
      if (!row) return status(404, { error: 'not_found' });
      return { ok: true };
    },
    {
      auth: true,
      params: t.Object({
        id: t.String({ format: 'uuid' }),
        markId: t.String({ format: 'uuid' }),
      }),
    },
  )
  // ── quick card with reading provenance (M5) ──────────────────────────────────
  // Create ONE Basic flashcard from a reading selection + auto-link it to the
  // source passage(s) it came from — note+cards insert AND provenance edges in
  // ONE transaction. The note type resolves LIVE (reuse resolveNoteTypeForCreate);
  // chunks resolve user-scoped by (source_id, page) exact match (capped
  // CARD_SOURCE_LINK_CAP). With NO page or no page-matched chunk we still write
  // ONE edge carrying sourceId + notebookId (sourceChunkId NULL — manual reading
  // provenance, allowed by the schema). Returns `{ noteId, cardIds }`.
  .post(
    '/:id/quick-card',
    async ({ user, params, body, status }) => {
      const [source] = await db
        .select({ id: sources.id })
        .from(sources)
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
        .limit(1);
      if (!source) return status(404, { error: 'not_found' });

      // Resolve the builtin Basic note type LIVE (legacy-id-safe, M-hardening).
      const noteType = await resolveNoteTypeForCreate(user.id, null);
      if (!noteType.ok) return status(400, { error: 'note_type_not_found' });

      // Map front/back onto the Basic type's REAL field names case-insensitively.
      const byLower = new Map(noteType.fields.map((f) => [f.name.toLowerCase(), f.name]));
      const frontKey = byLower.get('front');
      const backKey = byLower.get('back');
      if (!frontKey || !backKey) return status(400, { error: 'note_type_not_found' });
      const fieldValues = { [frontKey]: body.front, [backKey]: body.back };

      // Authorize deck + sanitize + generate (the SAME path as POST /notes).
      const resolved = await resolveNoteCreate(user.id, {
        deckId: body.deckId,
        noteTypeId: noteType.id,
        fieldValues,
      });
      if (!resolved.ok) return status(400, { error: resolved.error });
      if (resolved.generated.length === 0) return status(400, { error: 'empty_card' });

      // Resolve the page-matched source chunks (user-scoped) for provenance — at
      // most CARD_SOURCE_LINK_CAP, in position order. Only when a page is given.
      const chunkRows =
        body.page !== undefined
          ? await db
              .select({ id: sourceChunks.id })
              .from(sourceChunks)
              .where(
                and(
                  eq(sourceChunks.userId, user.id),
                  eq(sourceChunks.sourceId, params.id),
                  eq(sourceChunks.page, body.page),
                ),
              )
              .orderBy(asc(sourceChunks.position))
              .limit(env.ai.CARD_SOURCE_LINK_CAP)
          : [];

      // A card MARKER (S1 / M5.1): when the client passes the selection `rects`
      // (and a page), drop a kind:'card' source_marks row anchored at the
      // selection so the reader can show WHERE this card was created. Validate
      // the geometry up front (→ 400 invalid_mark) so a bad payload never aborts
      // the in-tx insert; the marker quote is the card's Back excerpt (≤300),
      // falling back to the request quote. No rects/page ⇒ no marker (graceful).
      const wantMarker = body.rects !== undefined && body.page !== undefined;
      if (body.rects !== undefined && !validateMarkRects(body.rects)) {
        return status(400, { error: 'invalid_mark' });
      }
      const markerQuote = excerptFront(body.back || body.quote || body.front, 300);

      const now = new Date();
      const result = await db.transaction(async (tx) => {
        const created = await insertNoteAndCards(tx, {
          userId: user.id,
          deckId: body.deckId,
          noteTypeId: noteType.id,
          sanitized: resolved.sanitized,
          tags: [],
          generated: resolved.generated,
          now,
        });
        const cardIds = created.cards.map((c) => c.id);
        await writeQuickCardProvenance(tx, {
          userId: user.id,
          cardIds,
          chunkIds: chunkRows.map((c) => c.id),
          sourceId: params.id,
          // Quick-card provenance is born of READING, not of a notebook — a
          // library source may belong to zero notebooks (the main L2 path), so
          // the edge's notebookId is always NULL (card_sources permits it).
          notebookId: null,
        });
        // Insert the card marker AFTER the note/cards + provenance, in the SAME
        // tx, anchored to the FIRST card. The quote is non-empty (front is a
        // required non-empty body field, so the fallback chain never yields '').
        let markId: string | undefined;
        if (wantMarker && cardIds.length > 0) {
          const [markRow] = await tx
            .insert(sourceMarks)
            .values({
              userId: user.id,
              sourceId: params.id,
              page: body.page!,
              kind: 'card',
              quote: markerQuote,
              rects: body.rects as MarkRect[],
              color: 'lime',
              cardId: cardIds[0]!,
            })
            .returning({ id: sourceMarks.id });
          markId = markRow?.id;
        }
        return { noteId: created.note.id, cardIds, markId };
      });

      // RAG index enqueue AFTER commit (same discipline as the notes route/tools).
      enqueueToolCardsForIndex(result.cardIds);
      rootLogger.info(
        { sourceId: params.id, noteId: result.noteId, cards: result.cardIds.length },
        'source.quick_card',
      );
      return result;
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        deckId: t.String({ format: 'uuid' }),
        front: t.String({ minLength: 1, maxLength: 65536 }),
        back: t.String({ maxLength: 65536 }),
        page: t.Optional(t.Integer({ minimum: 1, maximum: 10000 })),
        quote: t.Optional(t.String({ maxLength: MARK_QUOTE_MAX + 1 })),
        // Selection rects → a kind:'card' marker anchored in the reader (S1).
        // Geometry validated in-handler; keep permissive so a bad shape returns
        // our `invalid_mark` 400, not Elysia's generic error. Marker is written
        // only when BOTH rects and page are present.
        rects: t.Optional(t.Unknown()),
      }),
    },
  )
  // ── AI formulate (M5): excerpt → {front, back} suggestion ─────────────────────
  // 503 `ai_disabled` PRE-FLUSH when chat is off; otherwise the cheap non-stream
  // complete() (timeout CHAT_TITLE_TIMEOUT_MS) with STRICT-JSON defensive parsing.
  // NEVER throws into Elysia: a parse/gateway failure → 502 `suggest_failed` so the
  // client keeps the user's manual Front/Back values. user-scoped 404 on the source.
  .post(
    '/:id/suggest-card',
    async ({ user, params, body, status, store }) => {
      if (!isChatEnabled()) return status(503, { error: 'ai_disabled' });

      const [source] = await db
        .select({ title: sources.title })
        .from(sources)
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
        .limit(1);
      if (!source) return status(404, { error: 'not_found' });

      const log = (store as { log?: typeof rootLogger }).log ?? rootLogger;
      // Cards are written in the USER'S language (S2 / M5.1), not the source's —
      // the body carries the active app locale; absent defaults to 'ru' (the
      // n=1 RU-primary app default).
      const suggestion = await suggestCard(body.quote, {
        sourceTitle: source.title,
        locale: body.locale ?? 'ru',
        log,
      });
      if (!suggestion) return status(502, { error: 'suggest_failed' });
      return suggestion;
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        quote: t.String({ minLength: 1, maxLength: MARK_QUOTE_MAX + 1 }),
        page: t.Optional(t.Integer({ minimum: 1, maximum: 10000 })),
        locale: t.Optional(t.Union([t.Literal('en'), t.Literal('ru')])),
      }),
    },
  );

/**
 * Write quick-card reading provenance inside the caller's tx. Mirrors
 * ai/provenance.ts `writeCardProvenance` but for the MANUAL reading path:
 *  - page-matched chunks (capped CARD_SOURCE_LINK_CAP) → one edge per
 *    (card × chunk) with the full chain (sourceChunkId, sourceId, notebookId),
 *    conversationId/messageId NULL.
 *  - NO page / no matching chunk → ONE fallback edge per card carrying only
 *    sourceId + notebookId (sourceChunkId NULL — allowed; the partial unique
 *    `card_sources_card_chunk_uq` only covers non-NULL chunk edges, so we
 *    CHECK-then-INSERT to avoid duplicating the fallback edge on a re-run).
 */
async function writeQuickCardProvenance(
  tx: Tx,
  args: {
    userId: string;
    cardIds: string[];
    chunkIds: string[];
    sourceId: string;
    notebookId: string | null;
  },
): Promise<void> {
  const { userId, cardIds, chunkIds, sourceId, notebookId } = args;
  if (cardIds.length === 0) return;

  if (chunkIds.length > 0) {
    const values = cardIds.flatMap((cardId) =>
      chunkIds.map((chunkId) => ({
        userId,
        cardId,
        sourceChunkId: chunkId,
        sourceId,
        notebookId,
        conversationId: null,
        messageId: null,
      })),
    );
    // Idempotent on the live-edge partial unique (cardId, sourceChunkId) WHERE
    // source_chunk_id IS NOT NULL — pass the predicate via `where` (the same
    // arbiter rule as ai/provenance.ts).
    await tx
      .insert(cardSources)
      .values(values)
      .onConflictDoNothing({
        target: [cardSources.cardId, cardSources.sourceChunkId],
        where: sql`source_chunk_id IS NOT NULL`,
      });
    return;
  }

  // Fallback (no page / no page-matched chunk): one source-only edge per card.
  // The partial unique does NOT cover NULL-chunk rows, so check-then-insert
  // (inside this tx) keeps a re-run from duplicating the fallback edge.
  for (const cardId of cardIds) {
    const [existing] = await tx
      .select({ id: cardSources.id })
      .from(cardSources)
      .where(
        and(
          eq(cardSources.userId, userId),
          eq(cardSources.cardId, cardId),
          eq(cardSources.sourceId, sourceId),
          isNull(cardSources.sourceChunkId),
        ),
      )
      .limit(1);
    if (existing) continue;
    await tx.insert(cardSources).values({
      userId,
      cardId,
      sourceChunkId: null,
      sourceId,
      notebookId,
      conversationId: null,
      messageId: null,
    });
  }
}

/** One-line front excerpt: collapse whitespace, cap to `max` chars. */
function excerptFront(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length === 0) return '';
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
