// Built-in note-type definitions (Milestone 1, Phase 3).
//
// Three system builtins reproduce the current review.tsx behaviors:
//   - Basic   — straight front/back flip (current `variant==='basic'`)
//   - Cloze   — cloze blanks/reveal via `CLOZE_RE` (current `variant==='cloze'`)
//   - Type-in — typed-answer LCS diff vs Back (current `variant==='type'`)
//
// These carry STABLE `id` UUID literals — the single source of truth for the
// builtin primary keys, shared by migration 0007 (raw INSERT) and
// `ensureBuiltins()` (ORM upsert). They are consumed by:
//   - the seed script (packages/db, Phase 1 reseed),
//   - the API note-type bootstrap / GET /note-types (Phase 4),
//   - any code that needs to identify a builtin by kind.
//
// Engine contract (Phase 2):
//   - `generateCards` / `renderTemplate` key cloze rewriting off
//     `noteType.kind === 'cloze'` (sets `opts.cloze` internally). The cloze
//     template strings `{{Text}}` are therefore valid as-is; the engine handles
//     blank/reveal at the call site based on `kind`.
//   - `kind: 'typein'` is the capability flag the review UI will use to show the
//     typed-answer diff; the template strings are identical to Basic because the
//     diff logic is driven by `renderKind`, not a template directive.

import type { NoteTypeDef, RenderKind } from './note-type.ts';

// ── Basic ─────────────────────────────────────────────────────────────────────
//
// Front = {{Front}}
// Back  = {{Back}}
//
// Reproduces the "basic flip" branch in review.tsx. The back template renders the
// answer ONLY — no `{{Front}}<hr>` echo — because the reviewer keeps the question
// pinned above the answer the whole time, so echoing the front would duplicate it.

export const BASIC_NOTE_TYPE: NoteTypeDef = {
  id: '96bb6f6a-ad97-4e2d-9044-78a173d3df51',
  name: 'Basic',
  kind: 'basic',
  isBuiltin: true,
  styling: '',
  fields: [
    { name: 'Front', ord: 0 },
    { name: 'Back', ord: 1 },
  ],
  templates: [
    {
      name: 'Card 1',
      ord: 0,
      frontTemplate: '{{Front}}',
      backTemplate: '{{Back}}',
    },
  ],
};

// ── Cloze ─────────────────────────────────────────────────────────────────────
//
// Front = {{Text}}   (engine rewrites cloze markup → blank `[…]` because kind='cloze')
// Back  = {{Text}}<hr>{{Extra}}  (engine rewrites cloze markup → revealed answer)
//
// The engine (`generateCards` / `renderTemplate`) detects `kind === 'cloze'` and
// calls `stripCloze(out, 'front')` / `stripCloze(out, 'back')` automatically. The
// template strings therefore reference the field name verbatim; no extra directive
// is needed.
//
// Reproduces `renderClozePrompt` / `renderClozeRevealed` in review.tsx.

export const CLOZE_NOTE_TYPE: NoteTypeDef = {
  id: 'a42316eb-6a7c-46ec-a7c2-2b15492385f2',
  name: 'Cloze',
  kind: 'cloze',
  isBuiltin: true,
  styling: '',
  fields: [
    { name: 'Text', ord: 0 },
    { name: 'Extra', ord: 1 },
  ],
  templates: [
    {
      name: 'Cloze',
      ord: 0,
      frontTemplate: '{{Text}}',
      backTemplate: '{{Text}}<hr>{{Extra}}',
    },
  ],
};

// ── Type-in ───────────────────────────────────────────────────────────────────
//
// Same template shape as Basic. The `kind: 'typein'` flag is the signal the
// review UI checks (via `card.renderKind`) to show the typed-answer LCS diff
// (`diffAnswer`) against the Back field.
//
// Back = {{Back}} (answer only — no `{{Front}}<hr>` echo, same rationale as Basic:
// the reviewer keeps the question pinned, so echoing the front would duplicate it).
//
// Reproduces `variant === 'type'` / `diffAnswer` in review.tsx.

export const TYPEIN_NOTE_TYPE: NoteTypeDef = {
  id: '023045f3-da60-4fd3-89c9-582a148064d5',
  name: 'Type-in',
  kind: 'typein',
  isBuiltin: true,
  styling: '',
  fields: [
    { name: 'Front', ord: 0 },
    { name: 'Back', ord: 1 },
  ],
  templates: [
    {
      name: 'Card 1',
      ord: 0,
      frontTemplate: '{{Front}}',
      backTemplate: '{{Back}}',
    },
  ],
};

// ── Exports ───────────────────────────────────────────────────────────────────

/** All three builtins in insertion order (Basic → Cloze → Type-in). */
export const BUILTIN_NOTE_TYPES: NoteTypeDef[] = [
  BASIC_NOTE_TYPE,
  CLOZE_NOTE_TYPE,
  TYPEIN_NOTE_TYPE,
];

/** Look up a builtin by its `RenderKind`. Returns `undefined` for `'custom'`. */
export const BUILTIN_BY_KIND: Partial<Record<RenderKind, NoteTypeDef>> = {
  basic: BASIC_NOTE_TYPE,
  cloze: CLOZE_NOTE_TYPE,
  typein: TYPEIN_NOTE_TYPE,
};
