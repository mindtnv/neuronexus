// Progress aggregation helpers for the agent's READ progress-tools (S4 / AC1.1,
// AC1.2, AC1.5). User-scoped — every query carries `user_id` as the MANDATORY
// FIRST conjunct (Principle 4), the only cross-user boundary on these reads.
//
// `studyStats` is the only genuinely new server capability in this milestone: a
// single GROUP BY `date_trunc('day', reviewed_at)` over `reviews`, plus (for the
// global scope) a `profile` read for streak/level/xp. `cardProgress` reads the
// card's flat FSRS columns + its last-N review history (scoped by BOTH cardId AND
// userId — defense-in-depth even though the card is loaded user-scoped, M4).
//
// Neither helper throws for an empty history: an account with no reviews returns
// `reviewCount:0` + `retentionPct:null` (the "no reviews yet" render case), and a
// foreign/missing card returns `null`. The tool wrappers in ai/tools.ts turn
// these into graceful `ToolResult`s (never an error into the loop, Principle 5).

import { and, desc, eq, sql } from 'drizzle-orm';
import { cards, db, profile as profileTable, reviews } from '@neuronexus/db';

/** Clamp the heatmap/aggregation window. undefined → 30; <1 → 1; >365 → 365. */
export function clampDays(days: number | undefined): number {
  if (days === undefined || !Number.isFinite(days)) return 30;
  const floored = Math.floor(days);
  return Math.max(1, Math.min(floored, 365));
}

export interface StudyStatsArgs {
  userId: string;
  scope: 'global' | 'deck';
  /** Resolved deck subtree (deck + descendants). Empty/undefined ⇒ no deck filter. */
  deckIds?: string[];
  days?: number;
}

export interface StudyStatsResult {
  reviewCount: number;
  /** % of reviews graded >= 3 (Hard counts as a lapse-avoiding "remembered"). NULL when no reviews. */
  retentionPct: number | null;
  studyMinutes: number;
  days: number;
  /** Day-bucketed counts (date_trunc('day', reviewed_at)::date), oldest-first. */
  heatmap: { day: string; count: number }[];
  /** Global scope only — the user's gamification snapshot. */
  profile?: { streakDays: number; level: number; xp: number } | null;
}

interface HeatmapRow {
  day: Date | string;
  cnt: number | string;
  remembered: number | string;
  duration: number | string | null;
}

/**
 * User-scoped study aggregates over the last `days` (default 30, clamped 1..365).
 * ONE GROUP BY query. For `scope:'deck'` an empty `deckIds` resolves to a scope
 * that matches no rows (an un-owned/foreign deck yields no reviews — NOT a global
 * fallback). For `scope:'global'` also reads the profile streak/level/xp.
 */
export async function studyStats(args: StudyStatsArgs): Promise<StudyStatsResult> {
  const userId = args.userId;
  const days = clampDays(args.days);
  const deckScoped = args.scope === 'deck';

  // user_id is the mandatory FIRST conjunct; the window + (optional) deck filter
  // are ADDITIONAL predicates. For a deck scope with no resolved ids, force an
  // empty result set (`reviews.deck_id IN (NULL)` is never true) so a foreign
  // deck returns "no reviews" rather than silently going global.
  const conds = [
    sql`user_id = ${userId}`,
    sql`reviewed_at >= now() - ${`${days} days`}::interval`,
  ];
  if (deckScoped) {
    const ids = args.deckIds ?? [];
    if (ids.length === 0) {
      conds.push(sql`false`);
    } else {
      const list = sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      );
      conds.push(sql`deck_id IN (${list})`);
    }
  }
  const where = sql.join(conds, sql` AND `);

  const rows = (await db.execute(sql`
    SELECT
      date_trunc('day', reviewed_at)::date AS day,
      count(*)                              AS cnt,
      sum(CASE WHEN rating >= 3 THEN 1 ELSE 0 END) AS remembered,
      sum(duration_ms)                      AS duration
    FROM reviews
    WHERE ${where}
    GROUP BY 1
    ORDER BY 1
  `)) as unknown as HeatmapRow[];

  let reviewCount = 0;
  let remembered = 0;
  let durationMs = 0;
  const heatmap: { day: string; count: number }[] = [];
  for (const r of rows) {
    const cnt = Number(r.cnt);
    reviewCount += cnt;
    remembered += Number(r.remembered);
    durationMs += Number(r.duration ?? 0);
    // `day` comes back as a Date (timestamptz cast) or an ISO string depending on
    // the driver — normalize to a yyyy-mm-dd string.
    const day = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10);
    heatmap.push({ day, count: cnt });
  }

  const retentionPct =
    reviewCount > 0 ? Math.round((remembered / reviewCount) * 100) : null;
  const studyMinutes = Math.round(durationMs / 60000);

  let profile: StudyStatsResult['profile'] = undefined;
  if (!deckScoped) {
    const [p] = await db
      .select({
        streakDays: profileTable.streakDays,
        level: profileTable.level,
        xp: profileTable.xp,
      })
      .from(profileTable)
      .where(eq(profileTable.userId, userId))
      .limit(1);
    profile = p ?? null;
  }

  return { reviewCount, retentionPct, studyMinutes, days, heatmap, profile };
}

export interface CardProgressResult {
  cardId: string;
  state: string;
  reps: number;
  lapses: number;
  due: string; // ISO
  stability: number;
  difficulty: number;
  lastReview: string | null; // ISO | null
  suspended: boolean;
  recent: { rating: number; reviewedAt: string }[];
}

/**
 * Load a card's FSRS scheduling state + its last-`n` reviews — both user-scoped.
 * The card is loaded `and(eq(id), eq(userId))`; the reviews read is scoped by
 * BOTH cardId AND userId (P4 / M4 — `user_id` is mandatory on EVERY new query,
 * defense-in-depth even though the card is already owned). Returns `null` for a
 * foreign/missing card (the tool turns that into a graceful result, not a throw).
 */
export async function cardProgress(
  userId: string,
  cardId: string,
  n = 10,
): Promise<CardProgressResult | null> {
  const [card] = await db
    .select({
      id: cards.id,
      state: cards.state,
      reps: cards.reps,
      lapses: cards.lapses,
      due: cards.due,
      stability: cards.stability,
      difficulty: cards.difficulty,
      lastReview: cards.lastReview,
      suspended: cards.suspended,
    })
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.userId, userId)))
    .limit(1);
  if (!card) return null;

  const recentRows = await db
    .select({ rating: reviews.rating, reviewedAt: reviews.reviewedAt })
    .from(reviews)
    .where(and(eq(reviews.cardId, cardId), eq(reviews.userId, userId)))
    .orderBy(desc(reviews.reviewedAt))
    .limit(n);

  return {
    cardId: card.id,
    state: card.state,
    reps: card.reps,
    lapses: card.lapses,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    lastReview: card.lastReview ? card.lastReview.toISOString() : null,
    suspended: card.suspended,
    recent: recentRows.map((r) => ({ rating: r.rating, reviewedAt: r.reviewedAt.toISOString() })),
  };
}
