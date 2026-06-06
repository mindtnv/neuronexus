// Gamification core. Pure functions — no DB, no clock — so they trivially
// port between server (grade transaction) and client (home previews).
//
// The server calls `applyGradeRollup` inside the /reviews transaction: it
// rolls streak, freezes, today-minutes, daily-goal, XP, level and plant stage
// into a new profile shape. The response goes back to the client.

import type { Rating } from './fsrs.ts';
import { plantStageFromStreak, todayISO } from './fsrs.ts';

// ── plant species catalog ──────────────────────────────────────────────────
// Kept in sync with the Postgres enum in packages/db/src/schema/app.ts. All
// species are available to every user (the achievement-gated unlock flow was
// removed); `profile.plantSpecies` still stores the current selection.

export const PLANT_SPECIES = [
  'fern',
  'cactus',
  'succulent',
  'bonsai',
  'sakura',
  'mushroom',
] as const;
export type PlantSpecies = (typeof PLANT_SPECIES)[number];

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
 * Advance the GLOBAL per-day new-card / review counters for one regular grade.
 * Mirrors `nextTodayMinutes`'s calendar-day reset (UTC, ISO `yyyy-mm-dd`):
 *
 *   - same day (`previousDate === today`) → bump the lane the grade belongs to
 *     (`introducedNew` ? new : review), the other lane unchanged
 *   - new day (or null `previousDate`)     → reset both, set the chosen lane to
 *     1, stamp today
 *
 * `introducedNew` is the card's PRE-grade `state === 'new'` — a "first
 * introduction" counts toward the new lane, every other grade (incl. relearning
 * reps) counts toward the review lane. Pure: no clock, no DB.
 */
export function nextDailyCounts(opts: {
  previousNew: number;
  previousReviews: number;
  previousDate: string | null | undefined;
  today: string;
  introducedNew: boolean;
}): { newIntroducedToday: number; reviewsDoneToday: number; date: string } {
  const { previousNew, previousReviews, previousDate, today, introducedNew } = opts;
  if (previousDate === today) {
    return {
      newIntroducedToday: previousNew + (introducedNew ? 1 : 0),
      reviewsDoneToday: previousReviews + (introducedNew ? 0 : 1),
      date: today,
    };
  }
  return {
    newIntroducedToday: introducedNew ? 1 : 0,
    reviewsDoneToday: introducedNew ? 0 : 1,
    date: today,
  };
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

// ── convenience bundle for the grade handler ───────────────────────────────

export interface GradeRollupInput {
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
  };
  /** XP granted by the rating itself (server stays source of truth on XP_BY_RATING). */
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
}

/**
 * Fold a grade into a new profile snapshot. Single call → everything the
 * server needs to persist.
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

  // 4. XP + derived level (rating XP only — reward XP is gone with achievements)
  const xp = previous.xp + ratingXp;
  const level = Math.max(1, Math.floor(xp / 500) + 1);

  // 5. garden stage mirrors the (updated) streak
  const plantStage = plantStageFromStreak(streakRes.streakDays);

  return {
    streakDays: streakRes.streakDays,
    streakFreezes: clampFreezes(streakRes.streakFreezes),
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
  };
}

// ── date helper ────────────────────────────────────────────────────────────

function addDaysISO(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
