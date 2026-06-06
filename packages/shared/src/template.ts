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

// Strip HTML tags → plaintext (collapse runs of whitespace, trim). Pure string
// ops; this is the search-text path, never the display path.
function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
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
