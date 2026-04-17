import type { Card as FsrsCard } from 'ts-fsrs';

export type DeckColor = 'lime' | 'amber' | 'violet' | 'sky' | 'rose' | 'neutral';
export type PlantSpecies = 'fern';
export type CardVariant = 'basic' | 'cloze' | 'type';

export interface Deck {
  id: string;
  name: string;
  color: DeckColor;
  icon?: string;
  species: PlantSpecies;
  createdAt: number;
  /** Parent deck id. Undefined for root-level decks. */
  parentId?: string;
}

export interface Card {
  id: string;
  deckId: string;
  variant: CardVariant;
  front: string;
  back: string;
  clozeText?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  fsrs: FsrsCard;
}

export type Rating = 1 | 2 | 3 | 4;

export interface Review {
  id: string;
  cardId: string;
  deckId: string;
  rating: Rating;
  durationMs: number;
  reviewedAt: number;
  nextDue: number;
  nextStability: number;
  nextDifficulty: number;
}

export interface Profile {
  id: 'me';
  name: string;
  level: number;
  xp: number;
  streakDays: number;
  lastReviewDate?: string;
  dailyGoalMinutes: number;
  plantSpecies: PlantSpecies;
  plantStage: 0 | 1 | 2 | 3 | 4 | 5;
  createdAt: number;
}
