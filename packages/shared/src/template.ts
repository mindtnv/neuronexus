// Pure-TS template / HTML-escape engine for note-types (Milestone 1, Phase 2 —
// Decision B1). DOM-free: Markdown parsing derives the search cache; the small
// template engine composes structure. This is not an HTML security boundary:
// rendered HTML must pass through the browser's mandatory DOMPurify sink.
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

import MarkdownIt from 'markdown-it';
import { cardClozePlugin, cardMathPlugin, cardMediaPlugin } from './card-markdown';
import { ClozeSyntaxError, MAX_CLOZE_CARDS } from './cloze';
import { CARD_MEDIA_TOKEN_RE, mediaSourceFromTag, NoteContentError } from './note-content';
import { normalizeFieldName, typedAnswerField, validFieldNames } from './note-fields';
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
): { out: string; next: number; used: Set<string> } {
  const used = new Set<string>();
  let out = '';
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.t === 'close') {
      if (stopName !== null && tok.name === stopName) {
        return { out, next: i + 1, used };
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
      if (Object.hasOwn(fields, tok.name)) { out += fields[tok.name]; used.add(tok.name); }
      i += 1;
      continue;
    }
    // open section
    const show = tok.inverted ? !isNonEmpty(fields, tok.name) : isNonEmpty(fields, tok.name);
    const inner = renderTokens(tokens, i + 1, fields, tok.name);
    if (show) { out += inner.out; for (const name of inner.used) used.add(name); }
    i = inner.next;
  }
  return { out, next: i, used };
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

// Parse field Markdown before substituting template HTML. This keeps code
// escaped until AFTER structural tags have been removed from the search cache.
const SEARCH_TEXT_CAP = 32_768;
const searchMarkdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
searchMarkdown.use(cardMathPlugin, MATH_RE).use(cardClozePlugin).use(cardMediaPlugin);

function searchFields(fields: FieldValues, cloze?: { side: 'front' | 'back'; number: number; legacy?: boolean }, fieldNumbers?: Map<string, Set<number>>): FieldValues {
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => {
    if (/^\s*<img\b[^>]*>\s*$/i.test(value)) throw new NoteContentError('html_image_requires_markdown');
    const numbers = new Set<number>();
    fieldNumbers?.set(name, numbers);
    return [name, searchMarkdown.render(value, { cloze, onClozeNumber: fieldNumbers ? (number: number) => numbers.add(number) : undefined })];
  }));
}

function stripTags(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(IMG_TAG_RE, (tag) => {
      if (!CARD_MEDIA_TOKEN_RE.test(mediaSourceFromTag(tag) ?? '')) return ' ';
      const m = IMG_ALT_RE.exec(tag);
      return ` ${m ? (m[1] ?? m[2] ?? '') : ''} `;
    })
    .replace(/<\/?(?:span|strong|em|b|i|u|code|a)\b[^>]*>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    // Decode entities exactly once, after tag removal. Applying unescapeAll to
    // the whole string would also damage backslash examples inside code.
    .replace(/&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/gi, (entity) => searchMarkdown.utils.unescapeAll(entity))
    .replace(/\s+/g, ' ').trim().slice(0, SEARCH_TEXT_CAP);
}

function hasQuestionImage(html: string): boolean {
  return [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(IMG_TAG_RE)].some(([tag]) => CARD_MEDIA_TOKEN_RE.test(mediaSourceFromTag(tag) ?? ''));
}

/** Visible text for short answers; images are not implicitly answers. */
export function fieldPlainText(source: string): string {
  if (typeof source !== 'string') return ''; // Missing prototype-named fields are not inherited values.
  return stripTags(searchMarkdown.render(source, {}).replace(IMG_TAG_RE, ''));
}

export interface TemplateIssue { templateOrd: number; side: 'front' | 'back'; code: string; offset: number; field?: string; tag?: string }
// The display sanitizer drops these containers WITH their contents. Reject them
// as authoring errors; this is not a replacement for the mandatory render sink.
const NON_RENDERING_TEMPLATE_TAGS = new Set(['annotation-xml', 'audio', 'colgroup', 'desc', 'foreignobject', 'head',
  'iframe', 'math', 'mi', 'mn', 'mo', 'ms', 'mtext', 'noembed', 'noframes', 'noscript', 'plaintext', 'script',
  'selectedcontent', 'style', 'svg', 'template', 'title', 'video', 'xmp']);
export function validateTemplates(fields: NoteTypeDef['fields'], templates: NoteTypeDef['templates']): TemplateIssue[] {
  const known = new Set(fields.map((field) => normalizeFieldName(field.name)));
  const issues: TemplateIssue[] = [];
  for (const template of templates) for (const side of ['front', 'back'] as const) {
    const source = side === 'front' ? template.frontTemplate : template.backTemplate;
    const markup = source.replace(/<!--[\s\S]*?-->/g, (comment) => ' '.repeat(comment.length));
    for (const match of markup.matchAll(/<\/?([a-z][\w:-]*)(?=[\s/>]|$)(?:[^"'<>]|"[^"]*"|'[^']*')*(?:>|$)/gi)) {
      const tag = match[1].toLowerCase();
      if (issues.length < 20 && (NON_RENDERING_TEMPLATE_TAGS.has(tag) || !match[0].endsWith('>'))) issues.push({ templateOrd: template.ord, side, code: 'unsupported_html', offset: match.index, tag });
    }
    const stack: { name: string; offset: number }[] = [];
    let last = 0; let references = 0;
    const add = (code: string, offset: number, field?: string) => { if (issues.length < 20) issues.push({ templateOrd: template.ord, side, code, offset, ...(field ? { field } : {}) }); };
    for (const match of source.matchAll(new RegExp(TAG_RE.source, 'g'))) {
      const gap = source.slice(last, match.index);
      if (/\{\{|\}\}/.test(gap)) add('malformed_tag', last);
      const name = normalizeFieldName(match[2]); const sigil = match[1];
      if (!known.has(name)) add('unknown_field', match.index, name);
      if (sigil === '#' || sigil === '^') {
        stack.push({ name, offset: match.index });
        if (stack.length > 64) add('template_nesting', match.index);
      } else if (sigil === '/') {
        if (stack.pop()?.name !== name) add('mismatched_section', match.index, name);
      } else references++;
      last = match.index + match[0].length;
    }
    if (/\{\{|\}\}/.test(source.slice(last))) add('malformed_tag', last);
    for (const open of stack) add('unclosed_section', open.offset, open.name);
    if (side === 'front' && references === 0 && !stripTags(markup.replace(new RegExp(TAG_RE.source, 'g'), '')) && !hasQuestionImage(source)) add('empty_question', 0);
  }
  return issues;
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
  const frontFields = searchFields(fields, isCloze ? { side: 'front', number: 0 } : undefined);
  const backFields = isCloze ? searchFields(fields, { side: 'back', number: 0 }) : frontFields;
  const fronts: string[] = [];
  const backs: string[] = [];
  for (const tpl of noteType.templates) {
    const front = renderTemplate(tpl.frontTemplate, frontFields);
    const back = renderTemplate(tpl.backTemplate, backFields);
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
export interface GeneratedCard {
  templateOrd: number;
  clozeNumber: number | null;
  renderText: string;
  renderFrontText: string;
  renderBackText: string;
  renderKind: RenderKind;
}

function numbersForTemplate(template: string, renderedFields: FieldValues, fieldNumbers: Map<string, Set<number>>): number[] {
  // Track which field substitutions the template actually renders. Metadata is
  // never inferred from author-controlled HTML attributes or code examples.
  const used = renderTokens(tokenize(template), 0, renderedFields, null).used;
  const numbers = [...new Set([...used].flatMap((name) => [...(fieldNumbers.get(name) ?? [])]))].sort((a, b) => a - b);
  if (numbers.length > MAX_CLOZE_CARDS) throw new ClozeSyntaxError(0, 'too_many_cloze_cards');
  return numbers;
}

export function clozeNumbersFor(noteType: Pick<NoteTypeDef, 'templates'>, fields: FieldValues): number[] {
  const fieldNumbers = new Map<string, Set<number>>();
  const rendered = searchFields(fields, { side: 'back', number: 0 }, fieldNumbers);
  return [...new Set(noteType.templates.flatMap((template) => numbersForTemplate(template.frontTemplate, rendered, fieldNumbers)))].sort((a, b) => a - b);
}

export function generateCards(noteType: NoteTypeDef, fields: FieldValues, options: { legacyCloze?: boolean; checkBudget?: () => void } = {}): GeneratedCard[] {
  if (!validFieldNames(noteType.fields) || validateTemplates(noteType.fields, noteType.templates).length) throw new NoteContentError('invalid_template');
  if (noteType.kind === 'typein' && !fieldPlainText(fields[typedAnswerField(noteType.fields)?.name ?? ''] ?? '')) throw new NoteContentError('typein_answer_required');
  const isCloze = noteType.kind === 'cloze';
  const fieldNumbers = new Map<string, Set<number>>();
  const revealedFields = searchFields(fields, isCloze ? { side: 'back', number: 0, legacy: options.legacyCloze } : undefined, fieldNumbers);
  const out: GeneratedCard[] = [];
  for (const tpl of [...noteType.templates].sort((a, b) => a.ord - b.ord)) {
    options.checkBudget?.();
    const numbers: (number | null)[] = isCloze
      ? options.legacyCloze ? [0] : numbersForTemplate(tpl.frontTemplate, revealedFields, fieldNumbers)
      : [null];
    for (const clozeNumber of numbers) {
      options.checkBudget?.();
      const frontFields = isCloze ? searchFields(fields, { side: 'front', number: clozeNumber ?? 0, legacy: options.legacyCloze }) : revealedFields;
      const front = renderTemplate(tpl.frontTemplate, frontFields);
      const back = renderTemplate(tpl.backTemplate, revealedFields);
      const renderFrontText = stripTags(front);
      const renderBackText = stripTags(back);
      if (!renderFrontText && !hasQuestionImage(front)) continue;
      if (noteType.kind === 'typein') {
        const answer = typedAnswerField(noteType.fields)!.name;
        if (renderTokens(tokenize(tpl.frontTemplate), 0, frontFields, null).used.has(answer) ||
          !renderTokens(tokenize(tpl.backTemplate), 0, revealedFields, null).used.has(answer)) {
          throw new NoteContentError('typein_answer_placement');
        }
      }
      if (out.length >= MAX_CLOZE_CARDS) throw new ClozeSyntaxError(0, 'too_many_cloze_cards');
      out.push({ templateOrd: tpl.ord, clozeNumber, renderFrontText, renderBackText,
        renderText: [renderFrontText, renderBackText].filter(Boolean).join(' '), renderKind: noteType.kind });
    }
  }
  return out;
}
