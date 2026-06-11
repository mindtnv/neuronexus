// Async source-ingest worker (NotebookLM M1, T6). The `sources` ROW IS THE JOB:
// `status` drives the pipeline and survives a restart (resume reclaims any
// non-terminal row). Runs with NO auth session — `user_id` is pulled from the
// row and stamped on every write (Principle P3). The card `index-queue.ts` is
// untouched; this is a parallel, status-keyed runner.
//
// Pipeline (all transitions are CAS — `UPDATE … WHERE id=$id AND status=$expected`
// — so a lost race updates 0 rows and the worker simply skips):
//   pending → parsing  : fetch bytes (S3 for pdf/epub, inline text, url) →
//                        parseSource → ONE tx writes all source_chunks (SoT) +
//                        chunk_count/char_count.
//   parsing → indexing : (guarded by chunk_count ≤ MAX_SOURCE_CHUNKS).
//   indexing → ready   : batch-embed (EMBED_BATCH); per batch ONE tx upserts the
//                        kb_chunk document rows (text = denormalized copy of the
//                        SoT) AND flips the matching source_chunks.embedded=true,
//                        so progress = COUNT(embedded=true) is crash-safe.
//
// Progress is COMPUTED, never stored: resume embeds only `embedded=false` rows.
// A vanished / `deleting` source mid-ingest is a CLEAN terminal (not a crash) —
// the DELETE route owns the kb_chunk cleanup. notebooksEnabled off (no embed
// key) → parse-and-park: SoT is written, embedding is skipped, status stays at
// `indexing`; a later restart-resume finishes it once a key is present.

import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  db,
  kbChunk,
  sourceChunks,
  sources,
  type Source,
} from '@neuronexus/db';
import { chunkSource, type SourceUnit } from '@neuronexus/shared';
import { env, notebooksEnabled } from '../env.ts';
import { rootLogger } from '../logger.ts';
import { computeSourceHash, EMBED_BATCH, embeddingDegraded } from './index-queue.ts';
import { embed, isEmbeddingEnabled } from './openai-client.ts';
import { getObjectBytes } from '../storage.ts';
import { parseSource, SourceParseError } from './source-parsers.ts';

// ── In-process claim loop (concurrency-capped) ────────────────────────────────

const CONCURRENCY = Math.max(1, env.ai.SOURCE_INGEST_CONCURRENCY);
const queued = new Set<string>(); // source ids awaiting a worker slot
let active = 0;
let idleResolvers: Array<() => void> = [];

/** Resolve any drain waiters once the loop is fully idle. */
function settleIfIdle(): void {
  if (active === 0 && queued.size === 0) {
    const resolvers = idleResolvers;
    idleResolvers = [];
    for (const r of resolvers) r();
  }
}

/**
 * Fire-and-forget enqueue after a create/finalize commit. Sync + non-blocking.
 * Idempotent (a re-enqueue of an in-flight id is dropped — the row's CAS guard
 * is the real safety net). Kicks the bounded claim loop.
 */
export function enqueueSource(sourceId: string): void {
  if (queued.has(sourceId)) return;
  queued.add(sourceId);
  kick();
}

function kick(): void {
  while (active < CONCURRENCY && queued.size > 0) {
    const next = queued.values().next().value as string | undefined;
    if (next === undefined) break;
    queued.delete(next);
    active += 1;
    void ingestSource(next).finally(() => {
      active -= 1;
      if (queued.size > 0) kick();
      settleIfIdle();
    });
  }
}

/**
 * Drain in-flight + queued ingest, up to `timeoutMs` (graceful shutdown). A
 * timeout is NOT fatal — the next startup resume picks up the remainder.
 */
export async function drainSourceIngest({ timeoutMs }: { timeoutMs: number }): Promise<void> {
  if (active === 0 && queued.size === 0) return;
  const drain = new Promise<void>((resolve) => idleResolvers.push(resolve));
  kick();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      rootLogger.warn(
        { active, queued: queued.size },
        'ai.source_ingest.drain_timeout',
      );
      resolve();
    }, timeoutMs);
  });
  await Promise.race([drain, timeout]);
  if (timer) clearTimeout(timer);
}

// ── Single-source pipeline (never throws into the loop) ───────────────────────

/**
 * Run the full pipeline for one source. Per-source try/catch — a parse throw or
 * an over-limit source resolves to a CAS `error` (with a machine code), never a
 * crash that takes down the loop. Exported so tests can drive it synchronously.
 */
export async function ingestSource(sourceId: string): Promise<void> {
  try {
    const claimed = await claimForParse(sourceId);
    if (!claimed) {
      // Not claimable as `pending` — maybe already `indexing` (resume) or gone.
      await resumeIndexing(sourceId);
      return;
    }
    await parsePhase(claimed);
    await indexPhase(sourceId);
  } catch (err) {
    if (err instanceof TerminalSkip) return; // vanished / deleting — clean exit
    const code =
      err instanceof SourceParseError ? err.code : ('parse_failed' as const);
    rootLogger.error({ err, sourceId, code }, 'ai.source_ingest.failed');
    await casStatus(sourceId, ['pending', 'parsing', 'indexing'], 'error', { errorCode: code });
  }
}

/** Thrown internally when a source vanished / went `deleting` — a clean terminal. */
class TerminalSkip extends Error {}

/** CAS `pending → parsing`. Returns the claimed row, or null if not claimable. */
async function claimForParse(sourceId: string): Promise<Source | null> {
  const [row] = await db
    .update(sources)
    .set({ status: 'parsing', errorCode: null, updatedAt: new Date() })
    .where(and(eq(sources.id, sourceId), eq(sources.status, 'pending')))
    .returning();
  return row ?? null;
}

// ── Parse phase: bytes → parseSource → source_chunks (SoT) in ONE tx ───────────

async function parsePhase(source: Source): Promise<void> {
  try {
    const bytes = await loadBytes(source);
    const { units } = await parseSource({
      kind: source.kind as 'pdf' | 'epub' | 'url' | 'text',
      bytes,
      url: source.url ?? undefined,
      text: source.kind === 'text' ? await inlineTextFor(source.id) : undefined,
    });

    const chunks = chunkSource({
      sourceType: 'document',
      sourceId: source.id,
      parentId: source.notebookId,
      text: '',
      units,
      chunkOptions: {
        tokensPerChunk: env.ai.SOURCE_CHUNK_TOKENS,
        overlap: env.ai.SOURCE_CHUNK_OVERLAP,
      },
    });

    // Over-limit short-circuit (CRITIC-C1) — never embed a runaway source.
    if (chunks.length > env.ai.MAX_SOURCE_CHUNKS) {
      await casStatus(source.id, ['parsing'], 'error', { errorCode: 'too_many_chunks' });
      throw new TerminalSkip();
    }

    const charCount = units.reduce((n, u) => n + u.text.length, 0);
    const model = env.ai.EMBEDDING_MODEL;

    // ONE tx: rewrite the SoT chunks (idempotent — wipe + reinsert so a re-parse
    // never leaves stale rows) + set the progress denominator.
    await db.transaction(async (tx) => {
      await tx.delete(sourceChunks).where(eq(sourceChunks.sourceId, source.id));
      if (chunks.length > 0) {
        await tx.insert(sourceChunks).values(
          chunks.map((c) => ({
            userId: source.userId,
            sourceId: source.id,
            notebookId: source.notebookId,
            position: c.position,
            text: c.text,
            page: c.page ?? null,
            heading: c.heading ?? null,
            tokenCount: c.tokenCount ?? null,
            embedded: false,
            sourceHash: computeSourceHash(c.text, model),
          })),
        );
      }
      await tx
        .update(sources)
        .set({ chunkCount: chunks.length, charCount, updatedAt: new Date() })
        .where(eq(sources.id, source.id));
    });

    // CAS parsing → indexing (a concurrent delete loses this race → 0 rows → skip).
    const moved = await casStatus(source.id, ['parsing'], 'indexing');
    if (!moved) throw new TerminalSkip();
  } finally {
    // Always evict — SoT recovery from source_chunks makes correctness
    // independent of the stash (stash is only a fast-path for same-process runs).
    inlineTextStore.delete(source.id);
  }
}

/**
 * Inline-text carrier. `kind:'text'` sources have no S3 bytes and no dedicated
 * schema column for their raw text, so the create route stashes the (already
 * capped) text here keyed by source id; the parse phase reads it back. A restart
 * loses the map — but `resumeSourceIngestOnStartup` rebuilds it from the
 * already-written SoT `source_chunks` (joined back to one blob) before
 * re-enqueuing, so a torn `text` ingest re-parses from the recovered text rather
 * than failing `empty_source`.
 */
const inlineTextStore = new Map<string, string>();

export function stashInlineText(sourceId: string, text: string): void {
  inlineTextStore.set(sourceId, text);
}

/** Resolve inline text: in-memory stash first, else recover from the SoT chunks. */
async function inlineTextFor(sourceId: string): Promise<string> {
  const stashed = inlineTextStore.get(sourceId);
  if (stashed !== undefined) return stashed;
  const rows = await db
    .select({ text: sourceChunks.text })
    .from(sourceChunks)
    .where(eq(sourceChunks.sourceId, sourceId))
    .orderBy(sourceChunks.position);
  return rows.map((r) => r.text).join('\n\n');
}

async function loadBytes(source: Source): Promise<Uint8Array | undefined> {
  if (source.kind === 'pdf' || source.kind === 'epub') {
    if (!source.storageKey) throw new SourceParseError('parse_failed', 'no storage key');
    return getObjectBytes(source.storageKey);
  }
  return undefined; // url/text carry no S3 bytes
}

// ── Index phase: batch embed → kb_chunk doc rows + flip embedded ──────────────

/**
 * Embed every not-yet-embedded source_chunk in EMBED_BATCH-sized batches. Each
 * batch is ONE tx: upsert the kb_chunk document rows (conflict target
 * `(source_id, position) WHERE source_type='document'`) AND flip the matching
 * source_chunks.embedded=true. Then CAS indexing → ready. notebooksEnabled off
 * → parse-and-park (skip embedding, leave at `indexing`).
 */
async function indexPhase(sourceId: string): Promise<void> {
  // Degrade: no embedder configured OR dim-assertion failed → park at 'indexing'.
  // Mirrors canIndex() in index-queue.ts (isEmbeddingEnabled && !embeddingDegraded).
  if (!isEmbeddingEnabled() || embeddingDegraded()) {
    rootLogger.info(
      { sourceId, notebooksEnabled },
      'ai.source_ingest.parked — embedding disabled or dim degraded, SoT written',
    );
    return; // status stays at 'indexing'; resume finishes it later
  }

  const model = env.ai.EMBEDDING_MODEL;

  for (;;) {
    // Re-check the source still exists and is not `deleting` BEFORE each batch
    // (delete-race: a vanished/deleting source is a clean terminal, not a crash).
    const [source] = await db
      .select({ id: sources.id, status: sources.status, userId: sources.userId, notebookId: sources.notebookId })
      .from(sources)
      .where(eq(sources.id, sourceId))
      .limit(1);
    if (!source || source.status === 'deleting') throw new TerminalSkip();

    // Pull the next batch of unembedded chunks (resume-safe: only embedded=false).
    const batch = await db
      .select({
        id: sourceChunks.id,
        position: sourceChunks.position,
        text: sourceChunks.text,
        sourceHash: sourceChunks.sourceHash,
      })
      .from(sourceChunks)
      .where(and(eq(sourceChunks.sourceId, sourceId), eq(sourceChunks.embedded, false)))
      .orderBy(sourceChunks.position)
      .limit(EMBED_BATCH);
    if (batch.length === 0) break;

    const vectors = await embed(batch.map((c) => c.text));

    let deletedDuringEmbed = false;
    await db.transaction(async (tx) => {
      // Re-validate the source still exists and is not being deleted.
      // Serializes against the DELETE route's status flip.
      const [live] = await tx
        .select({ id: sources.id })
        .from(sources)
        .where(and(eq(sources.id, sourceId), sql`status != 'deleting'`))
        .limit(1);
      if (!live) {
        // Source vanished or went 'deleting' during the embed() call — clean terminal.
        deletedDuringEmbed = true;
        return;
      }
      const embeddedIds: string[] = [];
      for (let i = 0; i < batch.length; i++) {
        const c = batch[i]!;
        const vector = vectors[i];
        if (!vector) continue;
        await tx
          .insert(kbChunk)
          .values({
            userId: source.userId,
            sourceType: 'document',
            sourceId: source.id,
            parentId: source.notebookId,
            position: c.position,
            text: c.text,
            embedding: vector,
            embeddingModel: model,
            sourceHash: c.sourceHash ?? computeSourceHash(c.text, model),
            cardId: null,
          })
          .onConflictDoUpdate({
            target: [kbChunk.sourceId, kbChunk.position],
            targetWhere: sql`source_type = 'document'`,
            set: {
              text: c.text,
              embedding: vector,
              embeddingModel: model,
              sourceHash: c.sourceHash ?? computeSourceHash(c.text, model),
              userId: source.userId,
              parentId: source.notebookId,
              updatedAt: new Date(),
            },
          });
        embeddedIds.push(c.id);
      }
      if (embeddedIds.length > 0) {
        await tx
          .update(sourceChunks)
          .set({ embedded: true })
          .where(inArray(sourceChunks.id, embeddedIds));
      }
    });
    if (deletedDuringEmbed) throw new TerminalSkip();

    rootLogger.info({ sourceId, batch: batch.length, model }, 'ai.source_ingest.embed');
  }

  // All chunks embedded → CAS indexing → ready (a delete-race loses → skip).
  await casStatus(sourceId, ['indexing'], 'ready');
}

/**
 * Resume an already-`indexing` (or stuck-`parsing`) source. Parse already wrote
 * the SoT, so we only need to finish embedding (or re-CAS parsing→indexing).
 */
async function resumeIndexing(sourceId: string): Promise<void> {
  const [row] = await db
    .select({ id: sources.id, status: sources.status })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1);
  if (!row) return; // gone — clean terminal
  if (row.status === 'indexing') {
    await indexPhase(sourceId);
  }
  // pending was handled by claimForParse; parsing/other terminal → nothing here.
}

// ── CAS helper ────────────────────────────────────────────────────────────────

/**
 * Compare-and-swap the status: UPDATE … WHERE id=$id AND status IN (expected).
 * Returns true iff a row was updated (the swap won the race). Optional extra
 * columns (`errorCode`) are set in the same statement.
 */
async function casStatus(
  sourceId: string,
  expected: readonly string[],
  next: string,
  extra?: { errorCode?: string | null },
): Promise<boolean> {
  const set: Record<string, unknown> = { status: next, updatedAt: new Date() };
  if (extra && 'errorCode' in extra) set.errorCode = extra.errorCode ?? null;
  const rows = await db
    .update(sources)
    .set(set)
    .where(and(eq(sources.id, sourceId), inArray(sources.status, expected as string[])))
    .returning({ id: sources.id });
  return rows.length > 0;
}

// ── Resume-on-startup (boot-time, ALL users) ──────────────────────────────────

/**
 * Reclaim every non-terminal source on boot (mirrors `reconcileOnStartup`):
 * CAS-reset `parsing`/`indexing` back to `pending` (a torn parse re-parses; a
 * torn embed re-embeds only embedded=false chunks) and re-enqueue. NEVER throws
 * into the caller — kicked from index.ts after listen, degrades silently.
 */
export async function resumeSourceIngestOnStartup(): Promise<void> {
  try {
    const rows = await db
      .select({ id: sources.id })
      .from(sources)
      .where(inArray(sources.status, ['pending', 'parsing', 'indexing']));
    if (rows.length === 0) return;
    // Reset parsing/indexing → pending so the full pipeline re-runs idempotently.
    await db
      .update(sources)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(inArray(sources.status, ['parsing', 'indexing']));
    rootLogger.info({ count: rows.length }, 'ai.source_ingest.resume');
    for (const { id } of rows) enqueueSource(id);
  } catch (err) {
    rootLogger.error({ err }, 'ai.source_ingest.resume_failed — degrading');
  }
}
