import { describe, expect, test } from 'bun:test';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CODES,
  applyGradeRollup,
  applyStreakWithFreeze,
  clampFreezes,
  evaluateAchievements,
  maybeStampDailyGoal,
  MAX_STREAK_FREEZES,
  nextTodayMinutes,
  sumRewards,
  type AchievementCode,
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

// ── evaluator / catalog ────────────────────────────────────────────────────

describe('evaluateAchievements', () => {
  test('unlocks streak7 when streak hits 7', () => {
    const u = evaluateAchievements(
      { streak: 7, totalReviews: 0, deckCount: 0, level: 1, plantStage: 0, dailyGoalMetCount: 0 },
      [],
    );
    const codes = u.map((x) => x.code);
    expect(codes).toContain('streak7');
    expect(codes).not.toContain('streak30');
  });

  test('respects alreadyUnlocked', () => {
    const u = evaluateAchievements(
      { streak: 7, totalReviews: 0, deckCount: 0, level: 1, plantStage: 0, dailyGoalMetCount: 0 },
      ['streak7'],
    );
    expect(u.map((x) => x.code)).not.toContain('streak7');
  });

  test('crossing multiple tiers at once unlocks all below the target', () => {
    const u = evaluateAchievements(
      {
        streak: 100,
        totalReviews: 0,
        deckCount: 0,
        level: 1,
        plantStage: 0,
        dailyGoalMetCount: 0,
      },
      [],
    );
    const codes = u.map((x) => x.code);
    expect(codes).toContain('streak7');
    expect(codes).toContain('streak30');
    expect(codes).toContain('streak100');
    expect(codes).not.toContain('streak365');
  });

  test('every catalog kind has at least one unlockable entry', () => {
    const everyKind = evaluateAchievements(
      {
        streak: 365,
        totalReviews: 10_000,
        deckCount: 10,
        level: 20,
        plantStage: 5,
        dailyGoalMetCount: 30,
      },
      [],
    );
    const unlocked = new Set<string>(everyKind.map((u) => u.code));
    // All catalog codes should have fired.
    for (const code of ACHIEVEMENT_CODES) {
      expect(unlocked.has(code)).toBe(true);
    }
  });

  test('reviews achievement fires purely off totalReviews, not streak', () => {
    const u = evaluateAchievements(
      {
        streak: 1,
        totalReviews: 1000,
        deckCount: 0,
        level: 1,
        plantStage: 0,
        dailyGoalMetCount: 0,
      },
      [],
    );
    const codes = u.map((x) => x.code);
    expect(codes).toContain('reviews100');
    expect(codes).toContain('reviews1000');
  });
});

describe('sumRewards', () => {
  test('sums freezes and xp, deduplicates species', () => {
    const unlocks = [
      { code: 'streak7' as AchievementCode, def: ACHIEVEMENTS.streak7 },
      { code: 'streak30' as AchievementCode, def: ACHIEVEMENTS.streak30 },
      { code: 'level20' as AchievementCode, def: ACHIEVEMENTS.level20 }, // bonsai
      { code: 'streak100' as AchievementCode, def: ACHIEVEMENTS.streak100 }, // bonsai again
    ];
    const r = sumRewards(unlocks);
    expect(r.streakFreezes).toBe(1 + 2 + 3);
    expect(r.xp).toBe(50 + 200 + 500 + 500);
    expect(r.species.sort()).toEqual(['bonsai', 'sakura']);
  });

  test('returns zeroed envelope for empty input', () => {
    expect(sumRewards([])).toEqual({ streakFreezes: 0, species: [], xp: 0 });
  });
});

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
    rating: 3 as const,
    durationMs: 60_000,
    now: new Date('2026-04-18T12:00:00Z'),
    ratingXp: 10,
    stats: {
      streak: 0,
      totalReviews: 1,
      deckCount: 1,
      level: 1,
      plantStage: 0,
      dailyGoalMetCount: 0,
    },
    alreadyUnlocked: [],
  };

  test('first-ever review — streak 1, xp += 10, no achievements yet', () => {
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
        unlockedSpecies: ['fern'],
      },
    });
    expect(r.streakDays).toBe(1);
    expect(r.streakFreezes).toBe(0);
    expect(r.xp).toBe(10);
    expect(r.level).toBe(1);
    expect(r.plantStage).toBe(0);
    expect(r.lastReviewDate).toBe('2026-04-18');
    expect(r.todayMinutes).toBe(1);
    expect(r.newAchievements).toEqual([]);
    expect(r.dailyGoalJustMet).toBe(false);
  });

  test('review on day 7 unlocks streak7, grants 1 freeze + 50 xp + no species', () => {
    const r = applyGradeRollup({
      ...base,
      stats: { ...base.stats, streak: 7 }, // stats overwritten internally; start from 6 prev
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
        unlockedSpecies: ['fern'],
      },
    });
    expect(r.streakDays).toBe(7);
    // 40 prev xp + 10 rating + 50 reward
    expect(r.xp).toBe(100);
    expect(r.streakFreezes).toBe(1);
    const codes = r.newAchievements.map((a) => a.code);
    expect(codes).toContain('streak7');
    expect(codes).not.toContain('streak30');
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
        unlockedSpecies: ['fern'],
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
      // streak7 is already unlocked so we can isolate the freeze delta without
      // the streak7 reward (+1 freeze) muddying the assertion.
      alreadyUnlocked: ['streak7'],
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
        unlockedSpecies: ['fern'],
      },
    });
    expect(r.freezeUsed).toBe(true);
    expect(r.streakDays).toBe(11);
    expect(r.streakFreezes).toBe(0);
  });

  test('streak 30 grants sakura + extra freezes', () => {
    const r = applyGradeRollup({
      ...base,
      previous: {
        streakDays: 29,
        streakFreezes: 1,
        lastReviewDate: '2026-04-17',
        todayMinutes: 0,
        todayMinutesDate: null,
        dailyGoalMinutes: 15,
        dailyGoalMetCount: 0,
        dailyGoalMetDate: null,
        xp: 500,
        unlockedSpecies: ['fern'],
      },
    });
    expect(r.streakDays).toBe(30);
    expect(r.unlockedSpecies).toContain('sakura');
    // Previously had 1, reward adds 2 (streak30), streak7 reward doesn't re-trigger
    // because we already have it? Actually we don't have streak7 pre-unlocked in
    // `alreadyUnlocked`, so it fires too → +1 extra freeze.
    expect(r.streakFreezes).toBe(1 + 1 + 2); // = 4
  });

  test('level-up to 5 unlocks cactus species', () => {
    const r = applyGradeRollup({
      ...base,
      ratingXp: 100, // big lump
      stats: { ...base.stats, level: 5 },
      previous: {
        streakDays: 0,
        streakFreezes: 0,
        lastReviewDate: null,
        todayMinutes: 0,
        todayMinutesDate: null,
        dailyGoalMinutes: 15,
        dailyGoalMetCount: 0,
        dailyGoalMetDate: null,
        // Start just below level 5 (level = floor(xp/500)+1 ⇒ xp 1999 → level 4)
        xp: 1999,
        unlockedSpecies: ['fern'],
      },
    });
    expect(r.level).toBeGreaterThanOrEqual(5);
    expect(r.unlockedSpecies).toContain('cactus');
    expect(r.newAchievements.map((a) => a.code)).toContain('level5');
  });

  test('alreadyUnlocked codes are not re-awarded', () => {
    const r = applyGradeRollup({
      ...base,
      alreadyUnlocked: ['streak7'],
      previous: {
        streakDays: 6,
        streakFreezes: 0,
        lastReviewDate: '2026-04-17',
        todayMinutes: 0,
        todayMinutesDate: null,
        dailyGoalMinutes: 15,
        dailyGoalMetCount: 0,
        dailyGoalMetDate: null,
        xp: 0,
        unlockedSpecies: ['fern'],
      },
    });
    expect(r.newAchievements.map((a) => a.code)).not.toContain('streak7');
    // Did NOT grant the streak7 reward (no +1 freeze).
    expect(r.streakFreezes).toBe(0);
  });
});

// ── catalog sanity ─────────────────────────────────────────────────────────

describe('ACHIEVEMENTS catalog', () => {
  test('every code is unique and matches its key', () => {
    for (const [key, def] of Object.entries(ACHIEVEMENTS) as Array<[
      string,
      (typeof ACHIEVEMENTS)[keyof typeof ACHIEVEMENTS],
    ]>) {
      expect(def.code as string).toBe(key);
      expect(def.target).toBeGreaterThan(0);
      expect(def.title.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  test('targets are monotonic within each kind', () => {
    const byKind = new Map<string, number[]>();
    for (const def of Object.values(ACHIEVEMENTS)) {
      const arr = byKind.get(def.kind) ?? [];
      arr.push(def.target);
      byKind.set(def.kind, arr);
    }
    for (const arr of byKind.values()) {
      const sorted = [...arr].sort((a, b) => a - b);
      expect(arr).toEqual(sorted);
    }
  });
});
