import type { Card as FsrsCard } from 'ts-fsrs';
import type {
  CardTemplate,
  FieldValues,
  IngestErrorCode,
  MarkRect,
  NoteField,
  RenderKind,
  SourceKind,
  SourceMarkColor,
  SourceMarkKind,
  SourceStatus,
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

// ── NotebookLM sources (M1) ───────────────────────────────────────────────────
// Thin view types over the server rows (GET /notebooks, GET /sources/:id). Dates
// stay as ISO strings — the library screen renders relative/badge UI, not the
// epoch-number FSRS math the mappers do for cards.

export interface Notebook {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Source {
  id: string;
  notebookId: string;
  kind: SourceKind;
  title: string;
  url: string | null;
  status: SourceStatus;
  errorCode: IngestErrorCode | null;
  /** Computed progress: COUNT(embedded chunks). */
  indexed: number;
  /** Computed progress denominator: total chunk count (0 until parsed). */
  total: number;
  createdAt: string;
  updatedAt: string;
}

// ── Library (L1) — the user-level material store over `sources` ───────────────

export type ReadingStatus = 'unread' | 'reading' | 'finished';

/** One library item (GET /library list + GET /library/items/:id detail). A
 *  library item IS a `sources` row; the list/detail responses fold in the
 *  reading-state + aggregate counts (no N+1). */
export interface LibraryItem {
  id: string;
  kind: SourceKind;
  title: string;
  author: string | null;
  description: string | null;
  language: string | null;
  tags: string[];
  /** Ingest lifecycle status (pending|parsing|indexing|ready|error|deleting). */
  status: SourceStatus;
  errorCode: IngestErrorCode | null;
  /** Computed: COUNT(embedded chunks). */
  indexed: number;
  /** Computed denominator: total chunk count (0 until parsed). */
  total: number;
  readingStatus: ReadingStatus;
  /** Reading progress 0..1, or null when never opened. */
  percent: number | null;
  pageCount: number | null;
  byteSize: number | null;
  coverMediaId: string | null;
  notebookCount: number;
  cardCount: number;
  createdAt: string;
  updatedAt: string;
}

/** GET /library/items/:id — a library item + the notebooks it's attached to. */
export interface LibraryItemDetail extends LibraryItem {
  notebooks: { id: string; title: string }[];
}

// ── NotebookLM reader + provenance (M2/M3) ────────────────────────────────────

/** One parsed source chunk page for the reader (GET /sources/:id/chunks). */
export interface SourceChunkRow {
  id: string;
  position: number;
  text: string;
  page: number | null;
  heading: string | null;
}

/** Reader pagination page (GET /sources/:id/chunks → items + cursor). */
export interface SourceChunkPage {
  items: SourceChunkRow[];
  total: number;
  nextFrom: number | null;
}

/** One provenance backlink on a card (GET /cards/:id/sources). All ref fields go
 *  NULL after the source/notebook is deleted — a tombstone row («источник удалён»). */
export interface CardSourceLink {
  id: string;
  sourceChunkId: string | null;
  sourceId: string | null;
  notebookId: string | null;
  conversationId: string | null;
  messageId: string | null;
  sourceTitle: string | null;
  notebookTitle: string | null;
  position: number | null;
  page: number | null;
  heading: string | null;
  snippet: string | null;
  createdAt: string;
}

/** One card linked to a source (GET /sources/:id/cards). */
export interface SourceLinkedCard {
  cardId: string;
  front: string;
  deckId: string;
  deckName: string;
  count: number;
  createdAt: string;
}

// ── Reading-workflow marks (M5) ───────────────────────────────────────────────

/** One text-selection mark on a source (GET /sources/:id/marks). The server
 *  returns the full row (including `userId` — the caller's own id, not a leak),
 *  but the client only consumes the fields below; `rects` are normalized page
 *  coords. */
export interface SourceMark {
  id: string;
  sourceId: string;
  /** 1-based page index (pdf.js convention). */
  page: number;
  kind: SourceMarkKind;
  quote: string;
  rects: MarkRect[];
  color: SourceMarkColor;
  /** Freeform body for kind 'note'; null for highlights. */
  note: string | null;
  /** W4: present for kind 'card' — the id of the linked card. */
  cardId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** POST /sources/:id/quick-card → the created note + its cards. */
export interface QuickCardResult {
  noteId: string;
  cardIds: string[];
  /** W4: set when the server created a source_marks row for the card. */
  markId?: string;
}

/** POST /sources/:id/suggest-card → the AI-formulated front/back. */
export interface SuggestCardResult {
  front: string;
  back: string;
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
