// Seed script — populate a single user account with realistic decks + cards
// + review history. Idempotent: wipes the user's existing decks/cards/reviews
// first (cascade handles the rest), then rebuilds.
//
//   bun run db:seed -- --email mindtnv@gmail.com
//
// or set the email via env:
//
//   SEED_USER_EMAIL=mindtnv@gmail.com bun run db:seed
//
// The executor replays each card's `ratings` through ts-fsrs to produce a
// plausible card state (stability, due, reps, lapses) and writes matching
// rows into `reviews` so stats/heatmap look lived-in. Review dates are
// spread across the past ~21 days.

import { and, eq, inArray } from 'drizzle-orm';
import {
  FsrsRating,
  gradeFsrs,
  newFsrsCard,
  stateLabel,
  type Rating,
} from '@neuronexus/shared';
import { db } from './client.ts';
import { cards, decks, profile, reviews, user } from './schema/index.ts';
import { SEED_DECKS, type CardSeed, type DeckSeed } from './seed-data.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

function parseEmail(): string {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--email');
  if (idx >= 0 && args[idx + 1]) return args[idx + 1]!;
  const envEmail = process.env.SEED_USER_EMAIL;
  if (envEmail) return envEmail;
  throw new Error(
    'No email provided. Usage: bun run db:seed -- --email you@example.com  (or SEED_USER_EMAIL env)',
  );
}

async function wipeUserData(userId: string) {
  // FK cascade removes cards + reviews when decks go; we delete decks + reviews
  // explicitly for a clean slate.
  await db.delete(decks).where(eq(decks.userId, userId));
  await db.delete(reviews).where(eq(reviews.userId, userId));
}

function pickReviewTime(rating: Rating, stepIndex: number, totalSteps: number): Date {
  // Spread reviews across the last 21 days. Earlier grades land earlier,
  // most recent ones within the last few days.
  const span = 21 * DAY_MS;
  const start = Date.now() - span;
  const progress = totalSteps <= 1 ? 1 : stepIndex / (totalSteps - 1);
  const jitter = (Math.random() - 0.5) * DAY_MS;
  return new Date(start + progress * span + jitter);
  void rating;
}

/**
 * Replay a list of ratings through ts-fsrs, inserting a review row for each
 * grade. Returns the final FSRS state that will be persisted on the card.
 */
async function replayRatings(
  ratings: Rating[],
  userId: string,
  cardId: string,
  deckId: string,
): Promise<Awaited<ReturnType<typeof gradeFsrs>>['card']> {
  let state = newFsrsCard();
  let lastReviewAt: Date | null = null;

  for (let i = 0; i < ratings.length; i++) {
    const rating = ratings[i]!;
    const reviewedAt = pickReviewTime(rating, i, ratings.length);
    const graded = gradeFsrs(state, rating, reviewedAt, { enableFuzz: false });
    state = graded.card;
    lastReviewAt = reviewedAt;

    await db.insert(reviews).values({
      userId,
      cardId,
      deckId,
      rating,
      durationMs: 2500 + Math.floor(Math.random() * 4500),
      reviewedAt,
      nextDue: state.due,
      nextStability: state.stability,
      nextDifficulty: state.difficulty,
    });
  }

  void lastReviewAt;
  return state;
}

async function insertDeckTree(
  userId: string,
  def: DeckSeed,
  parentId: string | null,
): Promise<void> {
  const [row] = await db
    .insert(decks)
    .values({
      userId,
      parentId: parentId ?? null,
      name: def.name,
      color: def.color,
    })
    .returning();
  if (!row) throw new Error(`failed to insert deck ${def.name}`);

  // Own cards
  if (def.cards && def.cards.length > 0) {
    for (const card of def.cards) {
      await insertCard(userId, row.id, card);
    }
  }

  // Children
  if (def.children) {
    for (const child of def.children) {
      await insertDeckTree(userId, child, row.id);
    }
  }
}

async function insertCard(userId: string, deckId: string, card: CardSeed): Promise<void> {
  const initial = newFsrsCard();
  const [row] = await db
    .insert(cards)
    .values({
      userId,
      deckId,
      variant: 'basic',
      front: card.front,
      back: card.back,
      tags: card.tags ?? [],
      due: initial.due,
      stability: initial.stability,
      difficulty: initial.difficulty,
      elapsedDays: initial.elapsed_days,
      scheduledDays: initial.scheduled_days,
      learningSteps: initial.learning_steps,
      reps: initial.reps,
      lapses: initial.lapses,
      state: stateLabel(initial.state),
    })
    .returning();
  if (!row) throw new Error(`failed to insert card ${card.front}`);

  const ratings = card.ratings ?? [];
  if (ratings.length === 0) return;

  const finalState = await replayRatings(ratings, userId, row.id, deckId);

  await db
    .update(cards)
    .set({
      due: finalState.due,
      stability: finalState.stability,
      difficulty: finalState.difficulty,
      elapsedDays: finalState.elapsed_days,
      scheduledDays: finalState.scheduled_days,
      learningSteps: finalState.learning_steps,
      reps: finalState.reps,
      lapses: finalState.lapses,
      state: stateLabel(finalState.state),
      lastReview: finalState.last_review ?? null,
      updatedAt: new Date(),
    })
    .where(eq(cards.id, row.id));
}

/** Tweak profile to match all those reviews so the home banner isn't level 1 / 0 XP. */
async function bumpProfile(userId: string, totalReviews: number) {
  const [existing] = await db.select().from(profile).where(eq(profile.userId, userId));
  const xp = Math.min(20_000, totalReviews * 8); // ≈ mostly-good grades
  const level = Math.max(1, Math.floor(xp / 500) + 1);
  const streakDays = 6; // seeded feels like the user's been at it for a bit
  const plantStage = Math.max(0, Math.min(5, Math.floor(streakDays / 7))) as 0 | 1 | 2 | 3 | 4 | 5;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);

  if (existing) {
    await db
      .update(profile)
      .set({
        xp,
        level,
        streakDays,
        plantStage,
        lastReviewDate: yesterday, // so today's grade bumps streak to 7
        todayMinutes: 0,
        todayMinutesDate: null,
        dailyGoalMetCount: 4,
        dailyGoalMetDate: yesterday,
        streakFreezes: 1,
        updatedAt: new Date(),
      })
      .where(eq(profile.userId, userId));
  } else {
    await db.insert(profile).values({
      userId,
      name: 'Dev',
      xp,
      level,
      streakDays,
      plantStage,
      lastReviewDate: yesterday,
      dailyGoalMetCount: 4,
      dailyGoalMetDate: yesterday,
      streakFreezes: 1,
    });
  }
  void today;
  void inArray; // keep import tidy
}

async function main() {
  const email = parseEmail();
  const [u] = await db.select().from(user).where(eq(user.email, email));
  if (!u) {
    throw new Error(`User ${email} not found. Sign up in the web app first.`);
  }
  // eslint-disable-next-line no-console
  console.log(`[seed] target user: ${u.email} (${u.id})`);

  // eslint-disable-next-line no-console
  console.log('[seed] wiping existing decks / cards / reviews');
  await wipeUserData(u.id);

  // eslint-disable-next-line no-console
  console.log(`[seed] inserting ${SEED_DECKS.length} root decks`);
  for (const root of SEED_DECKS) {
    await insertDeckTree(u.id, root, null);
  }

  const [{ n: totalReviews } = { n: 0 }] = await db
    .select({ n: countRows(reviews.id) })
    .from(reviews)
    .where(eq(reviews.userId, u.id));
  // eslint-disable-next-line no-console
  console.log(`[seed] inserted ${totalReviews} reviews, adjusting profile`);
  await bumpProfile(u.id, totalReviews);

  // eslint-disable-next-line no-console
  console.log('[seed] done.');
  process.exit(0);
}

// Tiny `count()` helper so we don't pull drizzle-orm/sql/expressions just for one line.
function countRows(col: unknown): ReturnType<typeof import('drizzle-orm').count> {
  // Using a dynamic import would force async; `count` is a pure function — grab it synchronously.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const { count } = require('drizzle-orm') as typeof import('drizzle-orm');
  return count(col as never);
}

void and;

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed:', err);
  process.exit(1);
});
