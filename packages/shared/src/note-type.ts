// Shared note-type TYPES (Milestone 1, Phase 2 — Decision B1). Pure-TS, DOM-free.
//
// These describe the Anki-style triad `note_types → notes → cards` content model
// at the type level. They are the single source of truth consumed by:
//   - the template/escape engine (`template.ts`, this phase),
//   - the built-in note-types (Phase 3),
//   - the API notes/note-types modules (Phase 4),
//   - the web editor/review/browser (Phase 5).
//
// No values live here — only types. Sanitization is NOT modelled here: field
// values are HTML strings that are sanitized at the edges (sanitize-html on the
// server save edge, DOMPurify in the browser render edge), not in shared.

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
  name: string;
  ord: number;
};

/**
 * A card template on a note-type. One template generates (at most) one card per
 * note. `frontTemplate`/`backTemplate` use the `template.ts` syntax.
 */
export type CardTemplate = {
  name: string;
  ord: number;
  frontTemplate: string;
  backTemplate: string;
};

/**
 * A full note-type definition. `id` is optional so builtins/fixtures can be
 * declared before persistence assigns one. `styling` is a raw CSS string scoped
 * to the rendered card (applied at the display edge, not by the engine).
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
 * The values for a note's fields, keyed by field name. Each value is an HTML
 * string (treated as already-sanitized at render time in production).
 */
export type FieldValues = Record<string, string>;
