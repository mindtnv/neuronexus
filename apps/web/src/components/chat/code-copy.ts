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

/** Clipboard works on both HTTPS and the private-network development origin. */
export async function copyCodeText(text: string): Promise<void> {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; } } catch { /* Try the local document fallback. */ }
  const active = document.activeElement as HTMLElement | null;
  const field = document.createElement('textarea');
  field.value = text; field.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0';
  document.body.appendChild(field); field.focus({ preventScroll: true }); field.select();
  try { if (!document.execCommand('copy')) throw new Error('copy_failed'); }
  finally { field.remove(); active?.focus({ preventScroll: true }); }
}

/** Post-sanitize decoration preserves highlight spans and copies only source code. */
export function decorateCodeBlocks(root: HTMLElement, labels: CodeCopyLabels): void {
  root.querySelectorAll('pre').forEach(pre => {
    if (pre.parentElement?.classList.contains('nn-code-block')) return;
    const code = pre.querySelector('code');
    if (!code || code.classList.contains('language-mermaid')) return;
    const text = code.textContent ?? '';
    pre.querySelector('[data-nn-copy]')?.remove();
    const block = document.createElement('div'); block.className = 'nn-code-block';
    const header = document.createElement('div'); header.className = 'nn-code-header';
    const language = [...code.classList].find(name => name.startsWith('language-'))?.slice(9);
    const name = document.createElement('span');
    name.textContent = language ? ({ csharp: 'C#', cs: 'C#', javascript: 'JavaScript', typescript: 'TypeScript', cpp: 'C++' }[language] ?? language.toUpperCase()) : 'CODE';
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'nn-code-copy';
    btn.setAttribute('data-nn-copy', '1'); btn.setAttribute('aria-label', labels.copy); btn.dataset.tooltip = labels.copy;
    btn.innerHTML = COPY_GLYPH;
    const caption = document.createElement('span'); caption.textContent = labels.copy; btn.appendChild(caption);
    btn.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      void copyCodeText(text).then(() => {
        btn.innerHTML = CHECK_GLYPH; const done = document.createElement('span'); done.textContent = labels.copied; btn.appendChild(done);
        btn.setAttribute('aria-label', labels.copied);
        window.setTimeout(() => { if (!btn.isConnected) return; btn.innerHTML = COPY_GLYPH; btn.appendChild(caption); btn.setAttribute('aria-label', labels.copy); }, 1500);
      }).catch(() => { /* Preserve the source and allow another copy attempt. */ });
    });
    const lines = document.createElement('span'); lines.className = 'nn-code-lines'; lines.setAttribute('aria-hidden', 'true');
    lines.textContent = Array.from({ length: text.replace(/\n$/, '').split('\n').length }, (_, i) => String(i + 1)).join('\n');
    header.append(name, btn);
    pre.parentNode?.insertBefore(block, pre); block.append(header, pre); pre.prepend(lines);
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
