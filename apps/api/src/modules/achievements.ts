import { Elysia } from 'elysia';
import { and, count, desc, eq, isNotNull } from 'drizzle-orm';
import { achievements, cards, db, decks, profile, reviews } from '@neuronexus/db';
import {
  ACHIEVEMENT_CODES,
  ACHIEVEMENTS,
  evaluateAchievements,
  type AchievementCode,
  type AchievementDef,
  type AchievementStats,
} from '@neuronexus/shared';
import { authPlugin } from '../auth-plugin.ts';

// The catalog uses `as const`, so each entry has a narrow literal shape —
// widen it here to the shared AchievementDef so `reward` is optional rather
// than missing.
type AchievementDefShape = AchievementDef;

export const achievementsModule = new Elysia({ prefix: '/achievements' })
  .use(authPlugin)
  // Catalog — static, safe to cache client-side. Used by the achievements
  // screen to render locked definitions (title, description, reward).
  .get('/catalog', () => ACHIEVEMENTS, { auth: true })
  // User's progress: every catalog code with optional unlockedAt, plus a
  // derived `progress` value that the UI uses for partial-completion bars.
  .get(
    '/',
    async ({ user }) => {
      const rows = await db
        .select()
        .from(achievements)
        .where(eq(achievements.userId, user.id));
      const byCode = new Map(rows.map((r) => [r.code as AchievementCode, r]));

      // Recompute a stats snapshot once so the UI can show partial progress
      // for not-yet-unlocked achievements in the same payload.
      const [prof] = await db
        .select()
        .from(profile)
        .where(eq(profile.userId, user.id))
        .limit(1);
      const [{ n: totalReviews } = { n: 0 }] = await db
        .select({ n: count() })
        .from(reviews)
        .where(eq(reviews.userId, user.id));
      const [{ n: deckCount } = { n: 0 }] = await db
        .select({ n: count() })
        .from(decks)
        .where(eq(decks.userId, user.id));

      const stats: AchievementStats = {
        streak: prof?.streakDays ?? 0,
        totalReviews,
        deckCount,
        level: prof?.level ?? 1,
        plantStage: prof?.plantStage ?? 0,
        dailyGoalMetCount: prof?.dailyGoalMetCount ?? 0,
      };

      // The evaluator surfaces codes that are _currently satisfied_ — useful
      // if a grade handler skipped persistence for some reason. We don't
      // write here; /reviews is the only place that mutates achievements.
      const unlockedNowCodes = new Set(
        evaluateAchievements(stats, []).map((u) => u.code),
      );

      return ACHIEVEMENT_CODES.map((code) => {
        const def = ACHIEVEMENTS[code] as AchievementDefShape;
        const row = byCode.get(code);
        const target = def.target;
        const current = Math.min(target, currentValue(def.kind, stats));
        return {
          code,
          title: def.title,
          description: def.description,
          kind: def.kind,
          target,
          progress: current,
          pct: Math.min(1, current / Math.max(1, target)),
          unlockedAt: row?.unlockedAt ?? null,
          // Currently satisfied but not yet persisted — rare (only happens if
          // /reviews didn't fire for some reason). UI shows it as "claim me".
          eligible: row?.unlockedAt ? false : unlockedNowCodes.has(code),
          reward: def.reward ?? null,
        };
      });
    },
    { auth: true },
  )
  // Lightweight summary for the home banner.
  .get(
    '/summary',
    async ({ user }) => {
      const [{ n: unlockedCount } = { n: 0 }] = await db
        .select({ n: count() })
        .from(achievements)
        .where(and(eq(achievements.userId, user.id), isNotNull(achievements.unlockedAt)));
      const recent = await db
        .select()
        .from(achievements)
        .where(and(eq(achievements.userId, user.id), isNotNull(achievements.unlockedAt)))
        .orderBy(desc(achievements.unlockedAt))
        .limit(3);
      return {
        unlocked: unlockedCount,
        total: ACHIEVEMENT_CODES.length,
        recent: recent.map((r) => ({
          code: r.code,
          unlockedAt: r.unlockedAt,
        })),
      };
    },
    { auth: true },
  );

function currentValue(
  kind: AchievementDef['kind'],
  stats: AchievementStats,
): number {
  switch (kind) {
    case 'streak':
      return stats.streak;
    case 'reviews':
      return stats.totalReviews;
    case 'decks':
      return stats.deckCount;
    case 'level':
      return stats.level;
    case 'garden':
      return stats.plantStage;
    case 'dailyGoalStreak':
      return stats.dailyGoalMetCount;
  }
}

void cards;
