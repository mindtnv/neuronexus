// Two-engine bypass corpus — SERVER edge (M2 Phase 3, plan A2 + C-6).
//
// Runs the shared corpus (apps/api/tests/sanitize-img-corpus.ts) through the
// server `sanitize-html` config. The CLIENT edge runs the SAME corpus through
// DOMPurify in `apps/web/src/lib/sanitize-img.test.ts` (under happy-dom). Both
// assert IDENTICAL keep/drop — the `keep` flag and `mustNotContain` list live in
// the shared module, so parity is structural: a divergence fails one side.

import { describe, expect, test } from 'bun:test';
import { MEDIA_TOKEN_RE, sanitizeFieldHtml } from '../src/sanitize.ts';
import {
  IMG_CORPUS,
  MXSS_CORPUS,
  VALID_TOKEN,
  isNeutralized,
  keptImg,
} from './sanitize-img-corpus.ts';

describe('sanitizeFieldHtml — img relative-token corpus (server edge)', () => {
  for (const c of IMG_CORPUS) {
    test(`${c.keep ? 'KEEP' : 'DROP'}: ${c.label}`, () => {
      const out = sanitizeFieldHtml(c.input);
      expect(keptImg(out)).toBe(c.keep);
      for (const banned of c.mustNotContain) {
        expect(out.toLowerCase()).not.toContain(banned);
      }
    });
  }

  test('a kept img carries exactly the valid token as src', () => {
    const out = sanitizeFieldHtml(`<img src="${VALID_TOKEN}">`);
    expect(out).toContain(`src="${VALID_TOKEN}"`);
  });

  test('a kept img with injected onerror keeps src, drops onerror', () => {
    const out = sanitizeFieldHtml(`<img src="${VALID_TOKEN}" onerror=alert(1)>`);
    expect(keptImg(out)).toBe(true);
    expect(out).toContain(`src="${VALID_TOKEN}"`);
    expect(out.toLowerCase()).not.toContain('onerror');
  });
});

describe('MEDIA_TOKEN_RE is anchored and strict', () => {
  test('matches a canonical token only', () => {
    expect(MEDIA_TOKEN_RE.test(VALID_TOKEN)).toBe(true);
  });
  test('rejects leading/trailing junk and malformed shapes', () => {
    expect(MEDIA_TOKEN_RE.test(` ${VALID_TOKEN}`)).toBe(false);
    expect(MEDIA_TOKEN_RE.test(`${VALID_TOKEN} `)).toBe(false);
    expect(MEDIA_TOKEN_RE.test(`${VALID_TOKEN}#`)).toBe(false);
    expect(MEDIA_TOKEN_RE.test(`x${VALID_TOKEN}`)).toBe(false);
    expect(MEDIA_TOKEN_RE.test('/m/------------------------------------')).toBe(false);
    expect(MEDIA_TOKEN_RE.test('/m/../x')).toBe(false);
  });
});

describe('M1 mXSS corpus stays neutralized with img allowed (server edge)', () => {
  for (const vector of MXSS_CORPUS) {
    test(`neutralizes: ${vector.slice(0, 50)}`, () => {
      expect(isNeutralized(sanitizeFieldHtml(vector))).toBe(true);
    });
  }
});
