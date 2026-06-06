// Two-engine bypass corpus — CLIENT edge (M2 Phase 3, plan A2 + C-6).
//
// This is the FIRST test to actually EXECUTE the client DOMPurify config in
// `render-card.tsx` (M1 only asserted a hardcoded list, never ran DOMPurify). It
// registers a happy-dom global DOM so `dompurify` has a `window`, then runs the
// SAME shared corpus (apps/api/tests/sanitize-img-corpus.ts) through the client
// `sanitizeHtml`. The server edge runs the identical corpus in
// apps/api/tests/sanitize-img.test.ts — the `keep`/`mustNotContain` expectations
// live in the shared module, so the two edges are asserted byte-identical in
// keep/drop by construction.
//
// IMPORTANT: the DOM must be registered (and the happy-dom nodeName getter
// repaired) BEFORE importing render-card, because dompurify captures `window` and
// caches `Node.prototype.nodeName` at module-eval time. `test-dom-setup` does
// both as an import side effect, so it MUST be the first import here.

import { GlobalRegistrator } from './test-dom-setup.ts';

import { afterAll, describe, expect, test } from 'bun:test';
import {
  IMG_CORPUS,
  MXSS_CORPUS,
  VALID_TOKEN,
  isNeutralized,
  keptImg,
} from '../../../api/tests/sanitize-img-corpus.ts';
// Imported AFTER the DOM is registered so DOMPurify binds to the happy-dom window.
import { sanitizeHtml } from './render-card.tsx';

afterAll(async () => {
  // `GlobalRegistrator` is a cross-file singleton: another DOM-using test file in
  // the same `bun test` run (e.g. render-math.test.ts) may already have
  // unregistered it. Guard so this teardown never throws on an already-clean
  // global regardless of file execution order.
  try {
    await GlobalRegistrator.unregister();
  } catch {
    /* already unregistered by another suite — fine */
  }
});

describe('client DOMPurify actually executes under happy-dom', () => {
  test('a real DOM is registered', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
  });

  // Sentinel: if DOMPurify were a no-op (no DOM), a disallowed tag would survive.
  // Proving it is stripped proves DOMPurify ran.
  test('DOMPurify is live: a disallowed <script> is stripped', () => {
    const out = sanitizeHtml('<p>ok</p><script>alert(1)</script>');
    expect(out.toLowerCase()).not.toContain('<script');
    expect(out).toContain('ok');
  });
});

describe('sanitizeHtml — img relative-token corpus (client edge)', () => {
  for (const c of IMG_CORPUS) {
    test(`${c.keep ? 'KEEP' : 'DROP'}: ${c.label}`, () => {
      const out = sanitizeHtml(c.input);
      expect(keptImg(out)).toBe(c.keep);
      for (const banned of c.mustNotContain) {
        expect(out.toLowerCase()).not.toContain(banned);
      }
    });
  }

  test('a kept img carries the valid token as src', () => {
    const out = sanitizeHtml(`<img src="${VALID_TOKEN}">`);
    expect(out).toContain(VALID_TOKEN);
  });

  test('a kept img with injected onerror keeps src, drops onerror', () => {
    const out = sanitizeHtml(`<img src="${VALID_TOKEN}" onerror=alert(1)>`);
    expect(keptImg(out)).toBe(true);
    expect(out).toContain(VALID_TOKEN);
    expect(out.toLowerCase()).not.toContain('onerror');
  });
});

describe('M1 mXSS corpus stays neutralized with img allowed (client edge)', () => {
  for (const vector of MXSS_CORPUS) {
    test(`neutralizes: ${vector.slice(0, 50)}`, () => {
      expect(isNeutralized(sanitizeHtml(vector))).toBe(true);
    });
  }
});
