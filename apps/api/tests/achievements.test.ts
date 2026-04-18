import { beforeEach, describe, expect, test } from 'bun:test';
import { db, profile } from '@neuronexus/db';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/app.ts';
import { callApp, resetTestDb, signUpAndCookie, uniqueEmail } from './helpers.ts';

const app = buildApp();

async function setupGraderUser(): Promise<{
  cookie: string;
  userId: string;
  cardId: string;
  deckId: string;
}> {
  const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
  await callApp(app, 'GET', '/profile', { cookie }); // lazy-create profile
  const deck = await (
    await callApp(app, 'POST', '/decks', { cookie, body: { name: 'D' } })
  ).json<{ id: string }>();
  const card = await (
    await callApp(app, 'POST', '/cards', {
      cookie,
      body: { deckId: deck.id, front: 'Hund', back: 'dog' },
    })
  ).json<{ id: string }>();
  return { cookie, userId, cardId: card.id, deckId: deck.id };
}

/** Fast-forward the user's last review date so the *next* grade lands on the
 *  configured `today`. Returns the user-id for convenience. */
async function backdateProfile(
  userId: string,
  opts: Partial<{
    streakDays: number;
    streakFreezes: number;
    lastReviewDate: string;
    dailyGoalMetCount: number;
  }>,
): Promise<void> {
  await db.update(profile).set(opts).where(eq(profile.userId, userId));
}

describe('gamification — /reviews grade flow', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  test('first grade initializes streak=1, xp=10, no achievements', async () => {
    const { cookie, cardId } = await setupGraderUser();
    const res = await callApp(app, 'POST', '/reviews', {
      cookie,
      body: { cardId, rating: 3 },
    });
    const body = await res.json<{
      profile: { streakDays: number; streakFreezes: number; xp: number };
      newAchievements: string[];
      freezeUsed: boolean;
      dailyGoalJustMet: boolean;
    }>();
    expect(body.profile.streakDays).toBe(1);
    expect(body.profile.streakFreezes).toBe(0);
    expect(body.profile.xp).toBe(10);
    expect(body.newAchievements).toEqual([]);
    expect(body.freezeUsed).toBe(false);
  });

  test('crossing streak 7 unlocks streak7 with freeze + xp reward', async () => {
    const { cookie, userId, cardId } = await setupGraderUser();
    // Pretend we already have a 6-day streak ending yesterday.
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await backdateProfile(userId, {
      streakDays: 6,
      streakFreezes: 0,
      lastReviewDate: yesterday,
    });
    void today;

    const res = await callApp(app, 'POST', '/reviews', {
      cookie,
      body: { cardId, rating: 3 },
    });
    const body = await res.json<{
      profile: { streakDays: number; streakFreezes: number; xp: number };
      newAchievements: string[];
    }>();
    expect(body.profile.streakDays).toBe(7);
    expect(body.profile.streakFreezes).toBe(1);
    // 10 (rating) + 50 (reward)
    expect(body.profile.xp).toBe(60);
    expect(body.newAchievements).toContain('streak7');

    // Persisted in /achievements
    const list = await (
      await callApp(app, 'GET', '/achievements', { cookie })
    ).json<Array<{ code: string; unlockedAt: string | null }>>();
    const s7 = list.find((x) => x.code === 'streak7');
    expect(s7?.unlockedAt).toBeTruthy();
  });

  test('freeze saves the streak across a one-day gap', async () => {
    const { cookie, userId, cardId } = await setupGraderUser();
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    // Pre-stock a freeze + 10-day streak ending 2 days ago (missed yesterday).
    await backdateProfile(userId, {
      streakDays: 10,
      streakFreezes: 1,
      lastReviewDate: twoDaysAgo,
    });

    const res = await callApp(app, 'POST', '/reviews', {
      cookie,
      body: { cardId, rating: 3 },
    });
    const body = await res.json<{
      profile: { streakDays: number; streakFreezes: number };
      freezeUsed: boolean;
    }>();
    expect(body.freezeUsed).toBe(true);
    expect(body.profile.streakDays).toBe(11);
    // Had 1, consumed 1, streak7 already hit earlier so reward doesn't fire
    // — but test DB is empty so reward DOES fire → +1. Assert the known net:
    // (-1 for freeze) + (reward streakFreezes depending on whether streak7
    // was pre-existing). Since the test user was just created, streak7 is
    // unlocked this turn → +1 freeze from reward → net 1.
    expect(body.profile.streakFreezes).toBe(1);
  });

  test('meeting daily goal via durationMs stamps the counter', async () => {
    const { cookie, cardId } = await setupGraderUser();
    // Default dailyGoalMinutes = 15, so 20 min of study hits it.
    const res = await callApp(app, 'POST', '/reviews', {
      cookie,
      body: { cardId, rating: 3, durationMs: 20 * 60_000 },
    });
    const body = await res.json<{
      profile: { dailyGoalMetCount: number; todayMinutes: number };
      dailyGoalJustMet: boolean;
    }>();
    expect(body.profile.todayMinutes).toBe(20);
    expect(body.profile.dailyGoalMetCount).toBe(1);
    expect(body.dailyGoalJustMet).toBe(true);
  });

  test('reviews 100 achievement fires after enough graded cards (small target)', async () => {
    // Faking 100 actual reviews would be slow; instead we seed profile + a
    // card, grade once, and rely on the DB-scanning count for totalReviews.
    // So we need 99 pre-existing rows. Easier: bump previous grade count by
    // seeding the reviews table directly via drizzle.
    const { cookie, userId, deckId } = await setupGraderUser();
    // Create a second card so we have something to hit 100 with.
    const card = await (
      await callApp(app, 'POST', '/cards', {
        cookie,
        body: { deckId, front: 'a', back: 'b' },
      })
    ).json<{ id: string }>();
    // Dump 99 synthetic review rows for the same user (no business impact;
    // achievements evaluator just counts).
    const { reviews: reviewsTable } = await import('@neuronexus/db');
    const rows = Array.from({ length: 99 }, () => ({
      userId,
      cardId: card.id,
      deckId,
      rating: 3,
      durationMs: 1000,
      reviewedAt: new Date(),
      nextDue: new Date(),
      nextStability: 1,
      nextDifficulty: 1,
    }));
    await db.insert(reviewsTable).values(rows);

    const res = await callApp(app, 'POST', '/reviews', {
      cookie,
      body: { cardId: card.id, rating: 3 },
    });
    const body = await res.json<{ newAchievements: string[] }>();
    expect(body.newAchievements).toContain('reviews100');
  });

  test('polyglot (decks 3) fires after creating the 3rd deck and grading', async () => {
    const { cookie, cardId } = await setupGraderUser(); // already has 1 deck
    // Add 2 more decks → 3 total
    await callApp(app, 'POST', '/decks', { cookie, body: { name: 'D2' } });
    await callApp(app, 'POST', '/decks', { cookie, body: { name: 'D3' } });
    const res = await callApp(app, 'POST', '/reviews', {
      cookie,
      body: { cardId, rating: 3 },
    });
    const body = await res.json<{ newAchievements: string[] }>();
    expect(body.newAchievements).toContain('decks3');
  });
});

describe('gamification — /achievements endpoints', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  test('GET /achievements/catalog returns the full static catalog', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const res = await callApp(app, 'GET', '/achievements/catalog', { cookie });
    expect(res.status).toBe(200);
    const body = await res.json<Record<string, { title: string; target: number }>>();
    expect(body.streak7?.title).toBe('Week runner');
    expect(body.streak7?.target).toBe(7);
    expect(Object.keys(body).length).toBeGreaterThanOrEqual(14);
  });

  test('GET /achievements starts all-locked for a new user', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    await callApp(app, 'GET', '/profile', { cookie });
    const list = await (await callApp(app, 'GET', '/achievements', { cookie })).json<
      Array<{ code: string; unlockedAt: string | null; progress: number; pct: number }>
    >();
    expect(list.length).toBeGreaterThanOrEqual(14);
    expect(list.every((a) => a.unlockedAt === null)).toBe(true);
    // Level-based achievements show partial progress immediately because a
    // freshly-created user is already level 1. Assert the looser invariant:
    // progress never exceeds target.
    for (const a of list) {
      expect(a.progress).toBeGreaterThanOrEqual(0);
      expect(a.pct).toBeGreaterThanOrEqual(0);
      expect(a.pct).toBeLessThanOrEqual(1);
    }
  });

  test('GET /achievements/summary reflects unlocked count', async () => {
    const { cookie, userId, cardId } = await setupGraderUser();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await backdateProfile(userId, { streakDays: 6, lastReviewDate: yesterday });
    await callApp(app, 'POST', '/reviews', { cookie, body: { cardId, rating: 3 } });
    const sum = await (
      await callApp(app, 'GET', '/achievements/summary', { cookie })
    ).json<{ unlocked: number; total: number; recent: Array<{ code: string }> }>();
    expect(sum.total).toBeGreaterThanOrEqual(14);
    expect(sum.unlocked).toBeGreaterThanOrEqual(1);
    expect(sum.recent.some((r) => r.code === 'streak7')).toBe(true);
  });

  test('achievements are scoped to the user', async () => {
    const { cookie: aliceCookie, userId: aliceId } = await signUpAndCookie(app, uniqueEmail('a'));
    const { cookie: bobCookie } = await signUpAndCookie(app, uniqueEmail('b'));
    await callApp(app, 'GET', '/profile', { cookie: aliceCookie });
    await callApp(app, 'GET', '/profile', { cookie: bobCookie });
    // Unlock something for Alice via direct backdate-and-grade.
    const aDeck = await (
      await callApp(app, 'POST', '/decks', { cookie: aliceCookie, body: { name: 'A' } })
    ).json<{ id: string }>();
    const aCard = await (
      await callApp(app, 'POST', '/cards', {
        cookie: aliceCookie,
        body: { deckId: aDeck.id, front: 'x', back: 'y' },
      })
    ).json<{ id: string }>();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await backdateProfile(aliceId, { streakDays: 6, lastReviewDate: yesterday });
    await callApp(app, 'POST', '/reviews', {
      cookie: aliceCookie,
      body: { cardId: aCard.id, rating: 3 },
    });

    // Bob should see nothing unlocked.
    const bobList = await (await callApp(app, 'GET', '/achievements', { cookie: bobCookie })).json<
      Array<{ unlockedAt: string | null }>
    >();
    expect(bobList.every((a) => a.unlockedAt === null)).toBe(true);
  });
});
