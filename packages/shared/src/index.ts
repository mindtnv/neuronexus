// Shared types + helpers between apps/web and apps/api.
// Domain types are re-exported from @neuronexus/db when they are inferred from the
// Drizzle schema; everything else (pure value types, enums, constants) lives here.

export * from './fsrs.ts';
export * from './gamification.ts';
export * from './card-query.ts';
export * from './card-query-predicate.ts';
export * from './card-query-match.ts';
export * from './note-type.ts';
export * from './template.ts';
export * from './builtin-note-types.ts';
export * from './media.ts';
export * from './kb-chunk.ts';
export * from './notebook-source.ts';
export * from './chat-models.ts';
export * from './rag-prompt.ts';

export const CARD_RATINGS = [1, 2, 3, 4] as const;

export const CARD_STATES = ['new', 'learning', 'review', 'relearning'] as const;
export type CardState = (typeof CARD_STATES)[number];

export type Maybe<T> = T | null | undefined;

export type Paginated<T> = {
  items: T[];
  nextCursor: string | null;
};
