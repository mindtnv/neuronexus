// Server-side HTML sanitizer for note field values (Milestone 1, Phase 4 — the
// authoritative save edge). This is the ONE pinned allowlist over `sanitize-html`
// (parse5-based, no jsdom — chosen for Bun reliability per Phase 0 / C-3). The
// SAME `SANITIZE_CONFIG` shape is referenced by the Phase 4b tests and the
// client render edge (Phase 5, DOMPurify) so both edges agree on what is allowed.
//
// Trust boundary (plan must-fix #1/#2): field values are the source of truth;
// they are sanitized HERE on save. The `cards.render*` columns are a plaintext
// search cache, NOT a security artifact. Display HTML is re-sanitized in the
// browser before DOM injection (defense in depth).
//
// Allowlist (intentionally narrow for M1):
//   tags:    b i em strong u ul ol li br hr p span div
//   attrs:   span/div → class only
//   NO:      script style iframe on* (event handlers), javascript: URLs
//   img:     STRIPPED in M1 (media lands in M2).

import sanitizeHtml from 'sanitize-html';

/**
 * The pinned allowlist config. Exported so Phase 4b tests + the client edge
 * (Phase 5) can reference the same shape / derive a matching DOMPurify config.
 */
export const SANITIZE_CONFIG: sanitizeHtml.IOptions = {
  allowedTags: ['b', 'i', 'em', 'strong', 'u', 'ul', 'ol', 'li', 'br', 'hr', 'p', 'span', 'div'],
  allowedAttributes: {
    span: ['class'],
    div: ['class'],
  },
  // No schemes are needed (no href/src tags are allowed at all in M1) but pin an
  // explicit safe set so a future tag addition can't silently enable javascript:.
  allowedSchemes: ['http', 'https'],
  allowedSchemesByTag: {},
  // Strip disallowed tags AND their text content for the dangerous structural
  // elements so nothing leaks through as visible text (mXSS hardening).
  disallowedTagsMode: 'discard',
  nonTextTags: ['script', 'style', 'textarea', 'noscript', 'iframe'],
  // No comments (could hide conditional-comment vectors).
  allowVulnerableTags: false,
};

/**
 * Sanitize a single note field value (HTML string) against the pinned allowlist.
 * Returns safe HTML with all script / style / iframe / event-handler / unsafe-URL
 * vectors and `<img>` removed. Non-string input degrades to the empty string.
 */
export function sanitizeFieldHtml(html: string): string {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html, SANITIZE_CONFIG);
}

/**
 * Sanitize every value of a note's `fieldValues` map in place-safe fashion
 * (returns a new object). Field NAMES are not HTML and are passed through
 * untouched.
 */
export function sanitizeFieldValues(
  fieldValues: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(fieldValues)) {
    out[name] = sanitizeFieldHtml(value);
  }
  return out;
}
