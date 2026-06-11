// M4 — PURE ink/geometry math for the PDF reader. NO DOM, NO pdf.js imports:
// every function takes plain data so the whole module is unit-testable in
// `bun test` (see pdf-ink.test.ts). The reader/ink-layer components feed it
// canvas dims, pointer coords, and the data-only shape of pdf.js text items.
//
// COORDINATE MODEL
//  • Normalized page coords: x,y ∈ [0,1], y DOWN (top-left origin) — the same
//    orientation pdf.js renders a page viewport in. Strokes persist normalized
//    so they replay at any zoom.
//  • Canvas/CSS coords: pixels, top-left origin, y down. nx*cssW, ny*cssH.
//  • pdf.js text space: y UP, origin bottom-left; item.transform = [a,b,c,d,e,f]
//    places the glyph run origin at (e,f). We flip y against the page height.

import { MARKED_TEXT_MAX, type InkStroke } from '@neuronexus/shared';

// ── Coordinate transforms ────────────────────────────────────────────────────

/** Normalized (0..1) page point → canvas/CSS pixel point. */
export function normToCanvas(
  nx: number,
  ny: number,
  cssW: number,
  cssH: number,
): { x: number; y: number } {
  return { x: nx * cssW, y: ny * cssH };
}

/** Canvas/CSS pixel point → normalized (0..1) page point (clamped to the page). */
export function canvasToNorm(
  cx: number,
  cy: number,
  cssW: number,
  cssH: number,
): { x: number; y: number } {
  const x = cssW > 0 ? cx / cssW : 0;
  const y = cssH > 0 ? cy / cssH : 0;
  return { x: clamp01(x), y: clamp01(y) };
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ── Stroke geometry ──────────────────────────────────────────────────────────

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Axis-aligned bbox of a stroke in normalized coords. `null` for an empty stroke.
 * Reads only x/y from the flat [x,y,p, ...] triples.
 */
export function strokeBBox(points: number[]): BBox | null {
  if (points.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 3) {
    const x = points[i]!;
    const y = points[i + 1]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/** Grow a bbox by `pad` (normalized units) on every side. */
export function inflateBBox(b: BBox, pad: number): BBox {
  return {
    minX: b.minX - pad,
    minY: b.minY - pad,
    maxX: b.maxX + pad,
    maxY: b.maxY + pad,
  };
}

/** Do two bboxes overlap (inclusive)? */
export function bboxesIntersect(a: BBox, b: BBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/**
 * Squared distance from point (px,py) to segment (ax,ay)-(bx,by). Squared to
 * avoid the sqrt in the eraser hot loop; callers compare against threshold².
 */
export function distSqToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return ex * ex + ey * ey;
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return ex * ex + ey * ey;
}

/**
 * Minimum distance (normalized units) from a point to a stroke's polyline.
 * A single-point stroke degrades to point-distance. `Infinity` for empty input.
 */
export function pointToStrokeDistance(px: number, py: number, points: number[]): number {
  if (points.length < 3) return Infinity;
  if (points.length < 6) {
    // Single point.
    const ex = px - points[0]!;
    const ey = py - points[1]!;
    return Math.hypot(ex, ey);
  }
  let best = Infinity;
  for (let i = 0; i + 5 < points.length; i += 3) {
    const d = distSqToSegment(px, py, points[i]!, points[i + 1]!, points[i + 3]!, points[i + 4]!);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * True when an eraser at (px,py) (normalized) hits the stroke within `radius`
 * (normalized). The effective hit radius scales with the stroke's own half-width
 * so fat highlighters are easier to catch.
 */
export function eraserHitsStroke(px: number, py: number, stroke: InkStroke, radius: number): boolean {
  const d = pointToStrokeDistance(px, py, stroke.points);
  return d <= radius + stroke.width / 2;
}

// ── pdf.js text-item geometry (data-only) ─────────────────────────────────────

/** The minimal shape of a pdf.js `TextItem` we need (no pdf.js import). */
export interface PdfTextItem {
  str: string;
  /** [a, b, c, d, e, f] — glyph run origin at (e, f) in PDF text space (y up). */
  transform: number[];
  /** Run width in text space (already scaled by the viewport when from getTextContent). */
  width: number;
  /** Run height in text space. */
  height: number;
  hasEOL?: boolean;
}

/**
 * Normalized (0..1, y down) bbox of a pdf.js text item.
 *
 * `getTextContent()` returns transforms already in VIEWPORT space at the scale
 * the viewport was built with, so `pageW`/`pageH` must be that same viewport's
 * pixel dims. The run origin (e,f) is the LEFT BASELINE in a y-UP frame; we take
 * the box [e, f] → [e+width, f+height] and flip y against pageH.
 */
export function textItemBBox(item: PdfTextItem, pageW: number, pageH: number): BBox | null {
  const tr = item.transform;
  if (!tr || tr.length < 6 || pageW <= 0 || pageH <= 0) return null;
  const x0 = tr[4]!;
  const yBaseline = tr[5]!;
  const w = Math.abs(item.width);
  const h = Math.abs(item.height) || Math.hypot(tr[1]!, tr[3]!);
  if (!Number.isFinite(x0) || !Number.isFinite(yBaseline)) return null;
  // y-up box: [yBaseline, yBaseline + h]. Flip to y-down normalized.
  const topPdf = yBaseline + h;
  const botPdf = yBaseline;
  const minX = clampUnit(x0 / pageW);
  const maxX = clampUnit((x0 + w) / pageW);
  const minY = clampUnit(1 - topPdf / pageH);
  const maxY = clampUnit(1 - botPdf / pageH);
  return { minX, minY: Math.min(minY, maxY), maxX, maxY: Math.max(minY, maxY) };
}

function clampUnit(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ── Marked-text extraction ────────────────────────────────────────────────────

/** Padding (normalized units) added around stroke bboxes when matching text. */
export const MARK_INFLATE = 0.004;

/**
 * Extract the text under a page's strokes: every text item whose bbox intersects
 * any (inflated) stroke bbox, joined in reading order (top→bottom, then
 * left→right), de-duplicated by item identity, capped to MARKED_TEXT_MAX chars.
 *
 * Pure: takes the page's text items + the same viewport dims used to compute
 * their transforms + the strokes (normalized). Returns '' when nothing matches.
 */
export function extractMarkedText(
  items: PdfTextItem[],
  pageW: number,
  pageH: number,
  strokes: InkStroke[],
): string {
  if (items.length === 0 || strokes.length === 0) return '';

  const strokeBoxes: BBox[] = [];
  for (const s of strokes) {
    const bb = strokeBBox(s.points);
    if (bb) strokeBoxes.push(inflateBBox(bb, MARK_INFLATE));
  }
  if (strokeBoxes.length === 0) return '';

  const hits: { item: PdfTextItem; minY: number; minX: number }[] = [];
  for (const item of items) {
    if (!item.str) continue;
    const ib = textItemBBox(item, pageW, pageH);
    if (!ib) continue;
    if (strokeBoxes.some((sb) => bboxesIntersect(sb, ib))) {
      hits.push({ item, minY: ib.minY, minX: ib.minX });
    }
  }
  if (hits.length === 0) return '';

  // Reading order: group into rough lines by y, then left→right within a line.
  // A simple stable sort by (y bucket, x) is enough for the extraction quality
  // we need (the AI reads passages, not pixel-perfect layout).
  const LINE_EPS = 0.012;
  hits.sort((a, b) => {
    if (Math.abs(a.minY - b.minY) > LINE_EPS) return a.minY - b.minY;
    return a.minX - b.minX;
  });

  let out = '';
  let prevY = hits.length ? hits[0]!.minY : 0;
  for (const h of hits) {
    const item = h.item;
    if (out.length > 0) {
      const newline = Math.abs(h.minY - prevY) > LINE_EPS;
      out += newline ? '\n' : needsSpace(out) ? ' ' : '';
    }
    out += item.str;
    if (item.hasEOL) out += '\n';
    prevY = h.minY;
    if (out.length >= MARKED_TEXT_MAX) break;
  }

  out = out.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return out.length > MARKED_TEXT_MAX ? out.slice(0, MARKED_TEXT_MAX) : out;
}

function needsSpace(s: string): boolean {
  const last = s[s.length - 1];
  return last !== ' ' && last !== '\n';
}
