import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating as FsrsRating,
  State,
  type Card as FsrsCard,
  type Grade,
} from 'ts-fsrs';
import type { Rating } from './types';

const params = generatorParameters({ enable_fuzz: true, enable_short_term: true });
const scheduler = fsrs(params);

export function newFsrsCard(now: Date = new Date()): FsrsCard {
  return createEmptyCard(now);
}

const ratingMap: Record<Rating, Grade> = {
  1: FsrsRating.Again,
  2: FsrsRating.Hard,
  3: FsrsRating.Good,
  4: FsrsRating.Easy,
};

export function previewGrades(card: FsrsCard, now: Date = new Date()) {
  const all = scheduler.repeat(card, now);
  return {
    1: all[FsrsRating.Again].card,
    2: all[FsrsRating.Hard].card,
    3: all[FsrsRating.Good].card,
    4: all[FsrsRating.Easy].card,
  };
}

export function gradeFsrs(card: FsrsCard, rating: Rating, now: Date = new Date()) {
  return scheduler.next(card, now, ratingMap[rating]);
}

export function isDue(card: FsrsCard, now: Date = new Date()): boolean {
  return new Date(card.due).getTime() <= now.getTime();
}

export function stateLabel(state: State): 'new' | 'learning' | 'review' | 'relearning' {
  switch (state) {
    case State.New:
      return 'new';
    case State.Learning:
      return 'learning';
    case State.Review:
      return 'review';
    case State.Relearning:
      return 'relearning';
  }
}

export function humanInterval(card: FsrsCard, now: Date = new Date()): string {
  const ms = new Date(card.due).getTime() - now.getTime();
  if (ms <= 0) return 'now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.round(months / 12)}y`;
}
