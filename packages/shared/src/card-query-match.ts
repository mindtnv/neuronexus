// Atomic semantic primitives shared by BOTH query back-ends (Critic must-fix
// C1/C2, Architect should-fix #7). Wildcard/case semantics and the cloze regex
// live here ONCE so the client predicate and the server SQL builder can never
// diverge. Pure-TS, no DOM/Node deps.

/**
 * Translate a wildcard pattern (`*` = zero-or-more chars, `_` = exactly one
 * char) into a case-insensitive anchored RegExp for the CLIENT predicate.
 *
 * Every other regex metacharacter in the literal portions is escaped, so user
 * input like `a.b(c)` matches literally. The pattern is anchored (`^…$`) so it
 * is a full-match semantics — callers that want substring matching should wrap
 * the value in `*…*` (the predicate does this for substring fields).
 */
export function likeToRegex(pattern: string): RegExp {
  let out = '^';
  for (const ch of pattern) {
    if (ch === '*') {
      out += '.*';
    } else if (ch === '_') {
      out += '.';
    } else {
      out += escapeRegexChar(ch);
    }
  }
  out += '$';
  return new RegExp(out, 'i');
}

function escapeRegexChar(ch: string): string {
  // Escape any char that is special in a JS RegExp.
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

/**
 * Translate a wildcard pattern into a SQL `LIKE`/`ILIKE` pattern for the SERVER
 * SQL builder (used in Phase 2). `*` → `%`, `_` stays `_` (both are single-char
 * wildcards), and LIKE metacharacters (`%`, `_`, `\`) in the LITERAL portions
 * are escaped with a backslash so user input is matched literally.
 *
 * The backslash is LIKE's default escape character in Postgres. Callers issue
 * `col ILIKE :pattern` (the standard `\` escape applies without an explicit
 * `ESCAPE` clause in Postgres).
 *
 * Note: the user's `*` and `_` are the query language's wildcards; literal `%`,
 * `_`, `\` typed by the user are escaped so they don't act as SQL wildcards.
 * (A user `_` IS a wildcard — by design it maps to SQL `_`.)
 */
export function wildcardToSqlLike(pattern: string): string {
  let out = '';
  for (const ch of pattern) {
    if (ch === '*') {
      out += '%';
    } else if (ch === '_') {
      // user single-char wildcard → SQL single-char wildcard
      out += '_';
    } else if (ch === '%' || ch === '\\') {
      // literal SQL metachars → escape
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }
  return out;
}

// ── cloze ────────────────────────────────────────────────────────────────────

/**
 * Matches an Anki-style cloze deletion: `{{c1::answer}}` (and any `c<digit>`).
 * Capture group 1 is the answer text. Consolidated from review.tsx (Critic
 * must-fix C1) so there is no forked regex. The `g` flag is set; callers that
 * need a fresh lastIndex should construct `new RegExp(CLOZE_RE.source, 'g')`.
 */
export const CLOZE_RE = /\{\{c\d+::([^}]+)\}\}/g;

/**
 * Strip cloze markup from a string. DOM-free (returns a plain string — JSX
 * rendering stays in review.tsx).
 *
 *  - `'prompt'` → replace each `{{c1::X}}` with `[…]` (the blank shown on the
 *    question side / the Browse "Question" column).
 *  - `'answer'` → replace each `{{c1::X}}` with `X` (the filled-in text shown on
 *    the answer side / the Browse "Answer" column).
 */
export function stripCloze(text: string, mode: 'prompt' | 'answer'): string {
  const re = new RegExp(CLOZE_RE.source, 'g');
  return text.replace(re, (_full, answer: string) => (mode === 'prompt' ? '[…]' : answer));
}
