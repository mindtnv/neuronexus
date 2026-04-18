// Gamification core. Pure functions — no DB, no clock — so they trivially
// port between server (grade transaction) and client (home banner previews).
//
// The server calls `applyGradeRollup` inside the /reviews transaction: it
// rolls streak, freezes, today-minutes, and daily-goal into a new profile
// shape, and returns the list of newly-unlocked achievement codes (with any
// species rewards to grant). The response goes back to the client, which
// plays a toast/animation for each code.

import type { Rating } from './fsrs.ts';
import { nextStreak as nextStreakRaw, plantStageFromStreak, todayISO } from './fsrs.ts';

// ── plant species catalog ──────────────────────────────────────────────────
// Kept in sync with the Postgres enum in packages/db/src/schema/app.ts.

export const PLANT_SPECIES = [
  'fern',
  'cactus',
  'succulent',
  'bonsai',
  'sakura',
  'mushroom',
] as const;
export type PlantSpecies = (typeof PLANT_SPECIES)[number];

// ── achievement catalog ─────────────────────────────────────────────────────
// One source of truth for titles, thresholds, and rewards. The server awards
// achievements by matching `kind` against a stat; the client reads the same
// catalog to render locked/unlocked lists and reward tooltips.

export type AchievementKind =
  | 'streak'
  | 'reviews'
  | 'decks'
  | 'level'
  | 'garden' // plantStage
  | 'dailyGoalStreak';

export interface AchievementReward {
  /** Extra streak freezes granted on unlock. Summed with existing, capped. */
  streakFreezes?: number;
  /** Plant species unlocked on earn. Added to profile.unlockedSpecies. */
  species?: PlantSpecies[];
  /** Bonus XP awarded on unlock. */
  xp?: number;
}

export interface AchievementDef {
  code: string;
  kind: AchievementKind;
  target: number;
  title: string;
  description: string;
  reward?: AchievementReward;
}

export const ACHIEVEMENTS = {
  // ── streak milestones ─────────────────────────────────────────────────
  streak7: {
    code: 'streak7',
    kind: 'streak',
    target: 7,
    title: 'Week runner',
    description: 'Study 7 days in a row.',
    reward: { streakFreezes: 1, xp: 50 },
  },
  streak30: {
    code: 'streak30',
    kind: 'streak',
    target: 30,
    title: 'Monthly devotee',
    description: '30-day streak — you showed up every day.',
    reward: { streakFreezes: 2, species: ['sakura'], xp: 200 },
  },
  streak100: {
    code: 'streak100',
    kind: 'streak',
    target: 100,
    title: 'Centurion',
    description: '100 consecutive days.',
    reward: { streakFreezes: 3, species: ['bonsai'], xp: 500 },
  },
  streak365: {
    code: 'streak365',
    kind: 'streak',
    target: 365,
    title: 'Year of study',
    description: 'A full year on the wagon.',
    reward: { species: ['mushroom'], xp: 2000 },
  },

  // ── volume ────────────────────────────────────────────────────────────
  reviews100: {
    code: 'reviews100',
    kind: 'reviews',
    target: 100,
    title: 'Getting started',
    description: '100 cards reviewed.',
    reward: { xp: 25 },
  },
  reviews1000: {
    code: 'reviews1000',
    kind: 'reviews',
    target: 1000,
    title: 'Seasoned',
    description: '1 000 reviews.',
    reward: { xp: 150, species: ['succulent'] },
  },
  reviews10000: {
    code: 'reviews10000',
    kind: 'reviews',
    target: 10000,
    title: 'Scholar',
    description: '10 000 reviews — the card count of a dedicated mind.',
    reward: { xp: 1000 },
  },

  // ── breadth ───────────────────────────────────────────────────────────
  decks3: {
    code: 'decks3',
    kind: 'decks',
    target: 3,
    title: 'Polyglot',
    description: 'Keep 3 decks active.',
    reward: { xp: 50 },
  },
  decks10: {
    code: 'decks10',
    kind: 'decks',
    target: 10,
    title: 'Renaissance',
    description: '10 decks across disciplines.',
    reward: { xp: 200 },
  },

  // ── level ─────────────────────────────────────────────────────────────
  level5: {
    code: 'level5',
    kind: 'level',
    target: 5,
    title: 'Sapling',
    description: 'Reach level 5.',
    reward: { species: ['cactus'] },
  },
  level10: {
    code: 'level10',
    kind: 'level',
    target: 10,
    title: 'Sprout',
    description: 'Reach level 10.',
    reward: { xp: 100 },
  },
  level20: {
    code: 'level20',
    kind: 'level',
    target: 20,
    title: 'Bloom',
    description: 'Reach level 20.',
    reward: { species: ['bonsai'], xp: 500 },
  },

  // ── garden / plant stage ──────────────────────────────────────────────
  garden3: {
    code: 'garden3',
    kind: 'garden',
    target: 3,
    title: 'Three-leaf clover',
    description: 'Your plant reaches stage 3.',
  },
  garden5: {
    code: 'garden5',
    kind: 'garden',
    target: 5,
    title: 'Full bloom',
    description: 'Plant fully grown.',
    reward: { species: ['sakura'] },
  },

  // ── dailies ───────────────────────────────────────────────────────────
  dailyGoal7: {
    code: 'dailyGoal7',
    kind: 'dailyGoalStreak',
    target: 7,
    title: 'Perfect week',
    description: 'Meet your daily goal 7 days in a row.',
    reward: { streakFreezes: 1, xp: 75 },
  },
  dailyGoal30: {
    code: 'dailyGoal30',
    kind: 'dailyGoalStreak',
    target: 30,
    title: 'Habit formed',
    description: 'Meet your daily goal 30 times.',
    reward: { streakFreezes: 2, xp: 300 },
  },
} as const satisfies Record<string, AchievementDef>;

export type AchievementCode = keyof typeof ACHIEVEMENTS;
export const ACHIEVEMENT_CODES = Object.keys(ACHIEVEMENTS) as AchievementCode[];

// ── constants ───────────────────────────────────────────────────────────────

export const MAX_STREAK_FREEZES = 5;

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Streak progression that considers freezes. Called once per grade with the
 * previous profile state and today's date. Returns the updated streak count,
 * updated freeze count, and whether a freeze was consumed.
 *
 *   - Same day   → streak unchanged, freeze unchanged
 *   - Yesterday  → streak + 1
 *   - One gap    → consume 1 freeze if available (streak continues), else reset
 *   - Multi-gap  → reset regardless (freezes only cover a single day)
 */
export function applyStreakWithFreeze(opts: {
  previousStreak: number;
  previousFreezes: number;
  lastReviewDate: string | null | undefined;
  today: string;
}): { streakDays: number; streakFreezes: number; freezeUsed: boolean } {
  const { previousStreak, previousFreezes, lastReviewDate, today } = opts;

  if (lastReviewDate === today) {
    return {
      streakDays: previousStreak,
      streakFreezes: previousFreezes,
      freezeUsed: false,
    };
  }

  const yesterday = addDaysISO(today, -1);
  if (lastReviewDate === yesterday) {
    return {
      streakDays: previousStreak + 1,
      streakFreezes: previousFreezes,
      freezeUsed: false,
    };
  }

  // Exactly one gap (the day before yesterday was the last review) and we
  // have a freeze to burn.
  if (lastReviewDate && previousFreezes > 0) {
    const twoDaysAgo = addDaysISO(today, -2);
    if (lastReviewDate === twoDaysAgo) {
      return {
        streakDays: previousStreak + 1,
        streakFreezes: previousFreezes - 1,
        freezeUsed: true,
      };
    }
  }

  // Reset.
  return { streakDays: 1, streakFreezes: previousFreezes, freezeUsed: false };
}

/** Add/reset today's review minutes. Resets to 0 when a new calendar day arrives. */
export function nextTodayMinutes(opts: {
  previousMinutes: number;
  previousDate: string | null | undefined;
  today: string;
  deltaMs: number;
}): { minutes: number; date: string } {
  const { previousMinutes, previousDate, today, deltaMs } = opts;
  const deltaMinutes = Math.max(0, Math.floor(deltaMs / 60000));
  if (previousDate === today) {
    return { minutes: previousMinutes + deltaMinutes, date: today };
  }
  return { minutes: deltaMinutes, date: today };
}

/**
 * Mark the daily goal "met" for today (idempotent within a single day). If
 * the user passed the threshold, this is the first time in this session that
 * they've crossed it, and we haven't already credited today — increment
 * `dailyGoalMetCount` and stamp today's date.
 */
export function maybeStampDailyGoal(opts: {
  todayMinutes: number;
  dailyGoalMinutes: number;
  previousCount: number;
  previousDate: string | null | undefined;
  today: string;
}): { dailyGoalMetCount: number; dailyGoalMetDate: string | null; justMet: boolean } {
  const { todayMinutes, dailyGoalMinutes, previousCount, previousDate, today } = opts;
  const met = todayMinutes >= dailyGoalMinutes;
  if (!met) {
    return { dailyGoalMetCount: previousCount, dailyGoalMetDate: previousDate ?? null, justMet: false };
  }
  if (previousDate === today) {
    return { dailyGoalMetCount: previousCount, dailyGoalMetDate: today, justMet: false };
  }
  return { dailyGoalMetCount: previousCount + 1, dailyGoalMetDate: today, justMet: true };
}

/** Cap the freeze counter at the configured maximum. */
export function clampFreezes(n: number): number {
  return Math.max(0, Math.min(MAX_STREAK_FREEZES, Math.floor(n)));
}

// ── achievement evaluator ──────────────────────────────────────────────────
// Given a stats snapshot and the codes already unlocked, decide what else to
// unlock now. Pure — caller persists the returned rows.

export interface AchievementStats {
  streak: number;
  totalReviews: number;
  deckCount: number;
  level: number;
  plantStage: number;
  dailyGoalMetCount: number;
}

export interface AchievementUnlock {
  code: AchievementCode;
  def: AchievementDef;
}

export function evaluateAchievements(
  stats: AchievementStats,
  alreadyUnlocked: Iterable<string>,
): AchievementUnlock[] {
  const have = new Set(alreadyUnlocked);
  const out: AchievementUnlock[] = [];
  for (const code of ACHIEVEMENT_CODES) {
    if (have.has(code)) continue;
    const def = ACHIEVEMENTS[code];
    const current = statValueFor(def.kind, stats);
    if (current >= def.target) {
      out.push({ code, def });
    }
  }
  return out;
}

function statValueFor(kind: AchievementKind, stats: AchievementStats): number {
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

/** Sum all rewards from a list of newly-unlocked achievements. */
export function sumRewards(unlocks: AchievementUnlock[]): Required<AchievementReward> {
  const acc: Required<AchievementReward> = { streakFreezes: 0, species: [], xp: 0 };
  const seen = new Set<string>();
  for (const u of unlocks) {
    const r = u.def.reward;
    if (!r) continue;
    acc.streakFreezes += r.streakFreezes ?? 0;
    acc.xp += r.xp ?? 0;
    for (const s of r.species ?? []) {
      if (!seen.has(s)) {
        seen.add(s);
        acc.species.push(s);
      }
    }
  }
  return acc;
}

// ── convenience bundle for the grade handler ───────────────────────────────

export interface GradeRollupInput {
  rating: Rating;
  durationMs: number;
  now: Date;
  previous: {
    streakDays: number;
    streakFreezes: number;
    lastReviewDate: string | null | undefined;
    todayMinutes: number;
    todayMinutesDate: string | null | undefined;
    dailyGoalMinutes: number;
    dailyGoalMetCount: number;
    dailyGoalMetDate: string | null | undefined;
    xp: number;
    unlockedSpecies: readonly string[];
  };
  /** Current stats snapshot post-grade for achievement evaluation. */
  stats: AchievementStats;
  alreadyUnlocked: Iterable<string>;
  /** Optional override for xp granted by the rating itself (injected so the
   *  server can remain the source of truth on XP_BY_RATING). */
  ratingXp: number;
}

export interface GradeRollupResult {
  streakDays: number;
  streakFreezes: number;
  freezeUsed: boolean;
  lastReviewDate: string;
  todayMinutes: number;
  todayMinutesDate: string;
  dailyGoalMetCount: number;
  dailyGoalMetDate: string | null;
  dailyGoalJustMet: boolean;
  xp: number;
  level: number;
  plantStage: 0 | 1 | 2 | 3 | 4 | 5;
  unlockedSpecies: string[];
  newAchievements: AchievementUnlock[];
}

/**
 * Fold a grade into a new profile snapshot. Single call → everything the
 * server needs to persist plus the list of new achievements to render.
 */
export function applyGradeRollup(input: GradeRollupInput): GradeRollupResult {
  const { previous, now, ratingXp, durationMs } = input;
  const today = todayISO(now);

  // 1. streak + freeze
  const streakRes = applyStreakWithFreeze({
    previousStreak: previous.streakDays,
    previousFreezes: previous.streakFreezes,
    lastReviewDate: previous.lastReviewDate,
    today,
  });

  // 2. today minutes ledger
  const minRes = nextTodayMinutes({
    previousMinutes: previous.todayMinutes,
    previousDate: previous.todayMinutesDate,
    today,
    deltaMs: durationMs,
  });

  // 3. daily goal stamp (off the post-increment minutes)
  const goalRes = maybeStampDailyGoal({
    todayMinutes: minRes.minutes,
    dailyGoalMinutes: previous.dailyGoalMinutes,
    previousCount: previous.dailyGoalMetCount,
    previousDate: previous.dailyGoalMetDate,
    today,
  });

  // 4. evaluate achievements against the updated snapshot
  const unlocks = evaluateAchievements(
    {
      ...input.stats,
      streak: streakRes.streakDays,
      dailyGoalMetCount: goalRes.dailyGoalMetCount,
    },
    input.alreadyUnlocked,
  );
  const rewards = sumRewards(unlocks);

  // 5. XP + derived level. Rating XP + reward XP.
  const xp = previous.xp + ratingXp + rewards.xp;
  const level = Math.max(1, Math.floor(xp / 500) + 1);

  // 6. garden stage mirrors the (updated) streak
  const plantStage = plantStageFromStreak(streakRes.streakDays);

  // 7. species unlock — merge current set with reward species
  const speciesSet = new Set<string>(previous.unlockedSpecies);
  for (const s of rewards.species) speciesSet.add(s);

  // 8. freeze bookkeeping: streak-res may have consumed one; reward may add.
  const streakFreezes = clampFreezes(streakRes.streakFreezes + rewards.streakFreezes);

  return {
    streakDays: streakRes.streakDays,
    streakFreezes,
    freezeUsed: streakRes.freezeUsed,
    lastReviewDate: today,
    todayMinutes: minRes.minutes,
    todayMinutesDate: minRes.date,
    dailyGoalMetCount: goalRes.dailyGoalMetCount,
    dailyGoalMetDate: goalRes.dailyGoalMetDate,
    dailyGoalJustMet: goalRes.justMet,
    xp,
    level,
    plantStage,
    unlockedSpecies: Array.from(speciesSet),
    newAchievements: unlocks,
  };
}

// ── date helper ────────────────────────────────────────────────────────────

function addDaysISO(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Silence ununsed import if nextStreakRaw gets pruned.
void nextStreakRaw;
