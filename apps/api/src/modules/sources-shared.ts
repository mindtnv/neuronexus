// Shared source/library helpers (L1). The library refactor split a source from
// any single notebook (sources are user-level; notebooks attach via the
// `notebook_sources` join). Both the legacy notebook source routes
// (`notebooks.ts`) and the new `/library` module (`library.ts`) need the SAME
// create/presign/finalize/delete/attach logic — it lives here so neither side
// copy-pastes ~200 lines. Every query is `user.id`-FIRST-conjunct scoped.

import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import {
  db,
  kbChunk,
  notebookSources,
  sourceChunks,
  sources,
  type Db,
  type Source,
} from '@neuronexus/db';
import {
  newUuidV7,
  SOURCE_MIME_TO_KIND,
  type SourceMime,
} from '@neuronexus/shared';
import { env } from '../env.ts';
import { rootLogger } from '../logger.ts';
import { deleteObject, getObjectBytes, headSize, presignUpload } from '../storage.ts';
import { enqueueSource, stashInlineText } from '../ai/source-ingest.ts';
import { embeddingDegraded } from '../ai/index-queue.ts';
import { isEmbeddingEnabled } from '../ai/openai-client.ts';

/** A Drizzle transaction handle (the arg passed to `db.transaction`). */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export const MAX_SOURCE_BYTES = env.ai.MAX_SOURCE_BYTES;
/** Inline text/url sources cap their content (re-capped server-side). */
export const MAX_INLINE_TEXT = 200_000;

/** S3 key for an uploaded source's bytes — `source/{uuid}` namespace (T3). */
export function sourceKeyFor(sourceId: string): string {
  return `source/${sourceId}`;
}

/** Map a Postgres unique-violation (23505) to a clean 409 (defense in depth). */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

/**
 * Map a Postgres foreign-key-violation (23503) — e.g. a source physically
 * deleted between an ownership SELECT and a join INSERT — to a clean 404
 * (defense in depth against a TOCTOU between the ownership check and the write).
 */
export function isFkViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23503';
}

// ── caps ───────────────────────────────────────────────────────────────────

/**
 * Count a user's library items (sources NOT in the `deleting` terminal). The
 * global upload DoS bound — per-notebook caps no longer cover the whole library
 * now that sources are user-level.
 */
export async function countLibraryItems(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(sources)
    .where(and(eq(sources.userId, userId), sql`${sources.status} <> 'deleting'`));
  return row?.n ?? 0;
}

/** Count the sources attached to a notebook (the per-notebook cap target). */
export async function countNotebookSources(userId: string, notebookId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notebookSources)
    .where(and(eq(notebookSources.userId, userId), eq(notebookSources.notebookId, notebookId)));
  return row?.n ?? 0;
}

// ── attach ───────────────────────────────────────────────────────────────────

/**
 * Idempotently attach one source to one notebook (the plain unique
 * `notebook_sources_nb_src_uq` arbiter — no `where`). Runs in the caller's tx
 * when given (so a create+attach is atomic), else a one-off db call.
 */
export async function attachSourceToNotebook(
  ex: Tx | typeof db,
  args: { userId: string; notebookId: string; sourceId: string },
): Promise<void> {
  await ex
    .insert(notebookSources)
    .values({
      userId: args.userId,
      notebookId: args.notebookId,
      sourceId: args.sourceId,
    })
    .onConflictDoNothing({
      target: [notebookSources.notebookId, notebookSources.sourceId],
    });
}

// ── inline create (url / text) ───────────────────────────────────────────────

export type InlineSourceInput =
  | { kind: 'url'; title: string; url: string }
  | { kind: 'text'; title: string; text: string };

/**
 * Create an inline (url/text) library source + optionally attach it to a
 * notebook in ONE transaction, then enqueue ingest after commit. Returns the
 * created source row.
 */
export async function createInlineSource(
  userId: string,
  input: InlineSourceInput,
  notebookId?: string,
): Promise<Source> {
  const row = await db.transaction(async (tx) => {
    let created: Source;
    if (input.kind === 'url') {
      const [r] = await tx
        .insert(sources)
        .values({
          userId,
          kind: 'url',
          title: input.title,
          url: input.url,
          status: 'pending',
          verified: true,
        })
        .returning();
      created = r!;
    } else {
      const text = input.text.slice(0, MAX_INLINE_TEXT);
      const [r] = await tx
        .insert(sources)
        .values({
          userId,
          kind: 'text',
          title: input.title,
          byteSize: text.length,
          status: 'pending',
          verified: true,
        })
        .returning();
      created = r!;
      // Carry the inline text to the worker (no schema column; recoverable from
      // SoT chunks on a later resume — see source-ingest.ts).
      stashInlineText(created.id, text);
    }
    if (notebookId) {
      await attachSourceToNotebook(tx, { userId, notebookId, sourceId: created.id });
    }
    return created;
  });
  enqueueSource(row.id);
  return row;
}

// ── upload presign (pdf / epub) ───────────────────────────────────────────────

export type PresignResult =
  | { ok: true; sourceId: string; upload: Awaited<ReturnType<typeof presignUpload>> }
  | { ok: false; error: 'unsupported_mime' | 'too_large' | 'source_conflict' };

/**
 * Claim a uuid (pending, verified=false) for an upload + presign a POST policy.
 * The source is created WITHOUT a notebook (library item); the caller persists
 * the optional notebook attach at finalize time (the upload may never complete).
 */
export async function presignUploadSource(
  userId: string,
  body: { mime: string; size: number; title: string },
): Promise<PresignResult> {
  if (!(body.mime in SOURCE_MIME_TO_KIND)) return { ok: false, error: 'unsupported_mime' };
  if (body.size < 1 || body.size > MAX_SOURCE_BYTES) return { ok: false, error: 'too_large' };
  const sourceMime = body.mime as SourceMime;
  const kind = SOURCE_MIME_TO_KIND[sourceMime];
  const sourceId = newUuidV7();
  const key = sourceKeyFor(sourceId);
  try {
    await db.insert(sources).values({
      id: sourceId,
      userId,
      kind,
      title: body.title,
      storageKey: key,
      mime: sourceMime,
      byteSize: body.size,
      status: 'pending',
      verified: false,
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: 'source_conflict' };
    throw err;
  }
  const upload = await presignUpload(key, sourceMime, MAX_SOURCE_BYTES);
  rootLogger.debug({ sourceId, userId, kind }, 'source.presign');
  return { ok: true, sourceId, upload };
}

// ── finalize ─────────────────────────────────────────────────────────────────

export type FinalizeResult =
  | { ok: true; source: Source }
  | { ok: false; status: 400 | 404 | 409; error: string; existingSourceId?: string };

/**
 * Verify an uploaded object (HEAD size) + per-USER byte dedup, attach to an
 * optional notebook, then enqueue ingest. The dedup SELECT is per-user (the
 * whole library), excludes `error`/`deleting` (so a dupe uploaded while the
 * first is still indexing is caught too), and returns the existing source id so
 * the UI can offer "attach the existing one instead". SELECT the pending row by
 * (id, userId): user B can NEVER finalize user A's presigned uuid.
 */
export async function finalizeUploadSource(
  userId: string,
  sourceId: string,
  notebookId?: string,
): Promise<FinalizeResult> {
  const [pending] = await db
    .select()
    .from(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.userId, userId)))
    .limit(1);
  if (!pending) return { ok: false, status: 404, error: 'not_found' };
  if (pending.kind !== 'pdf' && pending.kind !== 'epub') {
    return { ok: false, status: 400, error: 'not_an_upload' };
  }
  const key = pending.storageKey;
  if (!key) return { ok: false, status: 400, error: 'no_storage_key' };

  // Idempotency: an already-verified row is returned as-is (+ attach if asked).
  if (pending.verified) {
    if (notebookId) await attachSourceToNotebook(db, { userId, notebookId, sourceId });
    return { ok: true, source: pending };
  }

  // Real size via HEAD. No object at the key → keep the pending row so a retry
  // after the real upload still works.
  let size: number | undefined;
  try {
    size = await headSize(key);
  } catch {
    return { ok: false, status: 400, error: 'not_uploaded' };
  }
  if (size === undefined) return { ok: false, status: 400, error: 'head_failed' };
  // > ceiling (or empty) → delete the object + the pending row + 400.
  if (size < 1 || size > MAX_SOURCE_BYTES) {
    await deleteObject(key).catch(() => {});
    await db.delete(sources).where(and(eq(sources.id, sourceId), eq(sources.userId, userId)));
    return { ok: false, status: 400, error: 'too_large' };
  }

  // Read the bytes once to compute the dedup hash.
  const bytes = await getObjectBytes(key);
  const byteHash = createHash('sha256').update(bytes).digest('hex');

  // DEDUP (Р5): a per-USER source with the same hash and a non-terminal/ready
  // status (NOT error/deleting) is a duplicate → delete the just-uploaded
  // object + the pending row + 409 carrying the existing id.
  const [dup] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(
      and(
        eq(sources.userId, userId),
        eq(sources.byteHash, byteHash),
        sql`${sources.status} NOT IN ('error', 'deleting')`,
      ),
    )
    .limit(1);
  if (dup) {
    await deleteObject(key).catch(() => {});
    await db.delete(sources).where(and(eq(sources.id, sourceId), eq(sources.userId, userId)));
    return { ok: false, status: 409, error: 'duplicate_source', existingSourceId: dup.id };
  }

  const source = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(sources)
      .set({ verified: true, byteSize: size, byteHash, updatedAt: new Date() })
      .where(and(eq(sources.id, sourceId), eq(sources.userId, userId)))
      .returning();
    if (notebookId) await attachSourceToNotebook(tx, { userId, notebookId, sourceId });
    return row!;
  });
  rootLogger.info({ sourceId, userId, size }, 'source.finalize');
  enqueueSource(sourceId);
  return { ok: true, source };
}

// ── delete ─────────────────────────────────────────────────────────────────

/**
 * Completely delete a source from the library (the single source-delete flow,
 * shared by DELETE /sources/:id and DELETE /library/items/:id): soft-flag
 * `deleting` (so the ingest worker's pre-batch re-check bails cleanly), explicit
 * document kb_chunk cleanup by source_id (no FK on kb_chunk.source_id), delete
 * the row (source_chunks + notebook_sources edges + marks/annotations cascade;
 * card_sources SET NULL → tombstones), best-effort S3 delete. Returns false when
 * the source is foreign/missing (caller maps to 404).
 */
export async function deleteSourceCompletely(userId: string, sourceId: string): Promise<boolean> {
  const [source] = await db
    .select({ id: sources.id, storageKey: sources.storageKey })
    .from(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.userId, userId)))
    .limit(1);
  if (!source) return false;

  await db
    .update(sources)
    .set({ status: 'deleting', updatedAt: new Date() })
    .where(and(eq(sources.id, sourceId), eq(sources.userId, userId)));

  // kb_chunk has NO FK on source_id (plain uuid) → explicit cleanup, user-scoped
  // + document-only so a card chunk is never touched.
  await db
    .delete(kbChunk)
    .where(
      and(
        eq(kbChunk.userId, userId),
        eq(kbChunk.sourceType, 'document'),
        eq(kbChunk.sourceId, sourceId),
      ),
    );

  await db.delete(sources).where(and(eq(sources.id, sourceId), eq(sources.userId, userId)));
  if (source.storageKey) await deleteObject(source.storageKey).catch(() => {});
  return true;
}

// ── reingest ─────────────────────────────────────────────────────────────────

export type ReingestResult =
  | { ok: true; parked: boolean }
  | { ok: false; status: 400 | 404 | 409; error: string };

/**
 * Re-run the ingest pipeline for an already-ingested source through the existing
 * CAS state machine (L4 §4.1). Only valid on a TERMINAL status (`ready`/`error`)
 * — a non-terminal source (pending/parsing/indexing) is mid-flight → 409
 * `not_terminal`. `text` sources have NO external carrier (the raw text only
 * survives in source_chunks, which we wipe) so a re-parse is meaningless → 400
 * `not_reingestable`. One tx: wipe `source_chunks` + the document `kb_chunk`
 * rows (by source_id — no FK) + CAS `ready|error → pending` resetting the
 * progress metadata. The CAS `status IN ('ready','error')` guard means a
 * concurrent reingest (or a source that raced into `pending`) updates 0 rows →
 * 409. After commit the standard worker is kicked. Grounding-safety is
 * by-construction: the chat scope intersects `status='ready'`, so the source
 * drops out of every notebook's chat while it re-ingests. The success result
 * carries `parked` — true when embeddings are off/dim-degraded, so the source
 * re-parses but defers (re)embedding (mirrors the worker's park decision).
 */
export async function reingestSource(userId: string, sourceId: string): Promise<ReingestResult> {
  const [source] = await db
    .select({ id: sources.id, kind: sources.kind, status: sources.status })
    .from(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.userId, userId)))
    .limit(1);
  if (!source) return { ok: false, status: 404, error: 'not_found' };
  if (source.kind === 'text') return { ok: false, status: 400, error: 'not_reingestable' };
  if (source.status !== 'ready' && source.status !== 'error') {
    return { ok: false, status: 409, error: 'not_terminal' };
  }

  const reset = await db.transaction(async (tx) => {
    // CAS first — a concurrent reingest / a source already racing back to
    // pending loses here (0 rows) and the whole tx is a no-op.
    const moved = await tx
      .update(sources)
      .set({
        status: 'pending',
        errorCode: null,
        charCount: null,
        chunkCount: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sources.id, sourceId),
          eq(sources.userId, userId),
          inArray(sources.status, ['ready', 'error']),
        ),
      )
      .returning({ id: sources.id });
    if (moved.length === 0) return false;

    // Wipe the SoT chunks (the parse phase rewrites them) + the document
    // kb_chunk vectors (no FK on kb_chunk.source_id → explicit cleanup).
    await tx.delete(sourceChunks).where(eq(sourceChunks.sourceId, sourceId));
    await tx
      .delete(kbChunk)
      .where(
        and(
          eq(kbChunk.userId, userId),
          eq(kbChunk.sourceType, 'document'),
          eq(kbChunk.sourceId, sourceId),
        ),
      );
    return true;
  });

  if (!reset) return { ok: false, status: 409, error: 'not_terminal' };
  enqueueSource(sourceId);
  // `parked` mirrors the worker's parse-and-park decision (source-ingest.ts:
  // `!isEmbeddingEnabled() || embeddingDegraded()`): the source will re-parse +
  // re-write its SoT chunks but skip (re)embedding until embeddings come back —
  // so the UI can surface the existing setup-notice. The worker's behavior is
  // unchanged; this only reports it.
  const parked = !isEmbeddingEnabled() || embeddingDegraded();
  return { ok: true, parked };
}
