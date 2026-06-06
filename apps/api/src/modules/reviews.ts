import { Elysia, t } from 'elysia';
import { and, count, desc, eq, gte } from 'drizzle-orm';
import { cards, db, deckOptionsPreset, decks, profile, reviews } from '@neuronexus/db';
import {
  applyGradeRollup,
  gradeFsrs,
  isLeech,
  nextDailyCounts,
  stateLabel,
  State,
  todayISO,
  xpForRating,
  type FsrsCard,
} from '@neuronexus/shared';
import { authPlugin } from '../auth-plugin.ts';
import { resolveDeckConfig } from './deck-config.ts';

const stateFromLabel: Record<string, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

export const reviewsModule = new Elysia({ prefix: '/reviews' })
  .use(authPlugin)
  // List reviews for the current user, optionally filtered by a since-timestamp
  // (epoch ms or ISO string). Default: last 90 days, most recent first.
  .get(
    '/',
    async ({ user, query }) => {
      const since = query.since
        ? new Date(/^\d+$/.test(query.since) ? Number(query.since) : query.since)
        : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const rows = await db
        .select()
        .from(reviews)
        .where(and(eq(reviews.userId, user.id), gte(reviews.reviewedAt, since)))
        .orderBy(desc(reviews.reviewedAt));
      return rows;
    },
    { auth: true, query: t.Object({ since: t.Optional(t.String()) }) },
  )
  // Total review count (used by achievements screen).
  .get(
    '/count',
    async ({ user }) => {
      const [row] = await db
        .select({ n: count() })
        .from(reviews)
        .where(eq(reviews.userId, user.id));
      return { count: row?.n ?? 0 };
    },
    { auth: true },
  )
  .post(
    '/',
    async ({ user, body, status }) => {
      const now = new Date();
      return await db.transaction(async (tx) => {
        const [card] = await tx
          .select()
          .from(cards)
          .where(and(eq(cards.id, body.cardId), eq(cards.userId, user.id)))
          .limit(1);
        if (!card) return status(404, { error: 'card_not_found' });
        if (card.suspended) return status(409, { error: 'card_suspended' });

        const [existingProfile] = await tx
          .select()
          .from(profile)
          .where(eq(profile.userId, user.id))
          .limit(1);

        // Snapshot for the per-deck config resolver (Principle 1): two batched
        // reads — the user's decks + presets — so `resolveDeckConfig` runs
        // synchronously with ZERO extra round-trips inside this transaction.
        const userDecks = await tx.select().from(decks).where(eq(decks.userId, user.id));
        const userPresets = await tx
          .select()
          .from(deckOptionsPreset)
          .where(eq(deckOptionsPreset.userId, user.id));
        const presetsById = new Map(userPresets.map((p) => [p.id, p]));
        const cfg = resolveDeckConfig(card.deckId, {
          userDecks,
          presetsById,
          profile: existingProfile ?? null,
        });

        // PRE-grade state — classifies new-introduction vs review for the
        // daily counters BEFORE the FSRS step mutates `state`.
        const wasNew = card.state === 'new';

        // FSRS step
        const fsrsCard: FsrsCard = {
          due: card.due,
          stability: card.stability,
          difficulty: card.difficulty,
          elapsed_days: card.elapsedDays,
          scheduled_days: card.scheduledDays,
          learning_steps: card.learningSteps,
          reps: card.reps,
          lapses: card.lapses,
          state: stateFromLabel[card.state] ?? State.New,
          last_review: card.lastReview ?? undefined,
        };
        const res = gradeFsrs(fsrsCard, body.rating, now, {
          requestRetention: cfg.desiredRetention,
          learningSteps: cfg.learningSteps,
          relearningSteps: cfg.relearningSteps,
          maximumInterval: cfg.maximumInterval,
        });

        // Leech detection — auto-suspend once the resolved threshold crossed.
        const nowLeech = isLeech(res.card.lapses, cfg.leechThreshold);
        const shouldSuspend = nowLeech && !isLeech(card.lapses, cfg.leechThreshold);

        const [updatedCard] = await tx
          .update(cards)
          .set({
            due: new Date(res.card.due),
            stability: res.card.stability,
            difficulty: res.card.difficulty,
            elapsedDays: res.card.elapsed_days,
            scheduledDays: res.card.scheduled_days,
            learningSteps: res.card.learning_steps,
            reps: res.card.reps,
            lapses: res.card.lapses,
            state: stateLabel(res.card.state),
            lastReview: now,
            updatedAt: now,
            ...(shouldSuspend ? { suspended: true } : {}),
          })
          .where(eq(cards.id, card.id))
          .returning();

        const [review] = await tx
          .insert(reviews)
          .values({
            userId: user.id,
            cardId: card.id,
            deckId: card.deckId,
            rating: body.rating,
            durationMs: body.durationMs ?? 0,
            reviewedAt: now,
            nextDue: new Date(res.card.due),
            nextStability: res.card.stability,
            nextDifficulty: res.card.difficulty,
          })
          .returning();

        // ── gamification rollup ────────────────────────────────────────
        // Streak / freeze / today-minutes / daily-goal / XP / level / plant
        // stage fold into a new profile snapshot. (Achievements were removed.)
        let updatedProfile = existingProfile ?? null;
        let freezeUsed = false;
        let dailyGoalJustMet = false;

        if (existingProfile) {
          const rollup = applyGradeRollup({
            durationMs: body.durationMs ?? 0,
            now,
            previous: {
              streakDays: existingProfile.streakDays,
              streakFreezes: existingProfile.streakFreezes,
              lastReviewDate: existingProfile.lastReviewDate,
              todayMinutes: existingProfile.todayMinutes,
              todayMinutesDate: existingProfile.todayMinutesDate,
              dailyGoalMinutes: existingProfile.dailyGoalMinutes,
              dailyGoalMetCount: existingProfile.dailyGoalMetCount,
              dailyGoalMetDate: existingProfile.dailyGoalMetDate,
              xp: existingProfile.xp,
            },
            ratingXp: xpForRating(body.rating),
          });

          freezeUsed = rollup.freezeUsed;
          dailyGoalJustMet = rollup.dailyGoalJustMet;

          // Daily counters (GLOBAL, Decision 2/3). Only REGULAR grades consume
          // the per-day budget; filtered/cram grades leave the columns as-is.
          // Folded into THIS profile update — same read-modify-write shape as
          // the todayMinutes ledger; no separate statement, one transaction.
          const dailyCounts =
            body.source === 'filtered'
              ? null
              : nextDailyCounts({
                  previousNew: existingProfile.newIntroducedToday,
                  previousReviews: existingProfile.reviewsDoneToday,
                  previousDate: existingProfile.dailyCountsDate,
                  today: todayISO(now),
                  introducedNew: wasNew,
                });

          const [saved] = await tx
            .update(profile)
            .set({
              streakDays: rollup.streakDays,
              streakFreezes: rollup.streakFreezes,
              lastReviewDate: rollup.lastReviewDate,
              todayMinutes: rollup.todayMinutes,
              todayMinutesDate: rollup.todayMinutesDate,
              dailyGoalMetCount: rollup.dailyGoalMetCount,
              dailyGoalMetDate: rollup.dailyGoalMetDate ?? null,
              xp: rollup.xp,
              level: rollup.level,
              plantStage: rollup.plantStage,
              ...(dailyCounts
                ? {
                    newIntroducedToday: dailyCounts.newIntroducedToday,
                    reviewsDoneToday: dailyCounts.reviewsDoneToday,
                    dailyCountsDate: dailyCounts.date,
                  }
                : {}),
              updatedAt: now,
            })
            .where(eq(profile.userId, user.id))
            .returning();
          updatedProfile = saved ?? null;
        }

        return {
          card: updatedCard,
          review,
          profile: updatedProfile,
          leeched: shouldSuspend,
          freezeUsed,
          dailyGoalJustMet,
        };
      });
    },
    {
      auth: true,
      body: t.Object({
        cardId: t.String({ format: 'uuid' }),
        rating: t.Union([t.Literal(1), t.Literal(2), t.Literal(3), t.Literal(4)]),
        durationMs: t.Optional(t.Integer({ minimum: 0 })),
        // Grade origin: 'filtered' (custom-study / cram) grades skip the GLOBAL
        // daily counters so a cram run never blocks the regular queue. Default
        // ('regular' / omitted) consumes the daily budget.
        source: t.Optional(t.Union([t.Literal('regular'), t.Literal('filtered')])),
      }),
    },
  );
