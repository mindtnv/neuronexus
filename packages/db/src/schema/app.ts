import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth.ts';

// Catalog of plant species. All species are available to every user (the
// achievement-gated unlock flow was removed). Keep this list in sync with
// PLANT_SPECIES in @neuronexus/shared.
export const plantSpeciesEnum = [
  'fern',
  'cactus',
  'succulent',
  'bonsai',
  'sakura',
  'mushroom',
] as const;

// ── enums ───────────────────────────────────────────────────────────────────

export const deckColor = pgEnum('deck_color', [
  'lime',
  'amber',
  'violet',
  'sky',
  'rose',
  'neutral',
]);
export const plantSpecies = pgEnum('plant_species', plantSpeciesEnum);
export const cardVariant = pgEnum('card_variant', ['basic', 'cloze', 'type']);
export const cardState = pgEnum('card_state', ['new', 'learning', 'review', 'relearning']);

// ── profile ─────────────────────────────────────────────────────────────────
// One-to-one with auth.user. Uses user.id as the primary key so there's no
// ambiguity between "profile row" and "user row".

export const profile = pgTable('profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  level: integer('level').notNull().default(1),
  xp: integer('xp').notNull().default(0),
  streakDays: integer('streak_days').notNull().default(0),
  lastReviewDate: text('last_review_date'), // ISO date yyyy-mm-dd
  // Gamification — freezes absorb one missed day each. Capped at
  // `MAX_STREAK_FREEZES` in shared helpers.
  streakFreezes: integer('streak_freezes').notNull().default(0),
  // Per-day review-minute ledger. `todayMinutesDate` is the ISO date that
  // `todayMinutes` belongs to; when a new day arrives, the counter resets
  // inside the grade transaction.
  todayMinutes: integer('today_minutes').notNull().default(0),
  todayMinutesDate: text('today_minutes_date'),
  // How many calendar days the user has met their daily goal on — used by the
  // achievements screen ("perfect week" etc).
  dailyGoalMetCount: integer('daily_goal_met_count').notNull().default(0),
  dailyGoalMetDate: text('daily_goal_met_date'),
  dailyGoalMinutes: integer('daily_goal_minutes').notNull().default(15),
  desiredRetention: doublePrecision('desired_retention'),
  plantSpecies: plantSpecies('plant_species').notNull().default('fern'),
  plantStage: integer('plant_stage').notNull().default(0),
  unlockedSpecies: text('unlocked_species')
    .array()
    .notNull()
    .default(sql`ARRAY['fern','cactus','succulent','bonsai','sakura','mushroom']::text[]`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── decks ───────────────────────────────────────────────────────────────────
// Self-referential parent for Anki-style nested decks. ON DELETE CASCADE at the
// DB level drops the whole subtree in one shot.

export const decks = pgTable(
  'decks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): any => decks.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    color: deckColor('color').notNull().default('lime'),
    icon: text('icon'),
    species: plantSpecies('species').notNull().default('fern'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('decks_user_idx').on(t.userId),
    index('decks_parent_idx').on(t.parentId),
  ],
);

// ── cards ───────────────────────────────────────────────────────────────────
// FSRS state is flattened into dedicated columns so `due` can be indexed for
// cheap "what's due now" queries.

export const cards = pgTable(
  'cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    deckId: uuid('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    variant: cardVariant('variant').notNull().default('basic'),
    front: text('front').notNull(),
    back: text('back').notNull(),
    clozeText: text('cloze_text'),
    tags: text('tags').array().notNull().default(sql`ARRAY[]::text[]`),
    // FSRS state
    due: timestamp('due', { withTimezone: true }).notNull().defaultNow(),
    stability: doublePrecision('stability').notNull().default(0),
    difficulty: doublePrecision('difficulty').notNull().default(0),
    elapsedDays: integer('elapsed_days').notNull().default(0),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    learningSteps: integer('learning_steps').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    state: cardState('state').notNull().default('new'),
    lastReview: timestamp('last_review', { withTimezone: true }),
    // bookkeeping
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    suspended: boolean('suspended').notNull().default(false),
  },
  (t) => [
    index('cards_user_idx').on(t.userId),
    index('cards_deck_idx').on(t.deckId),
    index('cards_due_idx').on(t.userId, t.due),
    // Card-database (Browse) query paths:
    //  - GIN on tags powers `tag:` array containment (`tags @> ARRAY[...]`).
    //  - (user_id, state) and (user_id, created_at) match the hot filter+sort
    //    paths of GET /cards/search (is:/state filters, default created sort).
    index('cards_tags_gin_idx').using('gin', t.tags),
    index('cards_user_state_idx').on(t.userId, t.state),
    index('cards_user_created_idx').on(t.userId, t.createdAt),
  ],
);

// ── reviews ─────────────────────────────────────────────────────────────────
// Append-only history of every grade. Useful for stats, heatmap, FSRS retuning.

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    deckId: uuid('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(), // 1..4
    durationMs: integer('duration_ms').notNull().default(0),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
    nextDue: timestamp('next_due', { withTimezone: true }).notNull(),
    nextStability: doublePrecision('next_stability').notNull(),
    nextDifficulty: doublePrecision('next_difficulty').notNull(),
  },
  (t) => [
    index('reviews_user_idx').on(t.userId, t.reviewedAt),
    index('reviews_card_idx').on(t.cardId),
  ],
);

// ── relations ──────────────────────────────────────────────────────────────

export const profileRelations = relations(profile, ({ one }) => ({
  user: one(user, { fields: [profile.userId], references: [user.id] }),
}));

export const decksRelations = relations(decks, ({ one, many }) => ({
  user: one(user, { fields: [decks.userId], references: [user.id] }),
  parent: one(decks, {
    fields: [decks.parentId],
    references: [decks.id],
    relationName: 'deck_parent',
  }),
  children: many(decks, { relationName: 'deck_parent' }),
  cards: many(cards),
}));

export const cardsRelations = relations(cards, ({ one, many }) => ({
  user: one(user, { fields: [cards.userId], references: [user.id] }),
  deck: one(decks, { fields: [cards.deckId], references: [decks.id] }),
  reviews: many(reviews),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  user: one(user, { fields: [reviews.userId], references: [user.id] }),
  card: one(cards, { fields: [reviews.cardId], references: [cards.id] }),
  deck: one(decks, { fields: [reviews.deckId], references: [decks.id] }),
}));

// ── inferred types ─────────────────────────────────────────────────────────

export type Profile = typeof profile.$inferSelect;
export type NewProfile = typeof profile.$inferInsert;
export type Deck = typeof decks.$inferSelect;
export type NewDeck = typeof decks.$inferInsert;
export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
