import { Elysia, t } from 'elysia';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { achievements, cards, db, decks, profile, reviews, type Review } from '@neuronexus/db';
import {
  ANKI_DEFAULTS,
  applyGradeRollup,
  gradeFsrs,
  isLeech,
  stateLabel,
  State,
  type AchievementCode,
  xpForRating,
  type FsrsCard,
} from '@neuronexus/shared';
import { authPlugin } from '../auth-plugin.ts';
import { apiErrorBody, getRequestLogger, requestFields } from '../logger.ts';

const stateFromLabel: Record<string, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

type ReviewGradeBody = {
  cardId: string;
  rating: 1 | 2 | 3 | 4;
  durationMs?: number;
  attemptKey?: string;
};

type DbExecutor = Pick<typeof db, 'insert' | 'select' | 'update'>;

async function ensureProfileRow(
  executor: DbExecutor,
  user: { id: string; name?: string | null },
) {
  await executor
    .insert(profile)
    .values({ userId: user.id, name: user.name ?? 'Friend' })
    .onConflictDoNothing();
  const [row] = await executor.select().from(profile).where(eq(profile.userId, user.id)).limit(1);
  if (!row) throw new Error('profile not found after ensure');
  return row;
}

async function findReviewAttempt(executor: Pick<typeof db, 'select'>, userId: string, attemptKey: string) {
  const [row] = await executor
    .select()
    .from(reviews)
    .where(and(eq(reviews.userId, userId), eq(reviews.attemptKey, attemptKey)))
    .limit(1);
  return row ?? null;
}

function matchesAttemptPayload(review: { cardId: string; rating: number; durationMs: number }, body: ReviewGradeBody) {
  return (
    review.cardId === body.cardId
    && review.rating === body.rating
    && review.durationMs === (body.durationMs ?? 0)
  );
}

async function buildReplayOutcome(
  executor: Pick<typeof db, 'select'>,
  userId: string,
  review: Review,
) {
  const [card, profileRow] = await Promise.all([
    executor.select().from(cards).where(eq(cards.id, review.cardId)).limit(1),
    executor.select().from(profile).where(eq(profile.userId, userId)).limit(1),
  ]);

  if (!card[0]) {
    throw new Error(`review replay missing card ${review.cardId}`);
  }

  return {
    card: card[0],
    review,
    profile: profileRow[0] ?? null,
    leeched: false,
    newAchievements: [] as AchievementCode[],
    freezeUsed: false,
    dailyGoalJustMet: false,
  };
}

function isAttemptKeyUniqueViolation(err: unknown) {
  if (!err || typeof err !== 'object') return false;
  const code = 'code' in err ? String(err.code ?? '') : '';
  const constraint = 'constraint' in err ? String(err.constraint ?? '') : '';
  const detail = 'detail' in err ? String(err.detail ?? '') : '';
  return (
    code === '23505'
    && (
      constraint === 'reviews_user_attempt_key_idx'
      || detail.includes('reviews_user_attempt_key_idx')
      || detail.includes('(user_id, attempt_key)')
    )
  );
}

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
    async ({ user, body, status, store }) => {
      const log = getRequestLogger(store);
      const now = new Date();
      const gradeBody = body as ReviewGradeBody;
      const attemptKey = gradeBody.attemptKey ?? crypto.randomUUID();

      const existingAttempt = await findReviewAttempt(db, user.id, attemptKey);
      if (existingAttempt) {
        if (!matchesAttemptPayload(existingAttempt, gradeBody)) {
          log.warn(
            requestFields(store, {
              errorCode: 'REVIEW_ATTEMPT_CONFLICT',
              userId: user.id,
              attemptKey,
              cardId: gradeBody.cardId,
              existingCardId: existingAttempt.cardId,
            }),
            'reviews.grade.attempt_conflict',
          );
          return status(
            409,
            apiErrorBody(
              store,
              'REVIEW_ATTEMPT_CONFLICT',
              'Attempt key was already used for a different review payload.',
            ),
          );
        }

        log.info(
          requestFields(store, {
            userId: user.id,
            attemptKey,
            cardId: existingAttempt.cardId,
            reviewId: existingAttempt.id,
          }),
          'reviews.grade.replayed',
        );
        return buildReplayOutcome(db, user.id, existingAttempt);
      }

      try {
        const outcome = await db.transaction(async (tx) => {
          const [card] = await tx
            .select()
            .from(cards)
            .where(and(eq(cards.id, gradeBody.cardId), eq(cards.userId, user.id)))
            .limit(1);
          if (!card) {
            log.warn(
              requestFields(store, {
                errorCode: 'REVIEW_CARD_NOT_FOUND',
                userId: user.id,
                cardId: gradeBody.cardId,
              }),
              'reviews.grade.card_not_found',
            );
            return status(404, apiErrorBody(store, 'REVIEW_CARD_NOT_FOUND', 'Card not found.'));
          }
          if (card.suspended) {
            log.warn(
              requestFields(store, {
                errorCode: 'REVIEW_CARD_SUSPENDED',
                userId: user.id,
                cardId: card.id,
                deckId: card.deckId,
              }),
              'reviews.grade.card_suspended',
            );
            return status(
              409,
              apiErrorBody(store, 'REVIEW_CARD_SUSPENDED', 'Card is suspended.'),
            );
          }

          const existingProfile = await ensureProfileRow(tx, user);
          const requestRetention =
            existingProfile.desiredRetention ?? ANKI_DEFAULTS.requestRetention;

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
          const res = gradeFsrs(fsrsCard, gradeBody.rating, now, { requestRetention });

          // Leech detection — auto-suspend once threshold crossed.
          const nowLeech = isLeech(res.card.lapses);
          const shouldSuspend = nowLeech && !isLeech(card.lapses);

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
              rating: gradeBody.rating,
              durationMs: gradeBody.durationMs ?? 0,
              attemptKey,
              reviewedAt: now,
              nextDue: new Date(res.card.due),
              nextStability: res.card.stability,
              nextDifficulty: res.card.difficulty,
            })
            .returning();

          // Stats snapshot for the achievement evaluator. Total reviews is the
          // post-insert count; deck count is also snapshotted here so e.g.
          // the "polyglot" achievement fires on the first grade after creating
          // the 3rd deck.
          let updatedProfile: typeof profile.$inferSelect | null = existingProfile;
          let newAchievementCodes: AchievementCode[] = [];
          let freezeUsed = false;
          let dailyGoalJustMet = false;

          const [totalReviewsRow] = await tx
            .select({ n: count() })
            .from(reviews)
            .where(eq(reviews.userId, user.id));
          const [deckCountRow] = await tx
            .select({ n: count() })
            .from(decks)
            .where(eq(decks.userId, user.id));
          const existingUnlocks = await tx
            .select({ code: achievements.code })
            .from(achievements)
            .where(and(eq(achievements.userId, user.id), sql`${achievements.unlockedAt} IS NOT NULL`));

          const rollup = applyGradeRollup({
            rating: gradeBody.rating,
            durationMs: gradeBody.durationMs ?? 0,
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
              unlockedSpecies: existingProfile.unlockedSpecies,
            },
            stats: {
              streak: existingProfile.streakDays, // overwritten by rollup
              totalReviews: totalReviewsRow?.n ?? 0,
              deckCount: deckCountRow?.n ?? 0,
              level: existingProfile.level,
              plantStage: existingProfile.plantStage,
              dailyGoalMetCount: existingProfile.dailyGoalMetCount, // overwritten
            },
            alreadyUnlocked: existingUnlocks.map((r) => r.code),
            ratingXp: xpForRating(gradeBody.rating),
          });

          freezeUsed = rollup.freezeUsed;
          dailyGoalJustMet = rollup.dailyGoalJustMet;
          newAchievementCodes = rollup.newAchievements.map((a) => a.code);

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
              unlockedSpecies: rollup.unlockedSpecies,
              updatedAt: now,
            })
            .where(eq(profile.userId, user.id))
            .returning();
          updatedProfile = saved ?? null;

          // Persist newly-unlocked achievements. Upsert with unlockedAt=now.
          if (rollup.newAchievements.length > 0) {
            await tx
              .insert(achievements)
              .values(
                rollup.newAchievements.map((a) => ({
                  userId: user.id,
                  code: a.code,
                  unlockedAt: now,
                  progress: a.def.target,
                })),
              )
              .onConflictDoUpdate({
                target: [achievements.userId, achievements.code],
                set: { unlockedAt: now },
              });
          }

          return {
            card: updatedCard,
            review,
            profile: updatedProfile,
            leeched: shouldSuspend,
            newAchievements: newAchievementCodes,
            freezeUsed,
            dailyGoalJustMet,
          };
        });
        if (outcome && typeof outcome === 'object' && 'review' in outcome && 'card' in outcome) {
          const diagnostics = outcome as {
            card: { id: string; deckId: string; state: string };
            review: { id: string };
            leeched: boolean;
            newAchievements: string[];
          };
          log.info(
            requestFields(store, {
              userId: user.id,
              cardId: diagnostics.card.id,
              deckId: diagnostics.card.deckId,
              reviewId: diagnostics.review.id,
              rating: gradeBody.rating,
              leeched: diagnostics.leeched,
              newAchievementCount: diagnostics.newAchievements.length,
              nextState: diagnostics.card.state,
            }),
            'reviews.grade.succeeded',
          );
        }
        return outcome;
      } catch (err) {
        if (isAttemptKeyUniqueViolation(err)) {
          const replay = await findReviewAttempt(db, user.id, attemptKey);
          if (replay) {
            if (!matchesAttemptPayload(replay, gradeBody)) {
              log.warn(
                requestFields(store, {
                  errorCode: 'REVIEW_ATTEMPT_CONFLICT',
                  userId: user.id,
                  attemptKey,
                  cardId: gradeBody.cardId,
                  existingCardId: replay.cardId,
                }),
                'reviews.grade.attempt_conflict_after_unique_violation',
              );
              return status(
                409,
                apiErrorBody(
                  store,
                  'REVIEW_ATTEMPT_CONFLICT',
                  'Attempt key was already used for a different review payload.',
                ),
              );
            }
            log.info(
              requestFields(store, {
                userId: user.id,
                attemptKey,
                cardId: replay.cardId,
                reviewId: replay.id,
              }),
              'reviews.grade.replayed_after_conflict',
            );
            return buildReplayOutcome(db, user.id, replay);
          }
        }
        log.error(
          requestFields(store, {
            errorCode: 'REVIEW_TRANSACTION_FAILED',
            userId: user.id,
            attemptKey,
            cardId: gradeBody.cardId,
            rating: gradeBody.rating,
            err,
          }),
          'reviews.grade.failed',
        );
        throw err;
      }
    },
    {
      auth: true,
      body: t.Object({
        cardId: t.String({ format: 'uuid' }),
        rating: t.Union([t.Literal(1), t.Literal(2), t.Literal(3), t.Literal(4)]),
        durationMs: t.Optional(t.Integer({ minimum: 0 })),
        attemptKey: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
      }),
    },
  );
