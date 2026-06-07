// T3 — native-feel CSS invariant test (Phase C gate).
// Reads globals.css as text and asserts the scoped native-feel rules are present
// and that user-select:none / -webkit-touch-callout:none are NEVER applied
// outside a .nn-chrome selector context (PM-2 safety invariant).

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cssPath = join(import.meta.dir, 'globals.css');
const css = readFileSync(cssPath, 'utf8');

// Strip CSS comments so we don't accidentally match commented-out rules.
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

// ── (a) user-select:none / -webkit-touch-callout:none must ONLY appear inside
//        a .nn-chrome selector block — never on body, html, .nn-rendered, etc.
// Strategy: split on .nn-chrome { ... } blocks, remove them, then assert the
// dangerous properties are absent from the remainder.
describe('PM-2 invariant: user-select:none scoped ONLY to .nn-chrome', () => {
  test('user-select:none does not appear outside a .nn-chrome block', () => {
    // Remove all .nn-chrome { ... } rule blocks (handles one level of nesting)
    const withoutChrome = cssNoComments.replace(/\.nn-chrome\s*\{[^}]*\}/g, '');
    // Must find no bare user-select:none outside chrome blocks
    expect(withoutChrome).not.toMatch(/user-select\s*:\s*none/);
  });

  test('-webkit-touch-callout:none does not appear outside a .nn-chrome block', () => {
    const withoutChrome = cssNoComments.replace(/\.nn-chrome\s*\{[^}]*\}/g, '');
    expect(withoutChrome).not.toMatch(/-webkit-touch-callout\s*:\s*none/);
  });

  test('-webkit-user-select:none does not appear outside a .nn-chrome block', () => {
    const withoutChrome = cssNoComments.replace(/\.nn-chrome\s*\{[^}]*\}/g, '');
    expect(withoutChrome).not.toMatch(/-webkit-user-select\s*:\s*none/);
  });
});

// ── (b) .nn-rendered safety belt must exist and set user-select: text
describe('.nn-rendered user-select:text safety rule', () => {
  test('.nn-rendered selector with user-select:text is present', () => {
    expect(css).toMatch(/\.nn-rendered[^{]*\{[^}]*user-select\s*:\s*text/);
  });

  test('-webkit-user-select:text safety rule is present for .nn-rendered', () => {
    expect(css).toMatch(/\.nn-rendered[^{]*\{[^}]*-webkit-user-select\s*:\s*text/);
  });
});

// ── (c) overscroll-behavior:none on html/body
describe('overscroll-behavior:none on html/body', () => {
  test('html, body rule contains overscroll-behavior: none', () => {
    expect(css).toMatch(/html\s*,?\s*body\s*\{[^}]*overscroll-behavior\s*:\s*none/);
  });
});

// ── (d) touch-action:manipulation present (on a, button rule)
describe('touch-action:manipulation present', () => {
  test('touch-action: manipulation rule is present', () => {
    expect(css).toMatch(/touch-action\s*:\s*manipulation/);
  });
});

// ── (e) @media (max-width:719px) input font-size ≥ 16px
describe('mobile input zoom fix', () => {
  test('@media (max-width:719px) block with input font-size:16px exists', () => {
    expect(css).toMatch(/@media\s*\(\s*max-width\s*:\s*719px\s*\)/);
  });

  test('the mobile media block sets input font-size to 16px', () => {
    // Extract the @media (max-width:719px) block
    const mediaMatch = css.match(/@media\s*\(\s*max-width\s*:\s*719px\s*\)\s*\{([\s\S]*?)\}/);
    expect(mediaMatch).not.toBeNull();
    const block = mediaMatch![1];
    // Assert font-size: 16px present (input/textarea/select)
    expect(block).toMatch(/font-size\s*:\s*16px/);
  });
});
