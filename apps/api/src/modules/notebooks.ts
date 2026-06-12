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
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  cardSources,
  cards,
  conversations,
  db,
  decks,
  messages,
  notebookArtifacts,
  notebookNotes,
  notebooks,
  notebookSources,
  quizAttempts,
  sourceAnnotations,
  sourceChunks,
  sourceMarks,
  sourceReadingState,
  sources,
  type Citation,
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
  MAX_NOTES_PER_NOTEBOOK,
  NOTE_CITATIONS_MAX_BYTES,
  NOTE_CONTENT_MAX,
  NOTE_EXCERPT_MAX,
  NOTE_TITLE_MAX,
  NOTEBOOK_ARTIFACT_TYPES,
  NOTEBOOK_COLORS,
  NOTEBOOK_DESCRIPTION_MAX,
  NOTEBOOK_EMOJI_MAX,
  NOTEBOOK_NOTE_KINDS,
  NOTEBOOK_TITLE_MAX,
  QUIZ_QUESTIONS_MAX,
  SOURCE_MARK_COLORS,
  type InkStroke,
  type MarkRect,
  type NotebookArtifactType,
  type NotebookNoteKind,
  type PageAnnotations,
  type QuizContent,
  type SourceMarkKind,
} from '@neuronexus/shared';
import { authPlugin } from '../auth-plugin.ts';
import { AI_COOLDOWN_MS, cooldownCheck } from '../ai-cooldown.ts';
import { env } from '../env.ts';
import { rootLogger } from '../logger.ts';
import { getObjectBytes } from '../storage.ts';
import { isChatEnabled } from '../ai/openai-client.ts';
import {
  ARTIFACT_TYPE_TITLE,
  generateArtifact,
  generateNotebookOverview,
  scoreQuizAttempt,
} from '../ai/artifacts.ts';
import { suggestCard } from '../ai/suggest-card.ts';
import { conceptMap } from '../ai/concept-map.ts';
import { suggestSources } from '../ai/suggest-sources.ts';
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

// ── «Блокноты 2.0» (N1) metadata + notes helpers ─────────────────────────────
const NOTEBOOK_COLOR_SET = new Set<string>(NOTEBOOK_COLORS);
const NOTE_KIND_SET = new Set<NotebookNoteKind>(NOTEBOOK_NOTE_KINDS);

/**
 * Deterministic overview fingerprint (Р6): a stable hash of the notebook's
 * READY sources (sorted by id) + each source's chunk count. Drives the
 * «обзор устарел» staleness check on the client — it does NOT use
 * `sources.updated_at` (cover/author backfills bump that, causing false
 * invalidation). Exported so N2's overview generator reuses the SAME function
 * (one source of truth for the cache key). FNV-1a hex (no Node `crypto`
 * import needed; determinism is all that matters here).
 */
export function computeOverviewFingerprint(
  ready: { sourceId: string; chunkCount: number }[],
): string {
  const parts = ready
    .map((r) => `${r.sourceId}:${r.chunkCount}`)
    .sort()
    .join('|');
  // FNV-1a 32-bit over the canonical string.
  let h = 0x811c9dc5;
  for (let i = 0; i < parts.length; i++) {
    h ^= parts.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * The current (recomputed) overview fingerprint for a notebook: its READY
 * attached sources + each one's COUNT(source_chunks). Empty (no ready sources)
 * ⇒ a fixed sentinel so the client can tell "nothing to summarize" apart from a
 * stale cache. user-scoped (the join carries the notebook + user predicate).
 */
async function currentOverviewFingerprint(
  userId: string,
  notebookId: string,
): Promise<string> {
  const rows = await db
    .select({
      sourceId: sources.id,
      chunkCount: count(sourceChunks.id),
    })
    .from(notebookSources)
    .innerJoin(sources, eq(sources.id, notebookSources.sourceId))
    .leftJoin(sourceChunks, eq(sourceChunks.sourceId, sources.id))
    .where(
      and(
        eq(notebookSources.userId, userId),
        eq(notebookSources.notebookId, notebookId),
        eq(sources.status, 'ready'),
      ),
    )
    .groupBy(sources.id);
  if (rows.length === 0) return 'empty';
  return computeOverviewFingerprint(
    rows.map((r) => ({ sourceId: r.sourceId, chunkCount: Number(r.chunkCount) })),
  );
}

/** One-line note excerpt: collapse whitespace, cap to NOTE_EXCERPT_MAX chars. */
function noteExcerpt(content: string): string {
  return excerptFront(content, NOTE_EXCERPT_MAX);
}

// ── «Блокноты 2.0» studio (N2) helpers ────────────────────────────────────────
const ARTIFACT_TYPE_SET = new Set<string>(NOTEBOOK_ARTIFACT_TYPES);

/**
 * The notebook's READY source ids (the join — sources are user-level), optionally
 * INTERSECTED with a per-request `sourceIds` snapshot (Р4: absent ⇒ all ready;
 * foreign/non-ready ids silently dropped). user-scoped. The result is the
 * artifact's `source_ids` snapshot — empty ⇒ the route returns 400 `no_sources`.
 */
async function resolveReadyScope(
  userId: string,
  notebookId: string,
  requested: string[] | undefined,
): Promise<string[]> {
  const readyRows = await db
    .select({ id: sources.id })
    .from(notebookSources)
    .innerJoin(sources, eq(sources.id, notebookSources.sourceId))
    .where(
      and(
        eq(notebookSources.userId, userId),
        eq(notebookSources.notebookId, notebookId),
        eq(sources.status, 'ready'),
      ),
    );
  const readyIds = readyRows.map((r) => r.id);
  if (requested === undefined) return readyIds;
  const want = new Set(requested);
  return readyIds.filter((id) => want.has(id));
}

/**
 * Human title for a new artifact, with dup-numbering («FAQ (2)») when a same-type
 * title already exists in the notebook. Counts EXISTING artifacts of that type
 * for this notebook (user-scoped) — N+1 of the same type ⇒ « (N+1)».
 */
async function nextArtifactTitle(
  userId: string,
  notebookId: string,
  type: NotebookArtifactType,
): Promise<string> {
  const base = ARTIFACT_TYPE_TITLE[type];
  const [{ n }] = await db
    .select({ n: count() })
    .from(notebookArtifacts)
    .where(
      and(
        eq(notebookArtifacts.userId, userId),
        eq(notebookArtifacts.notebookId, notebookId),
        eq(notebookArtifacts.type, type),
      ),
    );
  const existing = Number(n);
  return existing === 0 ? base : `${base} (${existing + 1})`;
}

/** Fire-and-forget kick of the artifact generator (logs but never rejects).
 *  `questionCount` is forwarded for quiz generation (ignored by markdown types). */
function kickArtifact(artifactId: string, questionCount?: number): void {
  void generateArtifact(artifactId, { questionCount }).catch((err) => {
    rootLogger.error({ err, artifactId }, 'ai.artifact.kick_failed');
  });
}

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
  // Grid list (Р13): metadata + per-notebook counts in ONE query (no N+1) +
  // `?archived=` filter (default: only non-archived). Ordered pinned-first,
  // recency-second. Counts:
  //  - sourceCount: attached library sources (notebook_sources edges).
  //  - noteCount: notebook_notes rows.
  //  - cardCount: DISTINCT cards BORN in this notebook (card_sources.notebook_id),
  //    LIVE only (the FK-cascade keeps card_sources.card_id valid, so a plain
  //    count of distinct card_id over the user's edges is already live).
  //  - artifactCount: total notebook_artifacts rows for this notebook.
  //  - generatingCount: notebook_artifacts rows with status IN ('pending','generating').
  //  - generatingTitle: title of the most recent in-flight artifact (null if none).
  //  - coverSources: ≤4 attached sources (oldest-attach first) with title/kind/coverMediaId
  //    for the notebook card mosaic in the grid UI.
  .get(
    '/',
    async ({ user, query }) => {
      const archived = query.archived === 'true';
      // One-query counts via correlated subqueries. The subquery tables are
      // ALIASED (ns/nn/cs/c/na) and the outer correlation references the
      // (non-aliased) `notebooks.id` LITERALLY — drizzle's `${col}` interpolation
      // renders columns UNQUALIFIED inside an `sql` template, so a `${cards.id}`
      // would collide with `card_sources.id` ("id" is ambiguous). cardCount JOINs
      // `cards` so a deleted card (its card_sources edge cascades away) is never
      // counted — LIVE cards born in this notebook only.
      // coverSources uses a wrapping subquery so LIMIT can be applied inside json_agg.
      const rows = await db
        .select({
          notebook: notebooks,
          sourceCount: sql<number>`(SELECT count(*)::int FROM notebook_sources ns WHERE ns.notebook_id = notebooks.id)`,
          noteCount: sql<number>`(SELECT count(*)::int FROM notebook_notes nn WHERE nn.notebook_id = notebooks.id)`,
          cardCount: sql<number>`(SELECT count(DISTINCT cs.card_id)::int FROM card_sources cs JOIN cards c ON c.id = cs.card_id WHERE cs.notebook_id = notebooks.id)`,
          artifactCount: sql<number>`(SELECT count(*)::int FROM notebook_artifacts na WHERE na.notebook_id = notebooks.id)`,
          generatingCount: sql<number>`(SELECT count(*)::int FROM notebook_artifacts na WHERE na.notebook_id = notebooks.id AND na.status IN ('pending','generating'))`,
          generatingTitle: sql<string | null>`(SELECT na.title FROM notebook_artifacts na WHERE na.notebook_id = notebooks.id AND na.status IN ('pending','generating') ORDER BY na.created_at DESC LIMIT 1)`,
          coverSources: sql<{ title: string; kind: string; coverMediaId: string | null }[]>`COALESCE((SELECT json_agg(q) FROM (SELECT s.title, s.kind, s.cover_media_id AS "coverMediaId" FROM notebook_sources ns2 JOIN sources s ON s.id = ns2.source_id WHERE ns2.notebook_id = notebooks.id ORDER BY ns2.added_at ASC LIMIT 4) q), '[]'::json)`,
        })
        .from(notebooks)
        .where(and(eq(notebooks.userId, user.id), eq(notebooks.archived, archived)))
        .orderBy(desc(notebooks.pinned), desc(notebooks.updatedAt));
      const items = rows.map((r) => ({
        ...r.notebook,
        sourceCount: Number(r.sourceCount),
        noteCount: Number(r.noteCount),
        cardCount: Number(r.cardCount),
        artifactCount: Number(r.artifactCount),
        generatingCount: Number(r.generatingCount),
        generatingTitle: r.generatingTitle ?? null,
        coverSources: r.coverSources,
      }));
      return { items };
    },
    {
      auth: true,
      query: t.Object({
        archived: t.Optional(t.Union([t.Literal('true'), t.Literal('false')])),
      }),
    },
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
  // Update notebook metadata via an EXPLICIT field map (Р13): title|emoji|color|
  // description|pinned|archived. Empty body → 400 `nothing_to_update`. `updatedAt`
  // bumps ONLY on CONTENT fields (title/emoji/color/description) — pin/archive
  // toggles preserve recency (Р15, the pinned-threads pattern). Validations:
  // title 1..NOTEBOOK_TITLE_MAX, emoji ≤NOTEBOOK_EMOJI_MAX, description
  // ≤NOTEBOOK_DESCRIPTION_MAX, color ∈ NOTEBOOK_COLORS. null on emoji/color/
  // description CLEARS the field.
  .patch(
    '/:id',
    async ({ user, params, body, status }) => {
      const set: Record<string, unknown> = {};
      let contentChanged = false;

      if (body.title !== undefined) {
        const title = body.title.trim();
        if (title.length < 1 || title.length > NOTEBOOK_TITLE_MAX) {
          return status(400, { error: 'invalid_title' });
        }
        set.title = title;
        contentChanged = true;
      }
      if (body.emoji !== undefined) {
        if (body.emoji !== null && body.emoji.length > NOTEBOOK_EMOJI_MAX) {
          return status(400, { error: 'invalid_emoji' });
        }
        set.emoji = body.emoji === null || body.emoji.length === 0 ? null : body.emoji;
        contentChanged = true;
      }
      if (body.color !== undefined) {
        if (body.color !== null && !NOTEBOOK_COLOR_SET.has(body.color)) {
          return status(400, { error: 'invalid_color' });
        }
        set.color = body.color;
        contentChanged = true;
      }
      if (body.description !== undefined) {
        if (body.description !== null && body.description.length > NOTEBOOK_DESCRIPTION_MAX) {
          return status(400, { error: 'invalid_description' });
        }
        set.description =
          body.description === null || body.description.length === 0 ? null : body.description;
        contentChanged = true;
      }
      // Non-content toggles — do NOT bump updatedAt (Р15).
      if (body.pinned !== undefined) set.pinned = body.pinned;
      if (body.archived !== undefined) set.archived = body.archived;

      if (Object.keys(set).length === 0) {
        return status(400, { error: 'nothing_to_update' });
      }
      // Monotonic on the DB clock (see bumpNotebookUpdatedAt) — a host `new Date()`
      // can land behind the row's DEFAULT-now() stamp on VM clock drift.
      if (contentChanged) {
        set.updatedAt = sql`GREATEST(now(), ${notebooks.updatedAt} + interval '1 millisecond')`;
      }

      const [row] = await db
        .update(notebooks)
        .set(set)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .returning();
      if (!row) return status(404, { error: 'not_found' });
      return row;
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        title: t.Optional(t.String({ maxLength: NOTEBOOK_TITLE_MAX + 1 })),
        emoji: t.Optional(t.Union([t.String({ maxLength: NOTEBOOK_EMOJI_MAX + 1 }), t.Null()])),
        color: t.Optional(t.Union([t.String({ maxLength: 24 }), t.Null()])),
        description: t.Optional(
          t.Union([t.String({ maxLength: NOTEBOOK_DESCRIPTION_MAX + 1 }), t.Null()]),
        ),
        pinned: t.Optional(t.Boolean()),
        archived: t.Optional(t.Boolean()),
      }),
    },
  )
  // Notebook detail (Р13/Р6): the full row + the CURRENT recomputed overview
  // fingerprint so the client can compare it to the cached `overviewFingerprint`
  // and offer «Обновить обзор». user-scoped 404.
  .get(
    '/:id',
    async ({ user, params, status }) => {
      const [row] = await db
        .select()
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!row) return status(404, { error: 'not_found' });
      const currentFingerprint = await currentOverviewFingerprint(user.id, params.id);
      return { ...row, currentFingerprint };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
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
      // Reading state (user-scoped): batch fetch by source_id list (no N+1).
      const readingStateRows =
        items.length > 0
          ? await db
              .select({
                sourceId: sourceReadingState.sourceId,
                readingStatus: sourceReadingState.status,
                readingPercent: sourceReadingState.percent,
              })
              .from(sourceReadingState)
              .where(
                and(
                  eq(sourceReadingState.userId, user.id),
                  inArray(
                    sourceReadingState.sourceId,
                    items.map((s) => s.id),
                  ),
                ),
              )
          : [];
      const readingBySource = new Map(readingStateRows.map((r) => [r.sourceId, r]));
      return {
        items: items.map((s) => {
          const rs = readingBySource.get(s.id);
          return {
            ...withProgress(s, indexedBySource.get(s.id) ?? 0),
            readingStatus: rs?.readingStatus ?? null,
            readingPercent: rs?.readingPercent ?? null,
          };
        }),
      };
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
        const inserted = await db.transaction(async (tx) => {
          const rows = await tx
            .insert(notebookSources)
            .values(newIds.map((sourceId) => ({ userId: user.id, notebookId: params.id, sourceId })))
            .onConflictDoNothing({
              target: [notebookSources.notebookId, notebookSources.sourceId],
            })
            .returning({ id: notebookSources.id });
          // Bump only when the attach actually inserted a new edge (Р15) — a
          // fully-idempotent re-attach (every id already present) leaves the
          // notebook's activity timestamp untouched.
          if (rows.length > 0) await bumpNotebookUpdatedAt(tx, user.id, params.id);
          return rows;
        });
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

      const row = await db.transaction(async (tx) => {
        const [deleted] = await tx
          .delete(notebookSources)
          .where(
            and(
              eq(notebookSources.userId, user.id),
              eq(notebookSources.notebookId, params.id),
              eq(notebookSources.sourceId, params.sourceId),
            ),
          )
          .returning({ id: notebookSources.id });
        // Bump only when a real edge was removed (Р15) — detaching a
        // non-attached source touches zero rows → no activity bump.
        if (deleted) await bumpNotebookUpdatedAt(tx, user.id, params.id);
        return deleted ?? null;
      });
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
  )
  // ── notebook notes (Р1/Р7/Р15, N1) ───────────────────────────────────────────
  // A note is user-editable markdown (manual) or a saved chat answer (answer).
  // ALL routes are user-scoped (the notebook ownership SELECT is the first guard;
  // a foreign notebook/note → 404 with zero rows touched). Any CONTENT mutation
  // (POST/PATCH-content/DELETE) bumps `notebooks.updated_at` in the SAME tx (Р15).

  // List a notebook's notes (Р13/Р12): pinned-first, recency-second; optional
  // `q` ILIKE over title+content. Returns both full `content` and a light
  // `excerpt` (≤NOTE_EXCERPT_MAX) so the list can render cheaply (Р8 gotcha).
  // Cap LIBRARY_PAGE (no cursor in V1 — the per-notebook note cap bounds it).
  .get(
    '/:id/notes',
    async ({ user, params, query, status }) => {
      const [nb] = await db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!nb) return status(404, { error: 'not_found' });

      const q = query.q?.trim();
      // Escape LIKE/ILIKE metacharacters so a literal '%' / '_' / '\' in the
      // query matches itself instead of acting as a wildcard (a bare '_' must
      // NOT match everything). The default ILIKE escape char is backslash.
      const like = q && q.length > 0 ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : undefined;
      const search = like
        ? or(ilike(notebookNotes.title, like), ilike(notebookNotes.content, like))
        : undefined;

      const rows = await db
        .select()
        .from(notebookNotes)
        .where(
          and(
            eq(notebookNotes.userId, user.id),
            eq(notebookNotes.notebookId, params.id),
            ...(search ? [search] : []),
          ),
        )
        .orderBy(desc(notebookNotes.pinned), desc(notebookNotes.updatedAt))
        .limit(env.ai.LIBRARY_PAGE);

      const items = rows.map((r) => ({ ...r, excerpt: noteExcerpt(r.content) }));
      return { items };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      query: t.Object({ q: t.Optional(t.String({ maxLength: 200 })) }),
    },
  )
  // Create a note. `kind` defaults to 'manual'; 'answer' is a saved chat answer
  // (Р7) carrying a `citations` snapshot + a `messageId` back-ref. The messageId
  // is VALIDATED server-side: the message must belong to the user AND to a
  // conversation bound to THIS notebook (else 400 `invalid_message`). Caps:
  // title/content over the limit → 400 `invalid_note`; per-notebook count over
  // the cap → 409 `too_many_notes`; citations snapshot over the byte cap → 400
  // `invalid_note`. Bumps notebooks.updated_at (Р15).
  .post(
    '/:id/notes',
    async ({ user, params, body, status }) => {
      const [nb] = await db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!nb) return status(404, { error: 'not_found' });

      const title = body.title.trim();
      if (title.length < 1 || title.length > NOTE_TITLE_MAX) {
        return status(400, { error: 'invalid_note' });
      }
      if (body.content.length > NOTE_CONTENT_MAX) {
        return status(400, { error: 'invalid_note' });
      }
      const kind = body.kind ?? 'manual';
      if (!NOTE_KIND_SET.has(kind as NotebookNoteKind)) {
        return status(400, { error: 'invalid_note' });
      }
      // Opaque citations snapshot — structure not deeply validated (Р7), just
      // byte-capped to bound the row size.
      if (body.citations !== undefined && body.citations !== null) {
        if (JSON.stringify(body.citations).length > NOTE_CITATIONS_MAX_BYTES) {
          return status(400, { error: 'invalid_note' });
        }
      }

      // messageId validation: the message must be the user's AND belong to a
      // conversation bound to THIS notebook (spoof-resistant — Р7 invariant).
      if (body.messageId !== undefined && body.messageId !== null) {
        const [msg] = await db
          .select({ id: messages.id })
          .from(messages)
          .innerJoin(conversations, eq(conversations.id, messages.conversationId))
          .where(
            and(
              eq(messages.id, body.messageId),
              eq(messages.userId, user.id),
              eq(conversations.notebookId, params.id),
            ),
          )
          .limit(1);
        if (!msg) return status(400, { error: 'invalid_message' });
      }

      // Best-effort per-notebook cap (Р16; two parallel POSTs may overshoot by 1,
      // accepted — no advisory lock).
      const [{ n }] = await db
        .select({ n: count() })
        .from(notebookNotes)
        .where(
          and(eq(notebookNotes.userId, user.id), eq(notebookNotes.notebookId, params.id)),
        );
      if (n >= MAX_NOTES_PER_NOTEBOOK) return status(409, { error: 'too_many_notes' });

      const row = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(notebookNotes)
          .values({
            userId: user.id,
            notebookId: params.id,
            title,
            content: body.content,
            kind,
            citations: (body.citations as Citation[] | undefined) ?? null,
            messageId: body.messageId ?? null,
          })
          .returning();
        await bumpNotebookUpdatedAt(tx, user.id, params.id);
        return created!;
      });
      return row;
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: NOTE_TITLE_MAX + 1 }),
        content: t.String({ maxLength: NOTE_CONTENT_MAX + 1 }),
        kind: t.Optional(t.String({ maxLength: 16 })),
        // Opaque jsonb snapshot (byte-capped in-handler). Keep permissive.
        citations: t.Optional(t.Unknown()),
        messageId: t.Optional(t.String({ format: 'uuid' })),
      }),
    },
  )
  // Patch a note: title?/content?/pinned?. Empty body → 400 `nothing_to_update`.
  // updatedAt bumps ONLY on title/content (Р15, like the notebook PATCH). Any
  // content mutation bumps notebooks.updated_at. user-scoped 404 (foreign
  // notebook OR foreign note → 404, zero rows touched).
  .patch(
    '/:id/notes/:noteId',
    async ({ user, params, body, status }) => {
      const [nb] = await db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!nb) return status(404, { error: 'not_found' });

      const set: Record<string, unknown> = {};
      let contentChanged = false;
      if (body.title !== undefined) {
        const title = body.title.trim();
        if (title.length < 1 || title.length > NOTE_TITLE_MAX) {
          return status(400, { error: 'invalid_note' });
        }
        set.title = title;
        contentChanged = true;
      }
      if (body.content !== undefined) {
        if (body.content.length > NOTE_CONTENT_MAX) {
          return status(400, { error: 'invalid_note' });
        }
        set.content = body.content;
        contentChanged = true;
      }
      if (body.pinned !== undefined) set.pinned = body.pinned;
      if (Object.keys(set).length === 0) {
        return status(400, { error: 'nothing_to_update' });
      }
      // Same monotonic form as the notebook PATCH — note rows are DEFAULT-now()
      // stamped too, so a host clock behind Postgres would un-order the list.
      if (contentChanged) {
        set.updatedAt = sql`GREATEST(now(), ${notebookNotes.updatedAt} + interval '1 millisecond')`;
      }

      const row = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(notebookNotes)
          .set(set)
          .where(
            and(
              eq(notebookNotes.id, params.noteId),
              eq(notebookNotes.notebookId, params.id),
              eq(notebookNotes.userId, user.id),
            ),
          )
          .returning();
        if (!updated) return null;
        await bumpNotebookUpdatedAt(tx, user.id, params.id);
        return updated;
      });
      if (!row) return status(404, { error: 'not_found' });
      return row;
    },
    {
      auth: true,
      params: t.Object({
        id: t.String({ format: 'uuid' }),
        noteId: t.String({ format: 'uuid' }),
      }),
      body: t.Object({
        title: t.Optional(t.String({ maxLength: NOTE_TITLE_MAX + 1 })),
        content: t.Optional(t.String({ maxLength: NOTE_CONTENT_MAX + 1 })),
        pinned: t.Optional(t.Boolean()),
      }),
    },
  )
  // Delete a note. user-scoped 404. Bumps notebooks.updated_at (Р15).
  .delete(
    '/:id/notes/:noteId',
    async ({ user, params, status }) => {
      const [nb] = await db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!nb) return status(404, { error: 'not_found' });

      const ok = await db.transaction(async (tx) => {
        const [row] = await tx
          .delete(notebookNotes)
          .where(
            and(
              eq(notebookNotes.id, params.noteId),
              eq(notebookNotes.notebookId, params.id),
              eq(notebookNotes.userId, user.id),
            ),
          )
          .returning({ id: notebookNotes.id });
        if (!row) return false;
        await bumpNotebookUpdatedAt(tx, user.id, params.id);
        return true;
      });
      if (!ok) return status(404, { error: 'not_found' });
      return { ok: true };
    },
    {
      auth: true,
      params: t.Object({
        id: t.String({ format: 'uuid' }),
        noteId: t.String({ format: 'uuid' }),
      }),
    },
  )
  // ── studio: generated artifacts (Р2/Р3, N2 §3) ────────────────────────────────
  // An artifact ROW IS A JOB (pending→generating→ready|error). All routes are
  // user-scoped (the notebook ownership SELECT is the first guard; foreign → 404).

  // List a notebook's artifacts — LIGHT (no content_md/content_json). Newest-first.
  .get(
    '/:id/artifacts',
    async ({ user, params, status }) => {
      const [nb] = await db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!nb) return status(404, { error: 'not_found' });

      const rows = await db
        .select({
          id: notebookArtifacts.id,
          type: notebookArtifacts.type,
          status: notebookArtifacts.status,
          title: notebookArtifacts.title,
          sourceIds: notebookArtifacts.sourceIds,
          errorCode: notebookArtifacts.errorCode,
          model: notebookArtifacts.model,
          // Live-progress char counter for a job still running (A/B): the length
          // of the partial raw text the streaming worker has flushed so far. 0 for
          // terminal rows (content_md is the FINAL doc there — not a progress hint).
          progressChars: sql<number>`CASE WHEN ${notebookArtifacts.status} IN ('pending','generating') THEN COALESCE(length(${notebookArtifacts.contentMd}), 0) ELSE 0 END`,
          createdAt: notebookArtifacts.createdAt,
          updatedAt: notebookArtifacts.updatedAt,
        })
        .from(notebookArtifacts)
        .where(
          and(eq(notebookArtifacts.userId, user.id), eq(notebookArtifacts.notebookId, params.id)),
        )
        .orderBy(desc(notebookArtifacts.createdAt));
      return { items: rows };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // Create an artifact job. ORDER OF CHECKS IS FIXED (§3): ownership-404 →
  // 400 invalid_type → 400 no_sources → 409 too_many_artifacts →
  // 409 generation_in_progress (EXISTS + INSERT in one tx). `quiz` is a valid
  // type now (N3) — its `questionCount?` rides the kick; markdown types ignore it.
  // The `source_ids` snapshot = the resolved ready scope. Bumps notebook.updated_at.
  .post(
    '/:id/artifacts',
    async ({ user, params, body, status }) => {
      // 1) ownership.
      const [nb] = await db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!nb) return status(404, { error: 'not_found' });

      // 2) invalid_type — unknown type.
      if (!ARTIFACT_TYPE_SET.has(body.type)) {
        return status(400, { error: 'invalid_type' });
      }
      const type = body.type as NotebookArtifactType;

      // 3) no_sources — resolved ready scope (intersect; absent ⇒ all ready).
      const scope = await resolveReadyScope(user.id, params.id, body.sourceIds);
      if (scope.length === 0) return status(400, { error: 'no_sources' });

      // 4) too_many_artifacts — per-notebook cap.
      const [{ n }] = await db
        .select({ n: count() })
        .from(notebookArtifacts)
        .where(
          and(eq(notebookArtifacts.userId, user.id), eq(notebookArtifacts.notebookId, params.id)),
        );
      if (Number(n) >= env.ai.MAX_ARTIFACTS_PER_NOTEBOOK) {
        return status(409, { error: 'too_many_artifacts' });
      }

      // 5) generation_in_progress — EXISTS(pending|generating) + INSERT in ONE tx
      // (one generation per notebook, Р16; the partial active-index serializes the
      // EXISTS probe against a concurrent POST).
      const title = await nextArtifactTitle(user.id, params.id, type);
      const created = await db.transaction(async (tx) => {
        // Serialize concurrent POSTs for THIS notebook (the non-unique partial
        // active-index can't enforce one-job-at-a-time on its own — two parallel
        // EXISTS probes would both see "no active" and both INSERT). A per-notebook
        // advisory xact lock makes the EXISTS+INSERT atomic; it releases on commit.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${params.id}))`);
        const active = await tx
          .select({ id: notebookArtifacts.id })
          .from(notebookArtifacts)
          .where(
            and(
              eq(notebookArtifacts.notebookId, params.id),
              inArray(notebookArtifacts.status, ['pending', 'generating']),
            ),
          )
          .limit(1);
        if (active.length > 0) return null;
        const [row] = await tx
          .insert(notebookArtifacts)
          .values({
            userId: user.id,
            notebookId: params.id,
            type,
            status: 'pending',
            title,
            sourceIds: scope,
          })
          .returning();
        await bumpNotebookUpdatedAt(tx, user.id, params.id);
        return row!;
      });
      if (!created) return status(409, { error: 'generation_in_progress' });

      // 6) async kick (not awaited; .catch-logged). questionCount rides for quiz.
      kickArtifact(created.id, type === 'quiz' ? body.questionCount : undefined);
      return created;
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        type: t.String({ maxLength: 32 }),
        sourceIds: t.Optional(t.Array(t.String({ format: 'uuid' }), { maxItems: 100 })),
        // questionCount rides for quiz generation (default QUIZ_QUESTIONS_DEFAULT,
        // capped QUIZ_QUESTIONS_MAX server-side); accepted + ignored by markdown types.
        questionCount: t.Optional(t.Integer({ minimum: 1, maximum: QUIZ_QUESTIONS_MAX })),
      }),
    },
  )
  // Full artifact (content_md|content_json + status + error). user-scoped 404.
  .get(
    '/:id/artifacts/:artifactId',
    async ({ user, params, status }) => {
      const [row] = await db
        .select()
        .from(notebookArtifacts)
        .where(
          and(
            eq(notebookArtifacts.id, params.artifactId),
            eq(notebookArtifacts.notebookId, params.id),
            eq(notebookArtifacts.userId, user.id),
          ),
        )
        .limit(1);
      if (!row) return status(404, { error: 'not_found' });
      return row;
    },
    {
      auth: true,
      params: t.Object({
        id: t.String({ format: 'uuid' }),
        artifactId: t.String({ format: 'uuid' }),
      }),
    },
  )
  // Delete an artifact (ANY status). A `generating` row can be deleted: the worker
  // CAS generating→ready then finds 0 rows and discards its result (no orphan).
  // user-scoped 404. Bumps notebook.updated_at.
  .delete(
    '/:id/artifacts/:artifactId',
    async ({ user, params, status }) => {
      const [nb] = await db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!nb) return status(404, { error: 'not_found' });

      const ok = await db.transaction(async (tx) => {
        const [row] = await tx
          .delete(notebookArtifacts)
          .where(
            and(
              eq(notebookArtifacts.id, params.artifactId),
              eq(notebookArtifacts.notebookId, params.id),
              eq(notebookArtifacts.userId, user.id),
            ),
          )
          .returning({ id: notebookArtifacts.id });
        if (!row) return false;
        await bumpNotebookUpdatedAt(tx, user.id, params.id);
        return true;
      });
      if (!ok) return status(404, { error: 'not_found' });
      return { ok: true };
    },
    {
      auth: true,
      params: t.Object({
        id: t.String({ format: 'uuid' }),
        artifactId: t.String({ format: 'uuid' }),
      }),
    },
  )
  // Regenerate: CAS ready|error → pending (KEEPING the same source_ids snapshot) +
  // kick. A generating/pending artifact → 409 not_terminal. user-scoped 404.
  // Bumps notebook.updated_at (Р15).
  .post(
    '/:id/artifacts/:artifactId/regenerate',
    async ({ user, params, status }) => {
      const [nb] = await db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!nb) return status(404, { error: 'not_found' });

      // Distinguish "missing/foreign" (404) from "not terminal" (409): read first.
      const [existing] = await db
        .select({ id: notebookArtifacts.id, status: notebookArtifacts.status })
        .from(notebookArtifacts)
        .where(
          and(
            eq(notebookArtifacts.id, params.artifactId),
            eq(notebookArtifacts.notebookId, params.id),
            eq(notebookArtifacts.userId, user.id),
          ),
        )
        .limit(1);
      if (!existing) return status(404, { error: 'not_found' });
      // The TARGET artifact itself is mid-flight ⇒ not_terminal (§3). A DIFFERENT
      // live artifact of the notebook is caught inside the tx as
      // generation_in_progress.
      if (existing.status === 'pending' || existing.status === 'generating') {
        return status(409, { error: 'not_terminal' });
      }

      // One generation per notebook (Р16): a DIFFERENT artifact mid-flight blocks.
      // Same per-notebook advisory xact lock as POST — serializes a regenerate
      // racing a create (or another regenerate) for this notebook.
      const out = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${params.id}))`);
        const active = await tx
          .select({ id: notebookArtifacts.id })
          .from(notebookArtifacts)
          .where(
            and(
              eq(notebookArtifacts.notebookId, params.id),
              // A DIFFERENT artifact mid-flight (exclude the regenerate target).
              sql`${notebookArtifacts.id} <> ${params.artifactId}`,
              inArray(notebookArtifacts.status, ['pending', 'generating']),
            ),
          )
          .limit(1);
        if (active.length > 0) return { error: 'generation_in_progress' as const };

        const rows = await tx
          .update(notebookArtifacts)
          .set({
            status: 'pending',
            errorCode: null,
            // Monotonic on the Postgres clock (same skew bumpNotebookUpdatedAt
            // guards against): GREATEST(now(), prev + 1ms) never lands behind a
            // DB-DEFAULT-stamped neighbour when host/VM clocks drift.
            updatedAt: sql`GREATEST(now(), ${notebookArtifacts.updatedAt} + interval '1 millisecond')`,
          })
          .where(
            and(
              eq(notebookArtifacts.id, params.artifactId),
              eq(notebookArtifacts.userId, user.id),
              inArray(notebookArtifacts.status, ['ready', 'error']),
            ),
          )
          .returning();
        if (rows.length === 0) return { error: 'not_terminal' as const };
        await bumpNotebookUpdatedAt(tx, user.id, params.id);
        return { row: rows[0]! };
      });
      if ('error' in out) {
        return status(409, { error: out.error });
      }
      kickArtifact(out.row.id);
      return out.row;
    },
    {
      auth: true,
      params: t.Object({
        id: t.String({ format: 'uuid' }),
        artifactId: t.String({ format: 'uuid' }),
      }),
    },
  )
  // ── overview (Р6, N2 §3) ──────────────────────────────────────────────────────
  // SYNC generation of the notebook briefing + suggested questions. Order: 404
  // (ownership) → 400 no_sources (no ready sources) → 503 ai_disabled (chat off)
  // → 502 overview_failed (timeout / gateway / unparseable) → 200 {overview,
  // questions, fingerprint}.
  .post(
    '/:id/overview',
    async ({ user, params, status }) => {
      const [nb] = await db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!nb) return status(404, { error: 'not_found' });

      // no_sources BEFORE the AI gate (a free-to-answer 400 over a paid 503/502).
      const scope = await resolveReadyScope(user.id, params.id, undefined);
      if (scope.length === 0) return status(400, { error: 'no_sources' });

      if (!isChatEnabled()) return status(503, { error: 'ai_disabled' });

      // Cooldown the paid generation AFTER ownership/no_sources/AI gates (a
      // foreign id never arms it) and only before the call itself. A failed call
      // keeps the cooldown armed (anti retry-storm).
      const cd = cooldownCheck(`overview:${params.id}`, AI_COOLDOWN_MS.overview);
      if (!cd.ok) return status(429, { error: 'cooldown', retryAfterMs: cd.retryAfterMs });

      const result = await generateNotebookOverview(user.id, params.id);
      if (!result) return status(502, { error: 'overview_failed' });
      return result;
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // ── quiz attempts (Р8 / §3, N3) ───────────────────────────────────────────────
  // Submit answers to a quiz artifact. The artifact MUST be type='quiz' AND
  // status='ready' (else 400 invalid_attempt). Each submitted questionId must
  // exist in the stored content_json (unknown → 400 invalid_attempt). Scoring is
  // SERVER-RECOMPUTED for mcq/tf (a forged `correct` in the body is ignored);
  // `open` trusts ONLY the client's `{ selfCorrect }` boolean. Unanswered
  // questions count as incorrect. Persists the normalized snapshot + correct/total.
  .post(
    '/:id/artifacts/:artifactId/attempts',
    async ({ user, params, body, status }) => {
      // ownership + the quiz artifact (user-scoped 404 on a foreign/missing one).
      const [artifact] = await db
        .select({
          id: notebookArtifacts.id,
          type: notebookArtifacts.type,
          status: notebookArtifacts.status,
          contentJson: notebookArtifacts.contentJson,
        })
        .from(notebookArtifacts)
        .where(
          and(
            eq(notebookArtifacts.id, params.artifactId),
            eq(notebookArtifacts.notebookId, params.id),
            eq(notebookArtifacts.userId, user.id),
          ),
        )
        .limit(1);
      if (!artifact) return status(404, { error: 'not_found' });

      // Must be a READY quiz with parsed questions.
      const quiz = artifact.contentJson as QuizContent | null;
      if (
        artifact.type !== 'quiz' ||
        artifact.status !== 'ready' ||
        !quiz ||
        !Array.isArray(quiz.questions) ||
        quiz.questions.length === 0
      ) {
        return status(400, { error: 'invalid_attempt' });
      }

      // Extract the submitted answers (last write wins on a dup questionId).
      const submitted = new Map<string, number | boolean | { selfCorrect: boolean }>();
      for (const a of body.answers) {
        submitted.set(a.questionId, a.answer as number | boolean | { selfCorrect: boolean });
      }

      const scored = scoreQuizAttempt(quiz.questions, submitted);
      if (!scored.ok) return status(400, { error: 'invalid_attempt' });

      const [row] = await db
        .insert(quizAttempts)
        .values({
          userId: user.id,
          artifactId: params.artifactId,
          answers: scored.answers,
          correct: scored.correct,
          total: scored.total,
        })
        .returning({
          id: quizAttempts.id,
          correct: quizAttempts.correct,
          total: quizAttempts.total,
          answers: quizAttempts.answers,
          createdAt: quizAttempts.createdAt,
        });
      return row!;
    },
    {
      auth: true,
      params: t.Object({
        id: t.String({ format: 'uuid' }),
        artifactId: t.String({ format: 'uuid' }),
      }),
      body: t.Object({
        // Per-question answers. `answer` is permissive (number | boolean |
        // { selfCorrect }) — the scorer enforces the per-kind shape; a forged
        // shape simply scores incorrect. Empty array is valid (all unanswered).
        answers: t.Array(
          t.Object({
            questionId: t.String({ format: 'uuid' }),
            answer: t.Union([
              t.Number(),
              t.Boolean(),
              t.Object({ selfCorrect: t.Boolean() }),
            ]),
          }),
          { maxItems: QUIZ_QUESTIONS_MAX },
        ),
      }),
    },
  )
  // List a quiz artifact's recent attempts (last 10, newest-first). user-scoped
  // 404 on a foreign/missing artifact (the artifact ownership chain guards it).
  .get(
    '/:id/artifacts/:artifactId/attempts',
    async ({ user, params, status }) => {
      const [artifact] = await db
        .select({ id: notebookArtifacts.id })
        .from(notebookArtifacts)
        .where(
          and(
            eq(notebookArtifacts.id, params.artifactId),
            eq(notebookArtifacts.notebookId, params.id),
            eq(notebookArtifacts.userId, user.id),
          ),
        )
        .limit(1);
      if (!artifact) return status(404, { error: 'not_found' });

      const items = await db
        .select({
          id: quizAttempts.id,
          correct: quizAttempts.correct,
          total: quizAttempts.total,
          answers: quizAttempts.answers,
          createdAt: quizAttempts.createdAt,
        })
        .from(quizAttempts)
        .where(
          and(
            eq(quizAttempts.userId, user.id),
            eq(quizAttempts.artifactId, params.artifactId),
          ),
        )
        .orderBy(desc(quizAttempts.createdAt))
        .limit(10);
      return { items };
    },
    {
      auth: true,
      params: t.Object({
        id: t.String({ format: 'uuid' }),
        artifactId: t.String({ format: 'uuid' }),
      }),
    },
  )
  // ── coverage (Р9, N3 §3) ──────────────────────────────────────────────────────
  // Card-coverage of the notebook's ATTACHED sources: for each source how many of
  // its chunks have at least one LIVE card provenance edge. SQL-only (no AI). The
  // tombstone guard is the JOIN on `cards` (a card_sources edge whose card was
  // deleted is excluded — coverage by DEAD cards is never counted). Plus a
  // notebook aggregate + the top-5 heading gaps (most UNcovered chunks). All
  // user-scoped; foreign notebook → 404.
  .get(
    '/:id/coverage',
    async ({ user, params, status }) => {
      const [nb] = await db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!nb) return status(404, { error: 'not_found' });

      // Attached sources (any status — chunks exist only for indexed/ready ones).
      const attached = await db
        .select({ id: sources.id, title: sources.title })
        .from(notebookSources)
        .innerJoin(sources, eq(sources.id, notebookSources.sourceId))
        .where(
          and(
            eq(notebookSources.userId, user.id),
            eq(notebookSources.notebookId, params.id),
          ),
        )
        .orderBy(desc(notebookSources.addedAt));

      const sourceIds = attached.map((s) => s.id);
      if (sourceIds.length === 0) {
        return {
          items: [],
          aggregate: { totalChunks: 0, coveredChunks: 0, cardCount: 0, pct: 0 },
          gaps: [],
        };
      }

      // Per-source: total chunks, covered chunks (DISTINCT chunk with a LIVE card
      // edge), and the count of DISTINCT live cards born on this source's chunks.
      // The LEFT JOIN to `cards` is the TOMBSTONE guard: a card_sources edge whose
      // card was deleted survives (SET NULL keeps sourceChunkId) but `cards.id` is
      // NULL — so `covered`/`cardCount` count ONLY rows where cards.id IS NOT NULL
      // (a CASE inside DISTINCT). ONE query, GROUP BY source.
      const stats = await db
        .select({
          sourceId: sourceChunks.sourceId,
          totalChunks: sql<number>`count(DISTINCT ${sourceChunks.id})::int`,
          coveredChunks: sql<number>`count(DISTINCT CASE WHEN ${cards.id} IS NOT NULL THEN ${cardSources.sourceChunkId} END)::int`,
          cardCount: sql<number>`count(DISTINCT ${cards.id})::int`,
        })
        .from(sourceChunks)
        .leftJoin(
          cardSources,
          and(
            eq(cardSources.sourceChunkId, sourceChunks.id),
            eq(cardSources.userId, user.id),
          ),
        )
        .leftJoin(cards, eq(cards.id, cardSources.cardId))
        .where(
          and(
            eq(sourceChunks.userId, user.id),
            inArray(sourceChunks.sourceId, sourceIds),
          ),
        )
        .groupBy(sourceChunks.sourceId);
      const statBySource = new Map(stats.map((s) => [s.sourceId, s]));

      const titleById = new Map(attached.map((s) => [s.id, s.title]));
      let aggTotal = 0;
      let aggCovered = 0;
      let aggCards = 0;
      const items = sourceIds.map((sourceId) => {
        const s = statBySource.get(sourceId);
        const totalChunks = s ? Number(s.totalChunks) : 0;
        const coveredChunks = s ? Number(s.coveredChunks) : 0;
        const cardCount = s ? Number(s.cardCount) : 0;
        aggTotal += totalChunks;
        aggCovered += coveredChunks;
        aggCards += cardCount;
        return {
          sourceId,
          title: titleById.get(sourceId) ?? '',
          totalChunks,
          coveredChunks,
          cardCount,
          pct: totalChunks > 0 ? Math.round((coveredChunks / totalChunks) * 100) : 0,
        };
      });

      // Gaps: top-5 headings with the most UNCOVERED chunks. A chunk is covered
      // when it has any LIVE card edge (the same EXISTS-of-a-live-card test). NULL
      // heading → bucketed under '' and returned as null (the client labels it).
      const gapRows = await db
        .select({
          sourceId: sourceChunks.sourceId,
          heading: sql<string>`coalesce(${sourceChunks.heading}, '')`,
          uncovered: sql<number>`count(*)::int`,
        })
        .from(sourceChunks)
        .where(
          and(
            eq(sourceChunks.userId, user.id),
            inArray(sourceChunks.sourceId, sourceIds),
            sql`NOT EXISTS (
              SELECT 1 FROM card_sources cs
              JOIN cards c ON c.id = cs.card_id
              WHERE cs.source_chunk_id = ${sourceChunks.id} AND cs.user_id = ${user.id}
            )`,
          ),
        )
        .groupBy(sourceChunks.sourceId, sql`coalesce(${sourceChunks.heading}, '')`)
        .orderBy(desc(sql`count(*)`))
        .limit(5);
      const gaps = gapRows.map((g) => ({
        sourceId: g.sourceId,
        sourceTitle: titleById.get(g.sourceId) ?? '',
        heading: g.heading.length > 0 ? g.heading : null,
        uncovered: Number(g.uncovered),
      }));

      return {
        items,
        aggregate: {
          totalChunks: aggTotal,
          coveredChunks: aggCovered,
          cardCount: aggCards,
          pct: aggTotal > 0 ? Math.round((aggCovered / aggTotal) * 100) : 0,
        },
        gaps,
      };
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )

  // ── concept-map (Р10, N4 §3) ──────────────────────────────────────────────────
  // A SECTIONAL semantic graph over the notebook's READY sources (resolved via the
  // notebook_sources join), built from STORED document vectors — no live embedder
  // (works exactly like the semantic-graph). All the SQL lives in ai/concept-map.ts
  // (two-phase: section aggregation, then a document-guarded k-NN-join). user-scoped;
  // foreign notebook → 404; no sources/vectors → `{nodes:[],edges:[],reason}`.
  .get(
    '/:id/concept-map',
    async ({ user, params, status }) => {
      const [nb] = await db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!nb) return status(404, { error: 'not_found' });

      // Ready sources attached to this notebook (the document-guard scope).
      const ready = await db
        .select({ id: sources.id })
        .from(notebookSources)
        .innerJoin(sources, eq(sources.id, notebookSources.sourceId))
        .where(
          and(
            eq(notebookSources.userId, user.id),
            eq(notebookSources.notebookId, params.id),
            eq(sources.status, 'ready'),
          ),
        );

      return conceptMap({
        userId: user.id,
        sourceIds: ready.map((s) => s.id),
        maxSections: env.ai.CONCEPT_MAP_MAX_SECTIONS,
      });
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )

  // ── suggest-sources (Р11, N4 §3) ──────────────────────────────────────────────
  // Recommend other library sources near the notebook's centroid (AVG of a sample
  // of its document vectors) — vectors-only, document-guarded. Attached sources are
  // BOTH the centroid AND the exclusion set; candidates are user-scoped `ready`.
  // foreign notebook → 404; nothing to suggest / no vectors → `{items:[], reason?}`.
  .get(
    '/:id/suggest-sources',
    async ({ user, params, status }) => {
      const [nb] = await db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.id, params.id), eq(notebooks.userId, user.id)))
        .limit(1);
      if (!nb) return status(404, { error: 'not_found' });

      // ALL attached sources (any status) — they form the centroid + exclusion.
      const attached = await db
        .select({ id: notebookSources.sourceId })
        .from(notebookSources)
        .where(
          and(
            eq(notebookSources.userId, user.id),
            eq(notebookSources.notebookId, params.id),
          ),
        );

      return suggestSources({
        userId: user.id,
        attachedSourceIds: attached.map((s) => s.id),
      });
    },
    { auth: true, params: t.Object({ id: t.String({ format: 'uuid' }) }) },
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

      // Cooldown the paid formulate AFTER ownership (foreign id never arms it),
      // before the call. A failed call keeps the cooldown armed (anti retry-storm).
      const cd = cooldownCheck(`suggest:${params.id}`, AI_COOLDOWN_MS.suggestCard);
      if (!cd.ok) return status(429, { error: 'cooldown', retryAfterMs: cd.retryAfterMs });

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

/**
 * Bump `notebooks.updated_at` inside the caller's tx (Р15 — any note/artifact/
 * attach mutation marks the notebook active so the grid sorts by activity).
 * user-scoped (a foreign notebook simply touches zero rows).
 *
 * Monotonic on the Postgres clock: the row's previous stamp comes from a DB
 * DEFAULT now(), so a host-side `new Date()` can land BEHIND it when the
 * Docker-VM clock drifts from the host's (the same skew persistTranscript
 * anchors against). GREATEST(now(), prev + 1ms) guarantees the bump always
 * moves the stamp forward regardless of which clock is ahead.
 */
async function bumpNotebookUpdatedAt(tx: Tx, userId: string, notebookId: string): Promise<void> {
  await tx
    .update(notebooks)
    .set({
      updatedAt: sql`GREATEST(now(), ${notebooks.updatedAt} + interval '1 millisecond')`,
    })
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, userId)));
}
