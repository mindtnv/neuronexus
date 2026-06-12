// Shared «Блокноты 2.0» constants + types (N-series). DOM-free, Node-free — the
// notes/artifacts/quiz caps + the metadata palette are agreed on by BOTH edges
// (the web pre-check + the server route validation). Single source of truth,
// like SOURCE_MARK_COLORS / INGEST_ERROR_CODES.

// ── Metadata (Р13) ────────────────────────────────────────────────────────────

/** Server-capped length of a notebook's `description`. */
export const NOTEBOOK_DESCRIPTION_MAX = 500;

/** Server-capped length of a notebook's `emoji` (one grapheme in practice; the
 *  server bounds the raw string length rather than counting graphemes). */
export const NOTEBOOK_EMOJI_MAX = 16;

/** Server-capped length of a notebook `title` (matches the create route). */
export const NOTEBOOK_TITLE_MAX = 200;

/** The notebook color palette — same set the decks use (deck_color enum). A
 *  PATCH `color` must be one of these (or null to clear). */
export const NOTEBOOK_COLORS = ['lime', 'amber', 'violet', 'sky', 'rose', 'neutral'] as const;
export type NotebookColor = (typeof NOTEBOOK_COLORS)[number];

// ── Notes (Р1, Р16) ───────────────────────────────────────────────────────────

/** Note kinds: a hand-written note vs a saved chat answer (Р7). */
export const NOTEBOOK_NOTE_KINDS = ['manual', 'answer'] as const;
export type NotebookNoteKind = (typeof NOTEBOOK_NOTE_KINDS)[number];

/** Server-capped length of a note `title`. */
export const NOTE_TITLE_MAX = 200;

/** Server-capped length of a note `content` (markdown). */
export const NOTE_CONTENT_MAX = 16_000;

/** Per-notebook note cap (best-effort, Р16) → 409 `too_many_notes`. */
export const MAX_NOTES_PER_NOTEBOOK = 500;

/** Byte cap (JSON.stringify length) on a note's `citations` snapshot (Р7). */
export const NOTE_CITATIONS_MAX_BYTES = 32_000;

/** Chars of the note `content` excerpt returned in the list view (light render). */
export const NOTE_EXCERPT_MAX = 280;

// ── Artifacts / quiz (Р3, Р8, Р16) — schema laid in N1, populated in N2/N3 ──────

/** Generated-artifact types V1 (markdown types + the structured `quiz`). */
export const NOTEBOOK_ARTIFACT_TYPES = [
  'summary',
  'study_guide',
  'faq',
  'timeline',
  'glossary',
  'quiz',
] as const;
export type NotebookArtifactType = (typeof NOTEBOOK_ARTIFACT_TYPES)[number];

/** Artifact job lifecycle (the `notebook_artifacts.status` column). */
export const ARTIFACT_STATUSES = ['pending', 'generating', 'ready', 'error'] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

/** Machine error codes stored in `notebook_artifacts.error_code` (NOT prose). */
export const ARTIFACT_ERROR_CODES = [
  'ai_disabled',
  'timeout',
  'generation_failed',
  'invalid_quiz',
  'no_sources',
  'interrupted',
] as const;
export type ArtifactErrorCode = (typeof ARTIFACT_ERROR_CODES)[number];

/** Per-notebook artifact cap (Р16) → 409 `too_many_artifacts`. */
export const MAX_ARTIFACTS_PER_NOTEBOOK = 50;

/** One quiz question (Р8). MCQ/TF auto-checked; `open` is human self-graded. */
export interface QuizQuestion {
  id: string;
  kind: 'mcq' | 'tf' | 'open';
  prompt: string;
  options?: string[];
  answerIndex?: number;
  answerText?: string;
  explanation?: string;
  sourceChunkId?: string;
}

/** The `notebook_artifacts.content_json` payload for `type='quiz'`. */
export interface QuizContent {
  questions: QuizQuestion[];
}

/** Default + max questions a generated quiz carries (Р16). */
export const QUIZ_QUESTIONS_DEFAULT = 10;
export const QUIZ_QUESTIONS_MAX = 20;
