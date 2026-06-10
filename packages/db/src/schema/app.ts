import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import type {
  CardTemplate,
  Citation,
  FieldValues,
  MessageAttachment,
  MessageMention,
  MessageUsage,
  NoteField,
  ToolCallRecord,
} from '@neuronexus/shared';
import { user } from './auth.ts';

// Embedding vector dimension baked into the `kb_chunk.embedding` column type.
// MUST match the configured EMBEDDING_MODEL (text-embedding-3-small = 1536).
// The migration bakes this LITERAL into the generated SQL; changing it requires
// the reindex-on-model-change runbook (see CLAUDE.md → AI / RAG): regenerate the
// migration (drop + re-add the vector column + rebuild the HNSW index) + reindex.
export const EMBEDDING_DIM = 1536;

// Citation is imported from @neuronexus/shared (packages/shared/src/kb-chunk.ts).
// Re-export so consumers of @neuronexus/db/schema can import it from one place.
export type { Citation };

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
  // Per-day new-card + review counters. Reset when `dailyCountsDate` (ISO
  // yyyy-mm-dd) differs from today — same pattern as `todayMinutes` ledger.
  newIntroducedToday: integer('new_introduced_today').notNull().default(0),
  reviewsDoneToday: integer('reviews_done_today').notNull().default(0),
  dailyCountsDate: text('daily_counts_date'),
  desiredRetention: doublePrecision('desired_retention'),
  // Standing instructions for the agentic chat (settings → injected into the
  // system prompt as preferences; can never override grounding/confirm rules).
  // Cap (2000 chars) enforced at the PATCH route, not the column.
  agentInstructions: text('agent_instructions'),
  plantSpecies: plantSpecies('plant_species').notNull().default('fern'),
  plantStage: integer('plant_stage').notNull().default(0),
  unlockedSpecies: text('unlocked_species')
    .array()
    .notNull()
    .default(sql`ARRAY['fern','cactus','succulent','bonsai','sakura','mushroom']::text[]`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── deck_options_preset ──────────────────────────────────────────────────────
// Named FSRS / scheduling preset that can be attached to one or more decks.
// When a deck's `presetId` is set, its FSRS parameters (steps, retention,
// limits) are resolved from the preset instead of the user's global profile.
// `desiredRetention` is NULLABLE — when NULL, falls back to profile-level.

export const deckOptionsPreset = pgTable(
  'deck_options_preset',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    newPerDay: integer('new_per_day').notNull().default(20),
    reviewsPerDay: integer('reviews_per_day').notNull().default(200),
    learningSteps: text('learning_steps')
      .array()
      .notNull()
      .default(sql`ARRAY['1m','10m']::text[]`),
    relearningSteps: text('relearning_steps')
      .array()
      .notNull()
      .default(sql`ARRAY['10m']::text[]`),
    desiredRetention: doublePrecision('desired_retention'),
    leechThreshold: integer('leech_threshold').notNull().default(8),
    maximumInterval: integer('maximum_interval').notNull().default(36500),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('deck_options_preset_user_idx').on(t.userId)],
);

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
    // Optional binding to a named FSRS preset. ON DELETE SET NULL so deleting a
    // preset unbinds decks automatically rather than cascading the deck delete.
    presetId: uuid('preset_id').references(() => deckOptionsPreset.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('decks_user_idx').on(t.userId),
    index('decks_parent_idx').on(t.parentId),
    index('decks_preset_idx').on(t.presetId),
  ],
);

// ── note_types ────────────────────────────────────────────────────────────────
// Anki-style note-type definitions (Milestone 1, Decision B1 + C-4). A note-type
// owns a set of fields + card templates + styling. `userId` is NULLABLE: a NULL
// owner means a GLOBAL built-in (visible to every user), seeded once with
// `isBuiltin = true`. User-created / cloned types carry `userId = <owner>`.
// `fields` / `templates` are typed JSON (NoteField[] / CardTemplate[] from
// @neuronexus/shared). `kind` is the RenderKind denormalized for fast render-mode
// selection.

export const noteTypes = pgTable(
  'note_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // NULLABLE → global builtin (C-4). No ON DELETE needed for NULL rows; user
    // rows cascade when the user is deleted.
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    fields: jsonb('fields').notNull().$type<NoteField[]>(),
    templates: jsonb('templates').notNull().$type<CardTemplate[]>(),
    styling: text('styling').notNull().default(''),
    kind: text('kind').notNull().default('custom'),
    isBuiltin: boolean('is_builtin').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('note_types_user_idx').on(t.userId),
    // Partial unique index over global builtins (userId NULL, isBuiltin true) so
    // `ensureBuiltins()` / migration 0007 can `ON CONFLICT (name) WHERE
    // is_builtin AND user_id IS NULL DO NOTHING` — idempotent + concurrency-safe.
    // User-owned rows (userId set) are excluded, so a user may freely name a
    // type "Basic" without clashing with the global builtin.
    uniqueIndex('note_types_builtin_uq')
      .on(t.name)
      .where(sql`is_builtin AND user_id IS NULL`),
  ],
);

// ── notes ─────────────────────────────────────────────────────────────────────
// A note is the user's content: field values keyed by field name (already
// sanitized at the save edge) + note-level tags (Anki tags are note-level). Each
// note generates one-or-more `cards` via the note-type's templates.

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    noteTypeId: uuid('note_type_id')
      .notNull()
      .references(() => noteTypes.id, { onDelete: 'cascade' }),
    fieldValues: jsonb('field_values').notNull().$type<FieldValues>(),
    tags: text('tags').array().notNull().default(sql`ARRAY[]::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notes_user_idx').on(t.userId),
    // GIN on tags (re-homed from cards) powers `tag:` array containment.
    index('notes_tags_gin_idx').using('gin', t.tags),
    index('notes_user_created_idx').on(t.userId, t.createdAt),
  ],
);

// ── cards ───────────────────────────────────────────────────────────────────
// A card is one (note × template) pairing carrying its own FSRS state. Content
// is derived from its note via the note-type template; the `render*` columns
// denormalize PLAINTEXT (tags + cloze stripped) for SQL search only — display
// HTML is rendered lazily from sanitized field values. `renderKind` lets
// `/cards/queue` + review pick a render mode with no extra fetch/join.
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
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    templateOrd: integer('template_ord').notNull().default(0),
    // Denormalized plaintext (search cache, NOT a security artifact).
    renderText: text('render_text').notNull().default(''),
    renderFrontText: text('render_front_text').notNull().default(''),
    renderBackText: text('render_back_text').notNull().default(''),
    renderKind: text('render_kind').notNull().default('basic'),
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
    index('cards_note_idx').on(t.noteId),
    // Card-database (Browse) query paths:
    //  - (user_id, state) and (user_id, created_at) match the hot filter+sort
    //    paths of GET /cards/search (is:/state filters, default created sort).
    //  - tag: now resolves via notes.tags GIN (notes_tags_gin_idx).
    index('cards_user_state_idx').on(t.userId, t.state),
    index('cards_user_created_idx').on(t.userId, t.createdAt),
  ],
);

// ── reviews ─────────────────────────────────────────────────────────────────
// Append-only history of every grade. Useful for stats, heatmap, FSRS retuning.

// Pre-grade snapshot stored on the review row that created the grade. Holds the
// EXACT mutate-set of the grade transaction (card columns mutated at the FSRS
// step + profile columns mutated by the gamification rollup), so undo restores
// byte-identically. Date columns are serialized to ISO strings for JSONB.
export interface UndoSnapshot {
  card: {
    due: string; // ISO
    stability: number;
    difficulty: number;
    elapsedDays: number;
    scheduledDays: number;
    learningSteps: number;
    reps: number;
    lapses: number;
    state: 'new' | 'learning' | 'review' | 'relearning';
    lastReview: string | null; // ISO | null
    suspended: boolean;
    updatedAt: string; // ISO
  };
  // Null when the user had no profile row at grade time (rollup was skipped).
  profile: {
    streakDays: number;
    streakFreezes: number;
    lastReviewDate: string | null;
    todayMinutes: number;
    todayMinutesDate: string | null;
    dailyGoalMetCount: number;
    dailyGoalMetDate: string | null;
    xp: number;
    level: number;
    plantStage: number;
    newIntroducedToday: number;
    reviewsDoneToday: number;
    dailyCountsDate: string | null;
    updatedAt: string; // ISO
  } | null;
}

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
    // Pre-grade snapshot of the card + profile mutate-set, written when this
    // review row is created. `POST /reviews/undo` restores the card + profile
    // from this snapshot and deletes the row — atomic, byte-identical rollback
    // of exactly the fields the grade transaction mutates. NULL on legacy rows
    // (pre-0008) or rows that have already been undone (the row is deleted).
    // Date fields are stored as ISO strings (reconstructed via `new Date(...)`).
    undoSnapshot: jsonb('undo_snapshot').$type<UndoSnapshot>(),
  },
  (t) => [
    index('reviews_user_idx').on(t.userId, t.reviewedAt),
    index('reviews_card_idx').on(t.cardId),
    // Deck-scoped study_stats / retention aggregations filter by
    // (user_id, deck_id IN (...), reviewed_at >= ...) — this index lets
    // Postgres enter the right slice directly instead of post-filtering
    // the (user_id, reviewed_at) scan.
    index('reviews_user_deck_reviewed_idx').on(t.userId, t.deckId, t.reviewedAt),
  ],
);

// ── media ───────────────────────────────────────────────────────────────────
// Tracks uploaded media objects (images) stored in S3-compatible storage.
// `id` is the UUID used as both the DB primary key and the S3 key
// (`media/{id}`, ext-free per C-1). The API reads the returned `id` to
// construct the storage key and the `/m/{id}` token. `s3Key` stores the full
// key (`media/{id}`) for clarity; it is unique across the bucket. `userId`
// cascades on user delete.
//
// Ownership-bound lifecycle (M2 validation fix): `POST /media/presign` INSERTs a
// PENDING row (`verified = false`) immediately to CLAIM the uuid under the
// caller; `POST /media/:id/finalize` SELECTs it by `(id, userId)` (404 if
// missing — so user B can't finalize user A's presigned uuid) then flips
// `verified = true` after the HEAD + magic-byte sniff. `GET /media` returns only
// `verified = true` rows. Pending/unverified rows are orphan-cleanup candidates.
// (The dead `width`/`height` columns were dropped in migration 0005 — re-add in
// a future milestone if image dimensions are needed.)

export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    s3Key: text('s3_key').notNull().unique(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    // false until finalize verifies the real bytes; presign sets it false.
    verified: boolean('verified').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('media_user_idx').on(t.userId)],
);

// ── filtered_deck ────────────────────────────────────────────────────────────
// A filtered (cram) deck: a saved query + scheduling policy that pulls cards
// matching arbitrary criteria into a temporary study session without moving
// them out of their home decks permanently. `sort_order` and `card_limit` use
// explicit column names to avoid SQL reserved words `order`/`limit`.

export const filteredDeck = pgTable(
  'filtered_deck',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    query: text('query').notNull(),
    sortOrder: text('sort_order').notNull().default('due'),
    cardLimit: integer('card_limit').notNull().default(50),
    includeSuspended: boolean('include_suspended').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('filtered_deck_user_idx').on(t.userId)],
);

// ── kb_chunk ──────────────────────────────────────────────────────────────────
// DERIVED, disposable knowledge-base index (RAG substrate). NOT a source of
// truth: each row is rebuildable at any time from `cards.render_text` (like
// `cards.render_text` is itself a derived search cache). Deleting the source
// card cascades the chunk via the typed `card_id` FK.
//
// AC7 SEAM — source-agnostic by design. Generic `source_type`/`source_id`/
// `parent_id` columns let a future `'document'` (multi-chunk) or `'note'` source
// plug in WITHOUT touching retrieval/chat core (which only reads generic chunk
// columns). A real FK is only safe for the card source, so cascade-on-delete is
// achieved via a nullable typed `card_id → cards(cascade)` (set for card chunks,
// null for future doc chunks); future sources each add their own nullable FK.
//
// `embedding` is NULLABLE so a row can exist before it is embedded. `source_hash`
// = hash(render_text + embeddingModel): indexCard/reconcile SKIP re-embedding
// when it already matches, so a no-content `updatedAt` bump (forget/setDue/bulk
// move) does NOT trigger a paid re-embed; including embeddingModel means a model
// change naturally invalidates every chunk → full reindex.
//
// Index choice — HNSW over IVFFlat: no training / `lists` tuning, good recall on
// a small/growing corpus, fine build cost at n=1. The HNSW index is GLOBAL across
// all users — retrieval MUST always carry a `user_id = $userId` predicate (it is
// the sole cross-tenant boundary).

export const kbChunk = pgTable(
  'kb_chunk',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    parentId: uuid('parent_id').notNull(),
    position: integer('position').notNull().default(0),
    text: text('text').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIM }),
    embeddingModel: text('embedding_model'),
    sourceHash: text('source_hash'),
    // Typed cascade FK for the card source (null for future non-card sources).
    cardId: uuid('card_id').references(() => cards.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('kb_chunk_user_idx').on(t.userId),
    index('kb_chunk_source_idx').on(t.sourceType, t.sourceId),
    // Idempotent upsert key for card re-index (one chunk per (card, position)).
    uniqueIndex('kb_chunk_card_pos_uq').on(t.cardId, t.position),
    // HNSW cosine index for ANN search via the `<=>` operator.
    index('kb_chunk_embedding_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops')),
    // Card-source invariant: a 'card' chunk MUST carry its typed cardId (so the
    // cascade FK fires on card delete); non-card sources MUST leave it null.
    check('kb_chunk_card_source_chk', sql`(source_type = 'card') = (card_id is not null)`),
  ],
);

// ── conversations ─────────────────────────────────────────────────────────────
// A persisted chat thread, user-scoped. Newest-first listing via the
// (user_id, updated_at desc) index.

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title'),
    // Pinned threads sort above the date groups. Pin toggles do NOT bump
    // `updatedAt` (recency must reflect actual conversation activity).
    pinned: boolean('pinned').notNull().default(false),
    // Context auto-compression cache: a model-generated summary of the turns
    // older than `summaryUpto` (the created_at of the last summarized row).
    // Rebuilt lazily when more rows age past the keep-window; losing it only
    // costs one extra summarization call.
    summary: text('summary'),
    summaryUpto: timestamp('summary_upto', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('conversations_user_updated_idx').on(t.userId, t.updatedAt.desc())],
);

// ── messages ────────────────────────────────────────────────────────────────────
// One turn in a conversation. `citations` carries the resolved source cards for
// an assistant message (rendered through RichCard on the client) — empty for
// user/system turns and for "not in your cards" answers. `user_id` is
// denormalized for cheap user-scoping; the conversation FK cascades on delete.

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'user' | 'assistant' | 'system' | 'tool'
    // `content` stays NOT NULL (additive — no destructive DROP NOT NULL). A
    // tool-calls-only assistant row stores `''` (sentinel); a `role:'tool'` row
    // stores the JSON-stringified tool result. Disambiguation is structural
    // (non-null `toolCalls` ⇒ tool-call row; `role='tool'` ⇒ result row), never
    // by content emptiness — see the agent loop history mapping + chat UI
    // reconstruction rule.
    content: text('content').notNull(),
    // Set on an assistant row that emitted tool calls (the OpenAI wire shape so
    // a persisted row replays straight back into `messages[]`); null otherwise.
    toolCalls: jsonb('tool_calls').$type<ToolCallRecord[]>(),
    // Set on a `role:'tool'` result row, linking it to its parent's tool call;
    // null otherwise.
    toolCallId: text('tool_call_id'),
    citations: jsonb('citations')
      .notNull()
      .$type<Citation[]>()
      .default(sql`'[]'::jsonb`),
    // Accumulated token usage for the turn (final assistant text row; a
    // suspended turn parks its usage-so-far on the pending tool_calls row).
    // Null when the provider reports no usage.
    usage: jsonb('usage').$type<MessageUsage>(),
    // Effective model for the turn (assistant rows only) — the per-turn picker
    // choice or the env default at the time of the turn.
    model: text('model'),
    // Composer @-mentions (user rows only). Snapshot at send time; the stored
    // `content` stays clean — the <mentioned_cards> block is appended to the
    // model-facing content at history-build time.
    mentions: jsonb('mentions').$type<MessageMention[]>(),
    // Composer file attachments (user rows only): image refs (`/m/<uuid>` token,
    // server-resolved from the user-scoped media row) and inline text files.
    // Model-facing parts/blocks are built at history time; content stays clean.
    attachments: jsonb('attachments').$type<MessageAttachment[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('messages_conversation_idx').on(t.conversationId, t.createdAt),
    // Idempotent resume backstop (Phase B): at most one `role:'tool'` result row
    // per (conversation, tool_call_id) so a double/concurrent Apply hits a
    // unique violation at the storage layer. Partial index — precedent
    // `note_types_builtin_uq` proves db:generate round-trips `WHERE` clauses.
    uniqueIndex('messages_tool_result_uq')
      .on(t.conversationId, t.toolCallId)
      .where(sql`role = 'tool'`),
  ],
);

// ── relations ──────────────────────────────────────────────────────────────

export const profileRelations = relations(profile, ({ one }) => ({
  user: one(user, { fields: [profile.userId], references: [user.id] }),
}));

export const deckOptionsPresetRelations = relations(deckOptionsPreset, ({ one, many }) => ({
  user: one(user, { fields: [deckOptionsPreset.userId], references: [user.id] }),
  decks: many(decks),
}));

export const decksRelations = relations(decks, ({ one, many }) => ({
  user: one(user, { fields: [decks.userId], references: [user.id] }),
  parent: one(decks, {
    fields: [decks.parentId],
    references: [decks.id],
    relationName: 'deck_parent',
  }),
  children: many(decks, { relationName: 'deck_parent' }),
  preset: one(deckOptionsPreset, { fields: [decks.presetId], references: [deckOptionsPreset.id] }),
  cards: many(cards),
}));

export const noteTypesRelations = relations(noteTypes, ({ one, many }) => ({
  user: one(user, { fields: [noteTypes.userId], references: [user.id] }),
  notes: many(notes),
}));

export const notesRelations = relations(notes, ({ one, many }) => ({
  user: one(user, { fields: [notes.userId], references: [user.id] }),
  noteType: one(noteTypes, { fields: [notes.noteTypeId], references: [noteTypes.id] }),
  cards: many(cards),
}));

export const cardsRelations = relations(cards, ({ one, many }) => ({
  user: one(user, { fields: [cards.userId], references: [user.id] }),
  deck: one(decks, { fields: [cards.deckId], references: [decks.id] }),
  note: one(notes, { fields: [cards.noteId], references: [notes.id] }),
  reviews: many(reviews),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  user: one(user, { fields: [reviews.userId], references: [user.id] }),
  card: one(cards, { fields: [reviews.cardId], references: [cards.id] }),
  deck: one(decks, { fields: [reviews.deckId], references: [decks.id] }),
}));

export const mediaRelations = relations(media, ({ one }) => ({
  user: one(user, { fields: [media.userId], references: [user.id] }),
}));

export const filteredDeckRelations = relations(filteredDeck, ({ one }) => ({
  user: one(user, { fields: [filteredDeck.userId], references: [user.id] }),
}));

export const kbChunkRelations = relations(kbChunk, ({ one }) => ({
  user: one(user, { fields: [kbChunk.userId], references: [user.id] }),
  card: one(cards, { fields: [kbChunk.cardId], references: [cards.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(user, { fields: [conversations.userId], references: [user.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  user: one(user, { fields: [messages.userId], references: [user.id] }),
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

// ── inferred types ─────────────────────────────────────────────────────────

export type Profile = typeof profile.$inferSelect;
export type NewProfile = typeof profile.$inferInsert;
export type Deck = typeof decks.$inferSelect;
export type NewDeck = typeof decks.$inferInsert;
export type NoteType = typeof noteTypes.$inferSelect;
export type NewNoteType = typeof noteTypes.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
export type DeckOptionsPreset = typeof deckOptionsPreset.$inferSelect;
export type NewDeckOptionsPreset = typeof deckOptionsPreset.$inferInsert;
export type FilteredDeck = typeof filteredDeck.$inferSelect;
export type NewFilteredDeck = typeof filteredDeck.$inferInsert;
export type KbChunk = typeof kbChunk.$inferSelect;
export type NewKbChunk = typeof kbChunk.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
