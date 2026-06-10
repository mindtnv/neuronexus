'use client';

// Code-block copy buttons (B3) — client-side DOM decoration of the rendered
// markdown, applied AFTER React commits the SafeHtml output. The sanitizer is
// NEVER touched: a <button> injected here exists only in the live DOM, outside
// the sanitize pipeline (re-sanitization would strip it, which is why this is
// an effect, not part of the HTML string).
//
// Decoration is idempotent (the `data-nn-copy` marker) and scoped to the host
// element the hook owns — cited RichCards render in their own hosts and never
// get buttons from a chat answer's pass.

import { useEffect, type RefObject } from 'react';

const COPY_GLYPH =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>';
const CHECK_GLYPH =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

export interface CodeCopyLabels {
  copy: string;
  copied: string;
}

/** Decorate every un-decorated `pre` under `root` with a copy button. */
export function decorateCodeBlocks(root: HTMLElement, labels: CodeCopyLabels): void {
  const pres = root.querySelectorAll('pre');
  pres.forEach((pre) => {
    if (pre.querySelector('[data-nn-copy]')) return;
    pre.style.position = 'relative';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nn-code-copy';
    btn.setAttribute('data-nn-copy', '1');
    btn.setAttribute('aria-label', labels.copy);
    btn.title = labels.copy;
    btn.innerHTML = COPY_GLYPH;
    btn.addEventListener('click', () => {
      const code = pre.querySelector('code');
      const text = (code ?? pre).textContent ?? '';
      void navigator.clipboard
        .writeText(text)
        .then(() => {
          btn.innerHTML = CHECK_GLYPH;
          btn.title = labels.copied;
          window.setTimeout(() => {
            btn.innerHTML = COPY_GLYPH;
            btn.title = labels.copy;
          }, 1500);
        })
        .catch(() => {
          // Clipboard unavailable / denied — best-effort, leave the glyph alone.
        });
    });
    pre.appendChild(btn);
  });
}

/**
 * Hook wiring: re-decorates the host after each FINAL render of the message
 * (`final` false ⇒ skipped entirely — no churn while tokens stream; SafeHtml
 * replaces the host's DOM on every delta, which would orphan the buttons
 * anyway). `html` in the deps re-runs the pass when the content changes.
 */
export function useCodeCopyButtons(
  ref: RefObject<HTMLElement | null>,
  deps: { html: string; final: boolean },
  labels: CodeCopyLabels,
): void {
  useEffect(() => {
    if (!deps.final) return;
    const host = ref.current;
    if (!host) return;
    decorateCodeBlocks(host, labels);
  }, [ref, deps.final, deps.html, labels]);
}
