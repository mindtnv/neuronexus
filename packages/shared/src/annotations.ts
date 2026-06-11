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
