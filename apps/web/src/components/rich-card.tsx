'use client';

// RichCard — the single card-render component for every display sink (review,
// editor preview, note-type preview). It OWNS the full render pipeline and the
// ASYNC mermaid lifecycle (Step 6b, plan H1/CR1):
//
//   1. It calls `renderCardHtmlWithMermaid` ONCE (the single pipeline owner — no
//      second place collects mermaid sources, so the two can never drift), getting
//      back safe HTML with mermaid blocks left as inert placeholders + the list of
//      mermaid sources.
//   2. In an effect it lazy-loads `mermaid` (a large package — kept out of the
//      shared bundle), renders each source to an SVG, runs THAT SVG through the
//      dedicated `sanitizeMermaidSvg` sink, and stashes the result in state.
//   3. It renders through `<SafeHtml>` (the ONE HTML inject node in the app),
//      passing the sanitized SVG islands so they are substituted AFTER the main
//      sanitize (`<svg>` is not in the main allow-list — substituting before would
//      strip it). The single-inject-node invariant holds: RichCard introduces NO
//      second sink, it only manages the island swap around the same `SafeHtml`.
//
// Simplification for n=1 (plan H1): the mermaid render is NOT idempotent across
// re-mounts — it always renders from source (keyed by the per-render placeholder),
// no stash-restore double pass like KaTeX. The cost is a re-render on re-mount,
// acceptable for the current scale. KaTeX idempotency is unaffected (it lives
// inside `renderCardHtml`).

import React, { useEffect, useMemo, useState } from 'react';
import {
  renderCardHtmlWithMermaid,
  sanitizeMermaidSvg,
  SafeHtml,
} from '@/lib/render-card';
import { useT } from '@/lib/i18n';
import type { FieldValues, NoteTypeDef } from '@neuronexus/shared';

export interface RichCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Note-type (kind + templates) — same shape `renderCardHtml` consumes. */
  noteType: Pick<NoteTypeDef, 'kind' | 'templates'>;
  /** The note's field values (markdown source). */
  fieldValues: FieldValues;
  /** Which side of the card to render. */
  side: 'front' | 'back';
  /** Which template generates the card (defaults to 0). */
  templateOrd?: number;
}

// Escape a plain text string for safe insertion into the static error island
// (the only HTML RichCard itself emits — the i18n message, never user content).
function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const RichCard = ({
  noteType,
  fieldValues,
  side,
  templateOrd = 0,
  ...rest
}: RichCardProps) => {
  const t = useT();
  // ONE pipeline call (the single owner). Memoized on the render inputs so the
  // mermaid effect only re-runs when the actual content changes.
  const { html, mermaid } = useMemo(
    () => renderCardHtmlWithMermaid(noteType, fieldValues, side, templateOrd),
    [noteType, fieldValues, side, templateOrd],
  );

  // placeholder-key → sanitized SVG (or a static error island). Keys not yet in
  // the map stay as inert placeholder text (a brief "loading" state) in SafeHtml.
  const [islands, setIslands] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (mermaid.length === 0) {
      // No diagrams — clear any stale islands from a previous content render.
      setIslands((prev) => (prev.size > 0 ? new Map() : prev));
      return;
    }
    let cancelled = false;
    const next = new Map<string, string>();
    (async () => {
      let mermaidApi: typeof import('mermaid').default;
      try {
        // Lazy import — mermaid is a large package, kept out of the shared bundle.
        mermaidApi = (await import('mermaid')).default;
        mermaidApi.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'dark',
        });
      } catch (err) {
        // The whole mermaid module failed to load — render error islands for all.
        if (process.env.NODE_ENV !== 'test') console.warn('[mermaid] load failed', err);
        for (const { key } of mermaid) {
          next.set(key, `<div class="nn-mermaid nn-mermaid-error">${escapeText(t('editor.richText.mermaidError'))}</div>`);
        }
        if (!cancelled) setIslands(next);
        return;
      }
      for (const { key, source } of mermaid) {
        if (cancelled) return;
        try {
          // A unique DOM id per render call (mermaid injects a scratch node).
          const id = `nnmmd-${key}`;
          const { svg } = await mermaidApi.render(id, source);
          const safe = sanitizeMermaidSvg(svg);
          next.set(key, `<div class="nn-mermaid">${safe}</div>`);
        } catch (err) {
          // A single bad diagram must never break the whole card render.
          if (process.env.NODE_ENV !== 'test') console.warn('[mermaid] render failed', err);
          next.set(key, `<div class="nn-mermaid nn-mermaid-error">${escapeText(t('editor.richText.mermaidError'))}</div>`);
        }
      }
      if (!cancelled) setIslands(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [mermaid, t]);

  return <SafeHtml html={html} mermaidIslands={islands} {...rest} />;
};
