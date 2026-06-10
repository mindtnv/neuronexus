// Map API responses (ISO date strings, server column names) into the UI shape
// that apps/web components already expect. Keeps the component surface stable
// while the source of truth shifts from Dexie to the server.

import { State, type Card as FsrsCard } from 'ts-fsrs';
import type { RenderKind } from '@neuronexus/shared';
import type { Card, Deck, DeckOptionsPreset, FilteredDeck, FilteredDeckSortOrder, Note, NoteType, Profile, Review } from './types';

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
    presetId: row.presetId ?? null,
  };
}

export function presetFromApi(row: any): DeckOptionsPreset {
  return {
    id: row.id,
    userId: row.userId ?? '',
    name: row.name,
    newPerDay: row.newPerDay ?? 20,
    reviewsPerDay: row.reviewsPerDay ?? 200,
    learningSteps: Array.isArray(row.learningSteps) ? row.learningSteps : [],
    relearningSteps: Array.isArray(row.relearningSteps) ? row.relearningSteps : [],
    desiredRetention: row.desiredRetention ?? null,
    leechThreshold: row.leechThreshold ?? 8,
    maximumInterval: row.maximumInterval ?? 36500,
    createdAt: toEpoch(row.createdAt),
    updatedAt: toEpoch(row.updatedAt),
  };
}

export function filteredDeckFromApi(row: any): FilteredDeck {
  return {
    id: row.id,
    userId: row.userId ?? '',
    name: row.name,
    query: row.query ?? '',
    sortOrder: (row.sortOrder ?? 'due') as FilteredDeckSortOrder,
    cardLimit: row.cardLimit ?? 50,
    includeSuspended: row.includeSuspended ?? false,
    createdAt: toEpoch(row.createdAt),
    updatedAt: toEpoch(row.updatedAt),
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
  // Embedded note/noteType from the enriched card read-payload (used for the
  // lazy HTML render path). Tags live on the note (Anki-correct).
  const note = row.note
    ? {
        id: row.note.id,
        fieldValues: (row.note.fieldValues ?? {}) as Record<string, string>,
        tags: (row.note.tags ?? []) as string[],
      }
    : null;
  const noteType = row.noteType
    ? {
        id: row.noteType.id,
        name: row.noteType.name ?? '',
        kind: (row.noteType.kind ?? 'basic') as RenderKind,
        templates: row.noteType.templates ?? [],
        styling: row.noteType.styling ?? '',
      }
    : null;
  return {
    id: row.id,
    deckId: row.deckId,
    noteId: row.noteId,
    templateOrd: row.templateOrd ?? 0,
    renderText: row.renderText ?? '',
    renderFrontText: row.renderFrontText ?? '',
    renderBackText: row.renderBackText ?? '',
    renderKind: (row.renderKind ?? 'basic') as RenderKind,
    // Tags from the embedded note (fallback to row.tags / [] for safety).
    tags: note?.tags ?? row.tags ?? [],
    suspended: row.suspended ?? false,
    createdAt: toEpoch(row.createdAt),
    updatedAt: toEpoch(row.updatedAt),
    fsrs,
    note,
    noteType,
  };
}

export function noteFromApi(row: any): Note {
  return {
    id: row.id,
    noteTypeId: row.noteTypeId,
    fieldValues: (row.fieldValues ?? {}) as Record<string, string>,
    tags: (row.tags ?? []) as string[],
    deckId: row.deckId ?? '',
  };
}

export function noteTypeFromApi(row: any): NoteType {
  return {
    id: row.id,
    name: row.name,
    fields: row.fields ?? [],
    templates: row.templates ?? [],
    styling: row.styling ?? '',
    kind: (row.kind ?? 'custom') as RenderKind,
    isBuiltin: row.isBuiltin ?? false,
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
    agentInstructions: row.agentInstructions ?? undefined,
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
