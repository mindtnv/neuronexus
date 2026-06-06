import { describe, expect, test } from 'bun:test';
import {
  applyGradeRollup,
  applyStreakWithFreeze,
  clampFreezes,
  maybeStampDailyGoal,
  MAX_STREAK_FREEZES,
  nextTodayMinutes,
} from './gamification.ts';

// ── streak + freeze ────────────────────────────────────────────────────────

describe('applyStreakWithFreeze', () => {
  test('same day — no-op', () => {
    const r = applyStreakWithFreeze({
      previousStreak: 5,
      previousFreezes: 1,
      lastReviewDate: '2026-04-18',
      today: '2026-04-18',
    });
    expect(r).toEqual({ streakDays: 5, streakFreezes: 1, freezeUsed: false });
  });

  test('yesterday — streak + 1', () => {
    const r = applyStreakWithFreeze({
      previousStreak: 5,
      previousFreezes: 1,
      lastReviewDate: '2026-04-17',
      today: '2026-04-18',
    });
    expect(r).toEqual({ streakDays: 6, streakFreezes: 1, freezeUsed: false });
  });

  test('one-day gap, freeze available — consumed, streak continues', () => {
    const r = applyStreakWithFreeze({
      previousStreak: 5,
      previousFreezes: 2,
      lastReviewDate: '2026-04-16', // missed 2026-04-17
      today: '2026-04-18',
    });
    expect(r).toEqual({ streakDays: 6, streakFreezes: 1, freezeUsed: true });
  });

  test('one-day gap, no freeze — reset to 1', () => {
    const r = applyStreakWithFreeze({
      previousStreak: 5,
      previousFreezes: 0,
      lastReviewDate: '2026-04-16',
      today: '2026-04-18',
    });
    expect(r).toEqual({ streakDays: 1, streakFreezes: 0, freezeUsed: false });
  });

  test('multi-day gap — reset regardless of freezes', () => {
    const r = applyStreakWithFreeze({
      previousStreak: 5,
      previousFreezes: 5,
      lastReviewDate: '2026-04-10', // missed 7 days
      today: '2026-04-18',
    });
    expect(r).toEqual({ streakDays: 1, streakFreezes: 5, freezeUsed: false });
  });

  test('null last-date — reset', () => {
    const r = applyStreakWithFreeze({
      previousStreak: 0,
      previousFreezes: 0,
      lastReviewDate: null,
      today: '2026-04-18',
    });
    expect(r).toEqual({ streakDays: 1, streakFreezes: 0, freezeUsed: false });
  });

  test('month boundary: 2026-03-30 + one-day gap lands on 2026-04-01 with freeze', () => {
    const r = applyStreakWithFreeze({
      previousStreak: 3,
      previousFreezes: 1,
      lastReviewDate: '2026-03-30',
      today: '2026-04-01',
    });
    expect(r).toEqual({ streakDays: 4, streakFreezes: 0, freezeUsed: true });
  });
});

// ── today minutes ──────────────────────────────────────────────────────────

describe('nextTodayMinutes', () => {
  test('same day — accumulates', () => {
    const r = nextTodayMinutes({
      previousMinutes: 5,
      previousDate: '2026-04-18',
      today: '2026-04-18',
      deltaMs: 120_000, // 2 min
    });
    expect(r).toEqual({ minutes: 7, date: '2026-04-18' });
  });

  test('new day — resets', () => {
    const r = nextTodayMinutes({
      previousMinutes: 500,
      previousDate: '2026-04-17',
      today: '2026-04-18',
      deltaMs: 60_000,
    });
    expect(r).toEqual({ minutes: 1, date: '2026-04-18' });
  });

  test('null previous date — initializes', () => {
    const r = nextTodayMinutes({
      previousMinutes: 0,
      previousDate: null,
      today: '2026-04-18',
      deltaMs: 180_000,
    });
    expect(r.minutes).toBe(3);
    expect(r.date).toBe('2026-04-18');
  });

  test('negative or zero delta — no minutes added', () => {
    const r = nextTodayMinutes({
      previousMinutes: 10,
      previousDate: '2026-04-18',
      today: '2026-04-18',
      deltaMs: 0,
    });
    expect(r.minutes).toBe(10);
  });
});

// ── daily goal ─────────────────────────────────────────────────────────────

describe('maybeStampDailyGoal', () => {
  test('not yet met — no change', () => {
    const r = maybeStampDailyGoal({
      todayMinutes: 10,
      dailyGoalMinutes: 15,
      previousCount: 3,
      previousDate: '2026-04-17',
      today: '2026-04-18',
    });
    expect(r).toEqual({ dailyGoalMetCount: 3, dailyGoalMetDate: '2026-04-17', justMet: false });
  });

  test('first time meeting goal today — increments', () => {
    const r = maybeStampDailyGoal({
      todayMinutes: 16,
      dailyGoalMinutes: 15,
      previousCount: 3,
      previousDate: '2026-04-17',
      today: '2026-04-18',
    });
    expect(r).toEqual({ dailyGoalMetCount: 4, dailyGoalMetDate: '2026-04-18', justMet: true });
  });

  test('goal already met today — idempotent', () => {
    const r = maybeStampDailyGoal({
      todayMinutes: 30,
      dailyGoalMinutes: 15,
      previousCount: 4,
      previousDate: '2026-04-18',
      today: '2026-04-18',
    });
    expect(r).toEqual({ dailyGoalMetCount: 4, dailyGoalMetDate: '2026-04-18', justMet: false });
  });
});

// ── freeze clamp ───────────────────────────────────────────────────────────

describe('clampFreezes', () => {
  test('clamps to [0, MAX_STREAK_FREEZES]', () => {
    expect(clampFreezes(-2)).toBe(0);
    expect(clampFreezes(0)).toBe(0);
    expect(clampFreezes(3)).toBe(3);
    expect(clampFreezes(99)).toBe(MAX_STREAK_FREEZES);
  });
});

// ── grade rollup ───────────────────────────────────────────────────────────

describe('applyGradeRollup', () => {
  const base = {
    durationMs: 60_000,
    now: new Date('2026-04-18T12:00:00Z'),
    ratingXp: 10,
  };

  test('first-ever review — streak 1, xp += 10, stage 0', () => {
    const r = applyGradeRollup({
      ...base,
      previous: {
        streakDays: 0,
        streakFreezes: 0,
        lastReviewDate: null,
        todayMinutes: 0,
        todayMinutesDate: null,
        dailyGoalMinutes: 15,
        dailyGoalMetCount: 0,
        dailyGoalMetDate: null,
        xp: 0,
      },
    });
    expect(r.streakDays).toBe(1);
    expect(r.streakFreezes).toBe(0);
    expect(r.xp).toBe(10);
    expect(r.level).toBe(1);
    expect(r.plantStage).toBe(0);
    expect(r.lastReviewDate).toBe('2026-04-18');
    expect(r.todayMinutes).toBe(1);
    expect(r.dailyGoalJustMet).toBe(false);
  });

  test('review the next day — streak +1, plant stage mirrors streak/7', () => {
    const r = applyGradeRollup({
      ...base,
      previous: {
        streakDays: 6,
        streakFreezes: 0,
        lastReviewDate: '2026-04-17',
        todayMinutes: 0,
        todayMinutesDate: null,
        dailyGoalMinutes: 15,
        dailyGoalMetCount: 0,
        dailyGoalMetDate: null,
        xp: 40,
      },
    });
    expect(r.streakDays).toBe(7);
    expect(r.xp).toBe(50); // 40 prev + 10 rating (no reward XP anymore)
    expect(r.plantStage).toBe(1); // floor(7 / 7)
  });

  test('meeting daily goal today stamps count', () => {
    const r = applyGradeRollup({
      ...base,
      durationMs: 16 * 60_000, // 16 minutes of review
      previous: {
        streakDays: 0,
        streakFreezes: 0,
        lastReviewDate: null,
        todayMinutes: 0,
        todayMinutesDate: null,
        dailyGoalMinutes: 15,
        dailyGoalMetCount: 0,
        dailyGoalMetDate: null,
        xp: 0,
      },
    });
    expect(r.todayMinutes).toBe(16);
    expect(r.dailyGoalJustMet).toBe(true);
    expect(r.dailyGoalMetCount).toBe(1);
    expect(r.dailyGoalMetDate).toBe('2026-04-18');
  });

  test('freeze saves the streak across a one-day gap', () => {
    const r = applyGradeRollup({
      ...base,
      previous: {
        streakDays: 10,
        streakFreezes: 1,
        lastReviewDate: '2026-04-16', // missed 17th
        todayMinutes: 0,
        todayMinutesDate: null,
        dailyGoalMinutes: 15,
        dailyGoalMetCount: 0,
        dailyGoalMetDate: null,
        xp: 200,
      },
    });
    expect(r.freezeUsed).toBe(true);
    expect(r.streakDays).toBe(11);
    expect(r.streakFreezes).toBe(0);
  });

  test('level derives from xp (floor(xp/500)+1)', () => {
    const r = applyGradeRollup({
      ...base,
      ratingXp: 100,
      previous: {
        streakDays: 0,
        streakFreezes: 0,
        lastReviewDate: null,
        todayMinutes: 0,
        todayMinutesDate: null,
        dailyGoalMinutes: 15,
        dailyGoalMetCount: 0,
        dailyGoalMetDate: null,
        xp: 1999, // → 2099 after grade → level 5
      },
    });
    expect(r.xp).toBe(2099);
    expect(r.level).toBe(5);
  });
});
