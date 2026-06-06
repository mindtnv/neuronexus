'use client';

// Client render edge for the note-types model (Milestone 1, Phase 5a — plan
// must-fix #1 client edge / C-2).
//
// Display HTML is rendered LAZILY from the note's already-sanitized field values
// + the note-type template (via the shared pure-TS `renderTemplate`), then
// DOMPurified before it ever touches the DOM. Field values are sanitized at the
// server save edge (`apps/api/src/sanitize.ts`), so the payload HTML is
// safe-at-source — this is defense-in-depth, the SECOND sanitizer pass.
//
// `<SafeHtml>` is the SINGLE place in the web app where `dangerouslySetInnerHTML`
// is allowed. Every HTML render site (review, browser detail panel, note-editor
// preview) goes through it; the browser table renders the stored PLAINTEXT
// columns instead (no HTML, perf + safety).

import React from 'react';
import DOMPurify, { type Config } from 'dompurify';
import { renderTemplate, type NoteTypeDef, type FieldValues } from '@neuronexus/shared';

// DOMPurify allowlist MIRRORING the server `SANITIZE_CONFIG`
// (apps/api/src/sanitize.ts): the SAME tag/attr set so both edges agree on what
// is allowed. Tags: b i em strong u ul ol li br hr p span div; attrs: class only;
// NO script/style/iframe/on*; img stripped in M1 (media = M2).
const SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'ul', 'ol', 'li', 'br', 'hr', 'p', 'span', 'div'],
  ALLOWED_ATTR: ['class'],
  // Defense in depth: never keep event handlers / unknown protocols.
  ALLOW_UNKNOWN_PROTOCOLS: false,
  // Return a plain string (we feed it to dangerouslySetInnerHTML ourselves).
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
};

/**
 * Sanitize an arbitrary HTML string against the pinned allowlist. The ONLY
 * sanitizer entry point on the client — keep all `dangerouslySetInnerHTML`
 * callers funnelling through `<SafeHtml>` which calls this.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html ?? '', SANITIZE_CONFIG);
}

/**
 * Render one side of a card's HTML from the note-type template + the note's
 * field values, then DOMPurify it. `cloze` note-types blank/reveal the cloze
 * markup per `side`. Returns a SAFE HTML string ready for `<SafeHtml>`.
 *
 * `templateOrd` selects which template generates the card (defaults to 0 — the
 * first / only template for the three builtins).
 */
export function renderCardHtml(
  noteType: Pick<NoteTypeDef, 'kind' | 'templates'>,
  fieldValues: FieldValues,
  side: 'front' | 'back',
  templateOrd = 0,
): string {
  const template =
    noteType.templates.find((tpl) => tpl.ord === templateOrd) ?? noteType.templates[0];
  if (!template) return '';
  const tpl = side === 'front' ? template.frontTemplate : template.backTemplate;
  const html = renderTemplate(tpl, fieldValues, {
    side,
    cloze: noteType.kind === 'cloze',
  });
  return sanitizeHtml(html);
}

export interface SafeHtmlProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Pre-sanitized OR raw HTML — it is sanitized here regardless. */
  html: string;
}

/**
 * The ONE component allowed to use `dangerouslySetInnerHTML`. The `html` prop is
 * always run through DOMPurify (`sanitizeHtml`) immediately before injection, so
 * even a caller passing un-sanitized HTML cannot introduce an XSS sink.
 */
export const SafeHtml = ({ html, ...rest }: SafeHtmlProps) => {
  return <div {...rest} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
};
