import type { Card as FsrsCard } from 'ts-fsrs';
import type {
  CardTemplate,
  FieldValues,
  NoteField,
  RenderKind,
} from '@neuronexus/shared';

export type DeckColor = 'lime' | 'amber' | 'violet' | 'sky' | 'rose' | 'neutral';
export type PlantSpecies = 'fern' | 'cactus' | 'succulent' | 'bonsai' | 'sakura' | 'mushroom';

export interface Deck {
  id: string;
  name: string;
  color: DeckColor;
  icon?: string;
  species: PlantSpecies;
  createdAt: number;
  /** Parent deck id. Undefined for root-level decks. */
  parentId?: string;
  /** Bound preset id. Null or undefined = inherit/default. */
  presetId?: string | null;
}

// ── Deck Options Presets (M3) ─────────────────────────────────────────────────

/**
 * A named set of FSRS + queue options that can be bound to one or more decks.
 * When a deck has no preset bound, it uses the system Anki defaults.
 */
export interface DeckOptionsPreset {
  id: string;
  userId: string;
  name: string;
  newPerDay: number;
  reviewsPerDay: number;
  /** Learning steps, e.g. ["1m", "10m"]. */
  learningSteps: string[];
  /** Relearning steps, e.g. ["10m"]. */
  relearningSteps: string[];
  /** Override desired retention (0.7–0.99). Null = inherit global. */
  desiredRetention: number | null;
  leechThreshold: number;
  maximumInterval: number;
  createdAt: number;
  updatedAt: number;
}

// ── Filtered Decks (M3) ──────────────────────────────────────────────────────

/**
 * The sort order for a filtered-deck session. Mirrors the server enum
 * (`sort_order` column in `filtered_deck`).
 */
export type FilteredDeckSortOrder =
  | 'due'
  | 'added'
  | 'random'
  | 'difficultyDesc'
  | 'overdue'
  | 'lapses'
  | 'cram';

/**
 * A named custom-study session backed by a card query + sort/limit config.
 * Session cards are returned under the `due` key in the queue envelope and
 * graded with `source: 'filtered'` so the daily counters are skipped.
 */
export interface FilteredDeck {
  id: string;
  userId: string;
  name: string;
  /** Card search query (same grammar as the Browse search box). */
  query: string;
  sortOrder: FilteredDeckSortOrder;
  cardLimit: number;
  includeSuspended: boolean;
  createdAt: number;
  updatedAt: number;
}

// ── Note-types model (M1) ─────────────────────────────────────────────────────

/** A note-type the user can author against (own or a global builtin). */
export interface NoteType {
  id: string;
  name: string;
  fields: NoteField[];
  templates: CardTemplate[];
  styling: string;
  kind: RenderKind;
  isBuiltin: boolean;
}

/** A note — the user's content. Generates one-or-more cards via its note-type. */
export interface Note {
  id: string;
  noteTypeId: string;
  fieldValues: FieldValues;
  tags: string[];
  /** All cards of a note share one deck (Decision A1). */
  deckId: string;
}

/**
 * A card is one (note × template) pairing with its own FSRS state. Content is
 * derived from its note via the note-type template. The `render*` columns are
 * the server-rendered PLAINTEXT search cache (tags + cloze stripped); display
 * HTML is rendered lazily from `note.fieldValues` + `noteType.templates`. The
 * embedded `note`/`noteType` come from the enriched card read-payload.
 */
export interface Card {
  id: string;
  deckId: string;
  noteId: string;
  templateOrd: number;
  /** Server-rendered plaintext (front + back, search cache). */
  renderText: string;
  /** Server-rendered plaintext front (Browse "Question" column). */
  renderFrontText: string;
  /** Server-rendered plaintext back (Browse "Answer" column). */
  renderBackText: string;
  /** Render mode — picked from the payload with no extra fetch (C-5). */
  renderKind: RenderKind;
  /** Note-level tags (Anki-correct), surfaced from the embedded note. */
  tags: string[];
  suspended: boolean;
  createdAt: number;
  updatedAt: number;
  fsrs: FsrsCard;
  /** Embedded note (id, sanitized field values, tags) for lazy HTML render. */
  note?: { id: string; fieldValues: FieldValues; tags: string[] } | null;
  /** Embedded note-type (name, kind, templates, styling) for lazy HTML render. */
  noteType?: {
    id: string;
    name: string;
    kind: RenderKind;
    templates: CardTemplate[];
    styling: string;
  } | null;
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
  streakFreezes: number;
  lastReviewDate?: string;
  todayMinutes: number;
  todayMinutesDate?: string;
  dailyGoalMinutes: number;
  dailyGoalMetCount: number;
  dailyGoalMetDate?: string;
  desiredRetention?: number;
  /** Standing instructions for the agentic chat (C5) — injected into the system prompt. */
  agentInstructions?: string;
  plantSpecies: PlantSpecies;
  plantStage: 0 | 1 | 2 | 3 | 4 | 5;
  unlockedSpecies: PlantSpecies[];
  createdAt: number;
}
