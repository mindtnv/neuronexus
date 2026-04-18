// Map API responses (ISO date strings, server column names) into the UI shape
// that apps/web components already expect. Keeps the component surface stable
// while the source of truth shifts from Dexie to the server.

import { State, type Card as FsrsCard } from 'ts-fsrs';
import type { Card, Deck, Profile, Review } from './types';

type IsoOrDate = string | Date | null | undefined;

function toEpoch(v: IsoOrDate, fallback = 0): number {
  if (!v) return fallback;
  if (v instanceof Date) return v.getTime();
  const t = Date.parse(v);
  return Number.isNaN(t) ? fallback : t;
}

function toDate(v: IsoOrDate): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const stateFromLabel: Record<string, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

export function deckFromApi(row: any): Deck {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon ?? undefined,
    species: row.species ?? 'fern',
    createdAt: toEpoch(row.createdAt),
    parentId: row.parentId ?? undefined,
  };
}

export function cardFromApi(row: any): Card {
  const fsrs: FsrsCard = {
    due: toDate(row.due) ?? new Date(),
    stability: row.stability ?? 0,
    difficulty: row.difficulty ?? 0,
    elapsed_days: row.elapsedDays ?? 0,
    scheduled_days: row.scheduledDays ?? 0,
    learning_steps: row.learningSteps ?? 0,
    reps: row.reps ?? 0,
    lapses: row.lapses ?? 0,
    state: stateFromLabel[row.state] ?? State.New,
    last_review: toDate(row.lastReview),
  };
  return {
    id: row.id,
    deckId: row.deckId,
    variant: row.variant ?? 'basic',
    front: row.front ?? '',
    back: row.back ?? '',
    clozeText: row.clozeText ?? undefined,
    tags: row.tags ?? [],
    createdAt: toEpoch(row.createdAt),
    updatedAt: toEpoch(row.updatedAt),
    fsrs,
  };
}

export function profileFromApi(row: any): Profile {
  const plantStage = Math.max(0, Math.min(5, row.plantStage ?? 0)) as Profile['plantStage'];
  return {
    id: 'me',
    name: row.name ?? 'Friend',
    level: row.level ?? 1,
    xp: row.xp ?? 0,
    streakDays: row.streakDays ?? 0,
    streakFreezes: row.streakFreezes ?? 0,
    lastReviewDate: row.lastReviewDate ?? undefined,
    todayMinutes: row.todayMinutes ?? 0,
    todayMinutesDate: row.todayMinutesDate ?? undefined,
    dailyGoalMinutes: row.dailyGoalMinutes ?? 15,
    dailyGoalMetCount: row.dailyGoalMetCount ?? 0,
    dailyGoalMetDate: row.dailyGoalMetDate ?? undefined,
    desiredRetention: row.desiredRetention ?? undefined,
    plantSpecies: row.plantSpecies ?? 'fern',
    plantStage,
    unlockedSpecies: Array.isArray(row.unlockedSpecies)
      ? (row.unlockedSpecies as Profile['unlockedSpecies'])
      : ['fern'],
    createdAt: toEpoch(row.createdAt),
  };
}

export function reviewFromApi(row: any): Review {
  return {
    id: row.id,
    cardId: row.cardId,
    deckId: row.deckId,
    rating: row.rating,
    durationMs: row.durationMs ?? 0,
    reviewedAt: toEpoch(row.reviewedAt),
    nextDue: toEpoch(row.nextDue),
    nextStability: row.nextStability ?? 0,
    nextDifficulty: row.nextDifficulty ?? 0,
  };
}
