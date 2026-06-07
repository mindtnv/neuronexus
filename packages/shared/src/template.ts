// Pure-TS template / HTML-escape engine for note-types (Milestone 1, Phase 2 —
// Decision B1). DOM-free, Node-free: depends only on string ops + the canonical
// cloze grammar from `card-query-match.ts`. NO HTML SANITIZER lives here — a safe
// allowlist sanitizer needs a parser/DOM; sanitization happens at the edges
// (sanitize-html on the server save edge, DOMPurify in the browser). This engine
// only ESCAPES interpolated values and STRUCTURES the output.
//
// ── Template syntax (own, NOT Anki-byte-compatible) ──────────────────────────
//
//   {{FieldName}}            Substitute the field's value. The value is treated
//                            as already-sanitized HTML at render time, so it is
//                            inserted VERBATIM (not re-escaped) on the HTML
//                            render path. Unknown fields render as the empty
//                            string. (The escaping primitive `escapeHtml` is
//                            exported separately for callers that need to escape
//                            untrusted plaintext before it becomes a field
//                            value.)
//
//   {{#FieldName}}…{{/FieldName}}   Conditional section: the inner block is
//                            rendered only when the field is NON-EMPTY after
//                            trimming. Sections may nest and may contain other
//                            field substitutions.
//
//   {{^FieldName}}…{{/FieldName}}   Inverted section: the inner block is
//                            rendered only when the field is EMPTY (or unknown)
//                            after trimming.
//
// Cloze note-types (`opts.cloze === true`) additionally rewrite cloze markup
// (`{{c1::answer}}`, via the shared CLOZE_RE/stripCloze) AFTER substitution:
// the front side shows the blank `[…]`, the back side shows the revealed answer.
//
// All functions are pure and deterministic (no Date.now / Math.random).

import { stripCloze } from './card-query-match.ts';
import type { FieldValues, NoteTypeDef, RenderKind } from './note-type.ts';

// ── Math markers (Milestone 2, Phase 5) ──────────────────────────────────────
//
// LaTeX is stored RAW in the field value and rendered CLIENT-SIDE by KaTeX at
// display time (`apps/web/src/lib/render-card.tsx`). These constants are the
// single source of truth for the delimiters so the DOM-free shared layer
// (search-plaintext extraction) and the client KaTeX pass agree byte-for-byte.
//
//   \(…\)   inline math   (Anki-native; avoids the `$…$` currency collision)
//   \[…\]   display math
//
// An author escapes a LITERAL backslash-paren by doubling the leading backslash
// (`\\(` / `\\[`): the leading escape-skip branch `\\` consumes such a pair as a
// literal so the trailing `(`/`[` is plain text, NOT a math opener. DOM-free,
// pure string ops — no `\(` inside an HTML attribute is special here; that
// distinction is enforced at the client render edge which only tokenizes outside
// tags.
//
// LINEAR-TIME grammar (M2 validation fix — ReDoS hardening). The previous
// `(?<!\\)…[\s\S]*?…(?<!\\)` form was O(n²): a variable lookbehind re-checked at
// every candidate position over a global scan, plus a lazy `[\s\S]*?` body that
// re-scanned to EOF at each unterminated opener — a 64 KiB run of `\(` stalled
// the event loop ~17s. The replacement is strictly left-to-right linear:
//
//   1. `\\`              — an escaped backslash-pair, matched FIRST and passed
//                          through verbatim, so `\\(`/`\\[` can never be read as
//                          an opener (replaces the opener lookbehind).
//   2. `\[(body)\]`      — display span (capture group 1).
//   3. `\((body)\)`      — inline span (capture group 2).
//
// The body is `(?:[^\\]|\\[^()])*` (inline) / `(?:[^\\]|\\[^\[\]])*` (display):
// "a non-backslash char, OR a backslash NOT followed by the delimiter pair".
// This lets a backslash COMMAND (`\pi`, `\frac`) and a LITERAL paren/bracket
// inside a formula survive, while a bare `\)`/`\]` can be consumed by neither
// branch — so it can only terminate the span (the linear analogue of the old
// `(?<!\\)` closer). Every step consumes ≥1 char and the body cannot span across
// a closer or another opener, so an unterminated opener fails in O(1) per
// position → O(n) overall. The escape-skip branch is group-LESS, so a match with
// BOTH capture groups `undefined` is a passthrough (see consumers below).
const MATH_INLINE_RE = /\\\\|\\\(((?:[^\\]|\\[^()])*)\\\)/g;
const MATH_DISPLAY_RE = /\\\\|\\\[((?:[^\\]|\\[^\[\]])*)\\\]/g;

/** A combined matcher for both math kinds (used by extract/strip). The display
 * form is tried first so `\[…\]` is never mis-read as an inline `\(` neighbour.
 * The leading `\\` escape-skip branch (group-less) makes `\\(`/`\\[` literal.
 * Both branches use the linear-time body grammar (see above). */
export const MATH_RE =
  /\\\\|\\\[((?:[^\\]|\\[^\[\]])*)\\\]|\\\(((?:[^\\]|\\[^()])*)\\\)/g;

/** One extracted math span: the inner LaTeX `source` + whether it is `display`. */
export type MathSpan = { source: string; display: boolean };

/**
 * Extract every math span (in document order) from a string. Inline `\(…\)` →
 * `display:false`, display `\[…\]` → `display:true`. Escaped `\\(`/`\\[` are not
 * matched (the `\\` escape-skip branch leaves both capture groups undefined).
 * Pure/DOM-free.
 */
export function extractMath(s: string): MathSpan[] {
  const out: MathSpan[] = [];
  const re = new RegExp(MATH_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m[1] !== undefined) {
      out.push({ source: m[1], display: true });
    } else if (m[2] !== undefined) {
      out.push({ source: m[2], display: false });
    }
    // else: the `\\` escape-skip branch — not a math span, skip it.
  }
  return out;
}

/**
 * Replace every math span with its inner LaTeX SOURCE (delimiters removed) so
 * plaintext search matches by the formula source. `\(x^2\)` → `x^2`,
 * `\[\frac12\]` → `\frac12`. Escaped `\\(` is left untouched (the `\\` branch
 * passes through verbatim). Pure/DOM-free.
 */
export function stripMath(s: string): string {
  const re = new RegExp(MATH_RE.source, 'g');
  return s.replace(re, (full, disp: string | undefined, inline: string | undefined) =>
    disp !== undefined ? disp : inline !== undefined ? inline : full,
  );
}

/** Escape the 5 HTML-significant chars: `& < > " '`. Order matters (`&` first). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Matches `{{#Field}}`, `{{^Field}}`, `{{/Field}}`, or `{{Field}}`. Field names
// allow word chars, spaces, hyphens — trimmed before lookup. The leading sigil
// (`#`/`^`/`/`) is captured in group 1, the name in group 2.
const TAG_RE = /\{\{\s*([#^/]?)\s*([^{}]*?)\s*\}\}/g;

type Token =
  | { t: 'text'; value: string }
  | { t: 'var'; name: string }
  | { t: 'open'; name: string; inverted: boolean }
  | { t: 'close'; name: string };

function tokenize(tpl: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  const re = new RegExp(TAG_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl)) !== null) {
    if (m.index > last) {
      tokens.push({ t: 'text', value: tpl.slice(last, m.index) });
    }
    const sigil = m[1];
    const name = m[2];
    if (sigil === '#') {
      tokens.push({ t: 'open', name, inverted: false });
    } else if (sigil === '^') {
      tokens.push({ t: 'open', name, inverted: true });
    } else if (sigil === '/') {
      tokens.push({ t: 'close', name });
    } else {
      tokens.push({ t: 'var', name });
    }
    last = m.index + m[0].length;
  }
  if (last < tpl.length) {
    tokens.push({ t: 'text', value: tpl.slice(last) });
  }
  return tokens;
}

function isNonEmpty(fields: FieldValues, name: string): boolean {
  const v = fields[name];
  return typeof v === 'string' && v.trim().length > 0;
}

// Render a token stream from `i`. When `stopName` is set, render until the
// matching `{{/stopName}}` and return its index; otherwise render to the end.
function renderTokens(
  tokens: Token[],
  i: number,
  fields: FieldValues,
  stopName: string | null,
): { out: string; next: number } {
  let out = '';
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.t === 'close') {
      if (stopName !== null && tok.name === stopName) {
        return { out, next: i + 1 };
      }
      // Unmatched/foreign close tag → ignore the tag, keep rendering.
      i += 1;
      continue;
    }
    if (tok.t === 'text') {
      out += tok.value;
      i += 1;
      continue;
    }
    if (tok.t === 'var') {
      out += tok.name in fields ? fields[tok.name] : '';
      i += 1;
      continue;
    }
    // open section
    const show = tok.inverted ? !isNonEmpty(fields, tok.name) : isNonEmpty(fields, tok.name);
    const inner = renderTokens(tokens, i + 1, fields, tok.name);
    if (show) out += inner.out;
    i = inner.next;
  }
  return { out, next: i };
}

/**
 * Render a single template string against a note's field values.
 *
 * `opts.cloze` enables cloze rewriting AFTER substitution; `opts.side` selects
 * the prompt (`front`, blanks) vs revealed (`back`) directive.
 */
export function renderTemplate(
  tpl: string,
  fields: FieldValues,
  opts?: { side: 'front' | 'back'; cloze?: boolean },
): string {
  const tokens = tokenize(tpl);
  const { out } = renderTokens(tokens, 0, fields, null);
  if (opts?.cloze) {
    return stripCloze(out, opts.side === 'front' ? 'prompt' : 'answer');
  }
  return out;
}

// Pull the `alt` text out of an `<img …>` tag (double- or single-quoted), or the
// empty string when absent. Used to keep media discoverable by search via its
// alt text once the tag itself is stripped. Pure string op.
const IMG_TAG_RE = /<img\b[^>]*>/gi;
const IMG_ALT_RE = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

// ── Markdown plaintext strip (Step 5, plan H5) ───────────────────────────────
//
// Field values are stored as MARKDOWN SOURCE and rendered to HTML client-side
// (`apps/web/src/lib/render-card.tsx`). For the search-text cache we strip the
// markdown markup here too, so a card whose body is `# Title` / `**bold**` /
// `- item` / a `| table |` is searchable by its WORDS, not its punctuation.
//
// HONEST CAVEAT (plan H5): this is a BEST-EFFORT REGEX APPROXIMATION, NOT the
// same AST the client markdown-it renderer uses. It is a search-cache heuristic,
// NOT a security artifact and NOT a "single-source" client/server contract. It
// only needs to remove the COMMON markers so search matches the prose.
//
// CRITICAL ORDERING (the one pinned invariant, plan H5 test vector): an inline
// code span `` `a|b` `` must keep its `|` in the search text — the pipe lives
// inside code, not a table cell. So inline-code CONTENT is stashed behind a
// pipe-free sentinel BEFORE the table-pipe strip runs, then restored after. This
// keeps `code` searchable verbatim while still flattening real markdown tables.
const INLINE_CODE_RE = /`([^`\n]+)`/g;

function stripMarkdown(s: string): string {
  // 1. Stash inline-code CONTENT so its inner punctuation (notably `|`) survives
  //    the table-pipe strip below. Sentinel is digit-only + NUL-free → no markdown
  //    syntax, no table pipe, restored 1:1 afterwards.
  const code: string[] = [];
  let out = s.replace(INLINE_CODE_RE, (_full, inner: string) => {
    const key = `nncode${code.length}`;
    code.push(inner);
    return key;
  });
  out = out
    // 2. Fenced-code fences (``` / ~~~, with optional language) → drop the fence
    //    line marker, keep the code body text.
    .replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm, '')
    // 3. ATX heading markers at line start: `### Title` → `Title`.
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    // 4. Blockquote markers at line start: `> quote` → `quote`.
    .replace(/^[ \t]*>[ \t]?/gm, '')
    // 5. List bullets / ordered markers at line start: `- a`, `* a`, `1. a`.
    .replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm, '')
    // 6. Table separator rows (`|---|:--:|`) → drop entirely.
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?(?:[ \t]*\|[ \t]*:?-{2,}:?)*[ \t]*\|?[ \t]*$/gm, '')
    // 7. Remaining table cell pipes → space (inline code is stashed, so a `|`
    //    inside code is NOT touched here).
    .replace(/\|/g, ' ')
    // 8. Emphasis / strong markers (`**x**`, `__x__`, `*x*`, `_x_`) → drop the
    //    markers, keep the text. Run strong (doubled) before emphasis (single).
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1');
  // 9. Restore inline-code content verbatim (pipe and all).
  return out.replace(/nncode(\d+)/g, (_m, i: string) => code[Number(i)] ?? '');
}

// Strip HTML tags + markdown → plaintext for the search-text path (never the
// display path). Order matters (M2 Phase 5 + Step 5):
//   1. `<img>` → its `alt` text (extract before the tag is deleted; drop if no
//      alt) so an image is searchable by its description.
//   2. remaining HTML tags → space.
//   3. math `\(…\)`/`\[…\]` → its formula SOURCE (delimiters removed) so a
//      `field:`/bareword search on `\(x^2\)` matches `x^2`.
//   4. markdown markers (headings/lists/blockquote/emphasis/tables) → stripped,
//      best-effort (plan H5 — NOT the client AST; a search-cache heuristic).
// Steps 1+3 keep media + math discoverable with ZERO query-structure change
// (one-AST-two-consumers). Pure string ops; DOM-free.
//
// Belt-and-suspenders: a defensive length cap (`SEARCH_TEXT_CAP`) bounds the
// input BEFORE the (now linear-time) math pass. The search-text column is just a
// plaintext cache — a 32 KiB ceiling is far above any real card body and caps
// the worst-case work even if the regex ever regressed.
const SEARCH_TEXT_CAP = 32_768;
function stripTags(html: string): string {
  const capped = html.length > SEARCH_TEXT_CAP ? html.slice(0, SEARCH_TEXT_CAP) : html;
  const noTags = capped
    .replace(IMG_TAG_RE, (tag) => {
      const m = IMG_ALT_RE.exec(tag);
      const alt = m ? (m[1] ?? m[2] ?? '') : '';
      return alt ? ` ${alt} ` : ' ';
    })
    .replace(/<[^>]*>/g, ' ')
    .replace(MATH_RE, (full, disp: string | undefined, inline: string | undefined) =>
      disp !== undefined ? disp : inline !== undefined ? inline : full,
    );
  return stripMarkdown(noTags)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * PLAINTEXT extraction for SQL search. Renders each side of every template,
 * strips HTML tags + unwraps cloze (via `stripCloze`), then concatenates.
 *
 *  - `renderFrontText` / `renderBackText` — per-side plaintext across all
 *    templates (joined by a single space).
 *  - `renderText` — front + back plaintext concatenation.
 */
export function renderTextFor(
  noteType: NoteTypeDef,
  fields: FieldValues,
): { renderText: string; renderFrontText: string; renderBackText: string } {
  const isCloze = noteType.kind === 'cloze';
  const fronts: string[] = [];
  const backs: string[] = [];
  for (const tpl of noteType.templates) {
    const front = renderTemplate(tpl.frontTemplate, fields, { side: 'front', cloze: isCloze });
    const back = renderTemplate(tpl.backTemplate, fields, { side: 'back', cloze: isCloze });
    const frontText = stripTags(front);
    const backText = stripTags(back);
    if (frontText) fronts.push(frontText);
    if (backText) backs.push(backText);
  }
  const renderFrontText = fronts.join(' ');
  const renderBackText = backs.join(' ');
  const renderText = [renderFrontText, renderBackText].filter(Boolean).join(' ');
  return { renderText, renderFrontText, renderBackText };
}

/**
 * Generate the per-template card records for a note. One entry per template in
 * `ord` order; a template is SKIPPED when its rendered front is empty after
 * substitution (Anki rule → optional reverse cards). Returns the plaintext
 * search columns + the template ordinal + the note-type's render kind. Display
 * HTML is rendered lazily elsewhere (from sanitized field values + template).
 */
export function generateCards(
  noteType: NoteTypeDef,
  fields: FieldValues,
): {
  templateOrd: number;
  renderText: string;
  renderFrontText: string;
  renderBackText: string;
  renderKind: RenderKind;
}[] {
  const isCloze = noteType.kind === 'cloze';
  const out: {
    templateOrd: number;
    renderText: string;
    renderFrontText: string;
    renderBackText: string;
    renderKind: RenderKind;
  }[] = [];
  const ordered = [...noteType.templates].sort((a, b) => a.ord - b.ord);
  for (const tpl of ordered) {
    const front = renderTemplate(tpl.frontTemplate, fields, { side: 'front', cloze: isCloze });
    const back = renderTemplate(tpl.backTemplate, fields, { side: 'back', cloze: isCloze });
    const renderFrontText = stripTags(front);
    const renderBackText = stripTags(back);
    // Empty-front skip: optional reverse cards aren't generated.
    if (!renderFrontText) continue;
    const renderText = [renderFrontText, renderBackText].filter(Boolean).join(' ');
    out.push({
      templateOrd: tpl.ord,
      renderText,
      renderFrontText,
      renderBackText,
      renderKind: noteType.kind,
    });
  }
  return out;
}
