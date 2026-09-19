// Shared note-type TYPES (Milestone 1, Phase 2 — Decision B1). Pure-TS, DOM-free.
//
// These describe the Anki-style triad `note_types → notes → cards` content model
// at the type level. They are the single source of truth consumed by:
//   - the template/escape engine (`template.ts`, this phase),
//   - the built-in note-types (Phase 3),
//   - the API notes/note-types modules (Phase 4),
//   - the web editor/review/browser (Phase 5).
//
// Field values are lossless Markdown source, never trusted HTML.

/**
 * The render behaviour a note-type's cards exhibit. Denormalized onto the card
 * row (Critic must-fix C-5) so `/cards/queue` + review can pick a render mode
 * without an extra fetch/join.
 *
 *  - `basic`  — straight front/back flip.
 *  - `cloze`  — cloze deletions (front = prompt with blanks, back = revealed).
 *  - `typein` — type-in answer with an LCS diff against the answer field.
 *  - `custom` — user-defined note-type; render straight template output.
 */
export type RenderKind = 'basic' | 'cloze' | 'typein' | 'custom';

/** A single named field on a note-type, ordered by `ord`. */
export type NoteField = {
  /** Stable within the type. Legacy definitions gain a deterministic read ID. */
  id?: string;
  name: string;
  ord: number;
  /** Explicit typed-answer target; follows the field's stable identity. */
  typeinAnswer?: boolean;
};

/**
 * A template generates one ordinary card, or one card per distinct cloze number.
 * `frontTemplate`/`backTemplate` use the `template.ts` syntax.
 */
export type CardTemplate = {
  /** Stable question identity; ord is only its current display position. */
  id?: string;
  name: string;
  ord: number;
  frontTemplate: string;
  backTemplate: string;
};

/**
 * A full note-type definition. `id` is optional so builtins/fixtures can be
 * declared before persistence assigns one. `styling` preserves legacy CSS for
 * portability; arbitrary per-type CSS is not applied by the renderer.
 */
export type NoteTypeDef = {
  id?: string;
  name: string;
  fields: NoteField[];
  templates: CardTemplate[];
  styling: string;
  isBuiltin: boolean;
  kind: RenderKind;
};

/**
 * Lossless Markdown source keyed by field name; sanitize rendered HTML, not source.
 */
export type FieldValues = Record<string, string>;

/** Owner-scoped, bounded impact of regenerating one or more notes. */
export interface CardRegenerationPreview {
  kindTransition?: { from: string; to: string; resetsQuestions: boolean };
  validation?: {
    checkedNotes: number;
    invalidNotes: number;
    samples: { front: string; questions: string[]; answers?: string[]; answer?: string; omittedTemplates: string[]; error?: string }[];
  };
  impact: {
    retainedClozeTargets?: Record<string, number>;
    willCreateCards: number;
    willKeepCards: number;
    willDeleteCards: number;
    willDeleteReviews: number;
    removedCards: { id: string; front: string; reviews: number }[];
  };
  confirmationToken: string;
  sourceVersion: string;
}


export interface NoteConversionInput {
  newCardsDeckId?: string;
  noteIds: string[];
  sourceTypeId: string;
  targetTypeId: string;
  sourceVersion: string;
  targetVersion: string;
  fieldMap: Record<string, string | null>;
  templateMap: Record<string, string | null>;
  preserveUnmappedFields: boolean;
  confirmationToken?: string;
}
export interface NoteConversionPreview extends CardRegenerationPreview {
  newCardsDeckId?: string;
  newCardsDeckName?: string;
  targetVersion: string;
  noteCount: number;
  fieldMapping: { target: string; source: string | null }[];
  cardMapping?: { target: { name: string; ord: number }; source: { name: string; ord: number } | null }[];
  unmappedFields: { field: string; action: 'preserve' | 'discard'; nonemptyNotes: number; example: string }[];
  unmappedFieldCount: number;
  discardedValues: number;
  discardedAlternatives: number;
}
