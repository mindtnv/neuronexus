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
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import {
  cardSources,
  cards,
  db,
  decks,
  kbChunk,
  notebooks,
  sourceChunks,
  sources,
  type Source,
} from '@neuronexus/db';
import {
  SOURCE_MIME_ALLOWLIST,
  SOURCE_MIME_TO_KIND,
  type SourceMime,
} from '@neuronexus/shared';
import { authPlugin } from '../auth-plugin.ts';
import { env } from '../env.ts';
import { rootLogger } from '../logger.ts';
import { deleteObject, getObjectBytes, headSize, presignUpload } from '../storage.ts';
import { enqueueSource, stashInlineText } from '../ai/source-ingest.ts';

/** S3 key for an uploaded source's bytes — `source/{uuid}` namespace (T3). */
function sourceKeyFor(sourceId: string): string {
  return `source/${sourceId}`;
}

const MAX_SOURCE_BYTES = env.ai.MAX_SOURCE_BYTES;
/** Inline text/url sources cap their content (re-capped server-side). */
const MAX_INLINE_TEXT = 200_000;
const ALLOWED_UPLOAD_MIME = new Set<string>(SOURCE_MIME_ALLOWLIST);

/** Map a Postgres unique-violation (23505) to a clean 409 (defense in depth). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

/** Computed ingest progress numerator: COUNT(source_chunks WHERE embedded=true). */
async function indexedCountFor(sourceId: string): Promise<number> {
  const [row] = await db
    .select({ indexed: count() })
    .from(sourceChunks)
    .where(and(eq(sourceChunks.sourceId, sourceId), eq(sourceChunks.embedded, true)));
  return row?.indexed ?? 0;
}

/** Shape one source row for the client: row + computed progress. */
function withProgress(source: Source, indexed: number): Record<string, unknown> {
  return {
    ...source,
    indexed,
    total: source.chunkCount ?? 0,
  };
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

      // Collect S3 keys before the DB cascade so we can best-effort delete later.
      const keys = await db
        .select({ storageKey: sources.storageKey })
        .from(sources)
        .where(and(eq(sources.notebookId, params.id), eq(sources.userId, user.id)));

      // kb_chunk has NO FK on parent_id or source_id — explicit cleanup required.
      // Document chunks for this notebook use parent_id = notebookId (see source-ingest.ts).
      await db
        .delete(kbChunk)
        .where(
          and(
            eq(kbChunk.userId, user.id),
            eq(kbChunk.sourceType, 'document'),
            eq(kbChunk.parentId, params.id),
          ),
        );

      // Now delete the notebook — FK cascade removes sources + source_chunks.
      await db
        .delete(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)));

      for (const { storageKey } of keys) {
        if (storageKey) await deleteObject(storageKey).catch(() => {});
      }
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
      const rows = await db
        .select()
        .from(sources)
        .where(and(eq(sources.notebookId, params.id), eq(sources.userId, user.id)))
        .orderBy(desc(sources.createdAt));
      // Computed progress per source: COUNT(embedded) over its chunks.
      const counts = await db
        .select({ sourceId: sourceChunks.sourceId, indexed: count() })
        .from(sourceChunks)
        .where(and(eq(sourceChunks.notebookId, params.id), eq(sourceChunks.embedded, true)))
        .groupBy(sourceChunks.sourceId);
      const indexedBySource = new Map(counts.map((c) => [c.sourceId, c.indexed]));
      return { items: rows.map((s) => withProgress(s, indexedBySource.get(s.id) ?? 0)) };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // Add a source. pdf/epub → claim a uuid (pending, verified=false) + presign a
  // POST policy; the client uploads then calls /sources/:id/finalize. url/text →
  // inline create (no upload) + immediate enqueue.
  .post(
    '/:id/sources',
    async ({ user, params, body, status }) => {
      const [nb] = await db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!nb) return status(404, { error: 'not_found' });

      const [{ n }] = await db
        .select({ n: count() })
        .from(sources)
        .where(and(eq(sources.notebookId, params.id), eq(sources.userId, user.id)));
      if (n >= env.ai.MAX_SOURCES_PER_NOTEBOOK) {
        return status(409, { error: 'too_many_sources' });
      }

      // ── upload kinds (pdf/epub): claim + presign ──────────────────────────────
      if (body.kind === 'upload') {
        if (!ALLOWED_UPLOAD_MIME.has(body.mime)) return status(400, { error: 'unsupported_mime' });
        if (body.size < 1 || body.size > MAX_SOURCE_BYTES) {
          return status(400, { error: 'too_large' });
        }
        const sourceMime = body.mime as SourceMime;
        const kind = SOURCE_MIME_TO_KIND[sourceMime];
        const sourceId = crypto.randomUUID();
        const key = sourceKeyFor(sourceId);
        try {
          await db.insert(sources).values({
            id: sourceId,
            userId: user.id,
            notebookId: params.id,
            kind,
            title: body.title,
            storageKey: key,
            mime: sourceMime,
            byteSize: body.size,
            status: 'pending',
            verified: false,
          });
        } catch (err) {
          if (isUniqueViolation(err)) return status(409, { error: 'source_conflict' });
          throw err;
        }
        const upload = await presignUpload(key, sourceMime, MAX_SOURCE_BYTES);
        rootLogger.debug({ sourceId, userId: user.id, kind }, 'source.presign');
        return { sourceId, upload };
      }

      // ── url ───────────────────────────────────────────────────────────────────
      if (body.kind === 'url') {
        const [row] = await db
          .insert(sources)
          .values({
            userId: user.id,
            notebookId: params.id,
            kind: 'url',
            title: body.title,
            url: body.url,
            status: 'pending',
            verified: true,
          })
          .returning();
        enqueueSource(row!.id);
        return row!;
      }

      // ── text ────────────────────────────────────────────────────────────────────
      const text = body.text.slice(0, MAX_INLINE_TEXT);
      const [row] = await db
        .insert(sources)
        .values({
          userId: user.id,
          notebookId: params.id,
          kind: 'text',
          title: body.title,
          byteSize: text.length,
          status: 'pending',
          verified: true,
        })
        .returning();
      // Carry the inline text to the worker (no schema column; recoverable from
      // SoT chunks on a later resume — see source-ingest.ts).
      stashInlineText(row!.id, text);
      enqueueSource(row!.id);
      return row!;
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
          text: t.String({ minLength: 1 }),
        }),
      ]),
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
      const [pending] = await db
        .select()
        .from(sources)
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
        .limit(1);
      if (!pending) return status(404, { error: 'not_found' });
      if (pending.kind !== 'pdf' && pending.kind !== 'epub') {
        return status(400, { error: 'not_an_upload' });
      }
      const key = pending.storageKey;
      if (!key) return status(400, { error: 'no_storage_key' });

      // Idempotency: an already-verified row is returned as-is.
      if (pending.verified) return pending;

      // Real size via HEAD. No object at the key → keep the pending row so a
      // retry after the real upload still works.
      let size: number | undefined;
      try {
        size = await headSize(key);
      } catch {
        return status(400, { error: 'not_uploaded' });
      }
      if (size === undefined) return status(400, { error: 'head_failed' });
      // > ceiling (or empty) → delete the object + the pending row + 400.
      if (size < 1 || size > MAX_SOURCE_BYTES) {
        await deleteObject(key);
        await db.delete(sources).where(and(eq(sources.id, params.id), eq(sources.userId, user.id)));
        return status(400, { error: 'too_large' });
      }

      // Read the bytes once to compute the dedup hash.
      const bytes = await getObjectBytes(key);
      const byteHash = createHash('sha256').update(bytes).digest('hex');

      // DEDUP: a READY source in the SAME (user, notebook) with the same hash is
      // a duplicate → delete the just-uploaded object + the pending row + 409.
      const [dup] = await db
        .select({ id: sources.id })
        .from(sources)
        .where(
          and(
            eq(sources.userId, user.id),
            eq(sources.notebookId, pending.notebookId),
            eq(sources.byteHash, byteHash),
            eq(sources.status, 'ready'),
          ),
        )
        .limit(1);
      if (dup) {
        await deleteObject(key).catch(() => {});
        await db.delete(sources).where(and(eq(sources.id, params.id), eq(sources.userId, user.id)));
        return status(409, { error: 'duplicate_source' });
      }

      const [row] = await db
        .update(sources)
        .set({ verified: true, byteSize: size, byteHash, updatedAt: new Date() })
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
        .returning();
      rootLogger.info({ sourceId: params.id, userId: user.id, size }, 'source.finalize');
      enqueueSource(params.id);
      return row!;
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
      const [source] = await db
        .select({ id: sources.id, storageKey: sources.storageKey })
        .from(sources)
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)))
        .limit(1);
      if (!source) return status(404, { error: 'not_found' });

      await db
        .update(sources)
        .set({ status: 'deleting', updatedAt: new Date() })
        .where(and(eq(sources.id, params.id), eq(sources.userId, user.id)));

      // kb_chunk has NO FK on source_id (it's a plain uuid) → explicit cleanup,
      // user-scoped + document-only so a card chunk is never touched.
      await db
        .delete(kbChunk)
        .where(
          and(
            eq(kbChunk.userId, user.id),
            eq(kbChunk.sourceType, 'document'),
            eq(kbChunk.sourceId, params.id),
          ),
        );

      await db.delete(sources).where(and(eq(sources.id, params.id), eq(sources.userId, user.id)));
      if (source.storageKey) await deleteObject(source.storageKey).catch(() => {});
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
  );

/** One-line front excerpt: collapse whitespace, cap to `max` chars. */
function excerptFront(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length === 0) return '';
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
