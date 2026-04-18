// Shared types + helpers between apps/web and apps/api.
// Domain types are re-exported from @neuronexus/db when they are inferred from the
// Drizzle schema; everything else (pure value types, enums, constants) lives here.

export * from './fsrs.ts';
export * from './gamification.ts';

export const CARD_RATINGS = [1, 2, 3, 4] as const;

export const CARD_STATES = ['new', 'learning', 'review', 'relearning'] as const;
export type CardState = (typeof CARD_STATES)[number];

export type Maybe<T> = T | null | undefined;

export type Paginated<T> = {
  items: T[];
  nextCursor: string | null;
};
