// PDF reader ink annotations (M4) — shared types between apps/web (the pdf.js
// reader + ink overlay) and apps/api (the source_annotations route validation +
// the list_marked_passages tool). Pure TS — no DOM, no Node-only APIs.
//
// Strokes are VECTOR data in NORMALIZED page coordinates (0..1, y down), so they
// are zoom-independent and replay at any scale. The page index is 1-BASED (the
// pdf.js convention) everywhere — the server column, the route param, and the
// chunk-page join all agree on 1-based.

/** One ink stroke drawn on a page, in normalized page coordinates. */
export interface InkStroke {
  /** Drawing tool used. 'highlighter' replays semi-transparent + multiply. */
  tool: 'pen' | 'highlighter';
  /** Stroke color as a `#rrggbb` hex literal (server-validated). */
  color: string;
  /** Base width in normalized page units (fraction of page width), e.g. 0.003. */
  width: number;
  /**
   * Flat point list `[x, y, p, x, y, p, ...]` — x/y normalized 0..1 (y down),
   * p = pressure 0..1. Length MUST be a multiple of 3.
   */
  points: number[];
}

/** All ink strokes for one page of a source (the PUT body / GET item shape). */
export interface PageAnnotations {
  /** Schema version — always 1 in M4. */
  v: 1;
  strokes: InkStroke[];
}

/** Chars of extracted under-stroke text stored per page row (server re-caps). */
export const MARKED_TEXT_MAX = 8000;

/** Max strokes persisted per page (DoS guard alongside the byte cap). */
export const ANNOTATION_MAX_STROKES = 500;

/** Max total points (x/y/p triples) persisted per page. */
export const ANNOTATION_MAX_POINTS = 20000;

// ── Source marks (M5): text selection → highlight / note ──────────────────────
//
// A `source_marks` row anchors a TEXT selection (not vector ink — that is the
// M4 `source_annotations` path) inside a source's reader. Each mark carries the
// selected `quote`, the selection's bounding rects (`MarkRect[]`, normalized
// page coordinates — the render anchor), a `color`, and — for `kind:'note'` — a
// freeform `note` body. A mark is the substrate for the selection popover's
// highlight/note actions AND feeds `list_marked_passages` alongside ink markup.

/** What a source mark is: a colored highlight, a place-anchored note, or a
 *  'card' marker (an OUTPUT — anchors where a flashcard was created, written by
 *  the quick-card route, never by the client directly). */
export type SourceMarkKind = 'highlight' | 'note' | 'card';

/** One selection quad in NORMALIZED page coordinates (0..1, y down) — the
 *  render anchor for a highlight rect / note pin. Mirrors the ink stroke
 *  coordinate convention (zoom-independent). */
export interface MarkRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Server-capped length of a mark's selected text (`quote`). */
export const MARK_QUOTE_MAX = 2000;

/** Server-capped length of a `kind:'note'` mark's body (`note`). */
export const MARK_NOTE_MAX = 4000;

/** Max selection rects persisted per mark (multi-line selections merge to a
 *  handful of line rects; the cap bounds the row size). */
export const MARK_RECTS_MAX = 64;

/** The mark highlight palette — the only colors a mark may carry. The default
 *  (first entry) is 'lime'. Stored verbatim; the web maps each to a CSS var. */
export const SOURCE_MARK_COLORS = ['lime', 'amber', 'rose', 'sky', 'violet'] as const;
export type SourceMarkColor = (typeof SOURCE_MARK_COLORS)[number];
