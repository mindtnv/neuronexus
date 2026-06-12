// Unit tests for the «Блокноты 2.0» N2 studio pure helpers: artifact `[src:]`
// footnote parsing + token stripping, and the artifact-status terminal checks.
// No DOM — these are pure functions, so they run under `bun test` directly.

import { describe, expect, test } from 'bun:test';
import { parseArtifactCitations, stripSrcTokens } from './notebook-artifacts';
import { anyArtifactNonTerminal, isArtifactNonTerminal } from './use-artifact-status';

const CHUNK_A = '11111111-1111-1111-1111-111111111111';
const CHUNK_B = '22222222-2222-2222-2222-222222222222';

describe('parseArtifactCitations', () => {
  test('numbers distinct chunk ids in order of first appearance', () => {
    const { prose, footnotes, numbering } = parseArtifactCitations(
      `First claim [src:${CHUNK_A}]. Second [src:${CHUNK_B}]. Back to first [src:${CHUNK_A}].`,
    );
    expect(footnotes).toEqual([
      { n: 1, chunkId: CHUNK_A },
      { n: 2, chunkId: CHUNK_B },
    ]);
    // The raw [src:] tokens are KEPT in the prose — the DOM decorator swaps them
    // post-render (injecting HTML here would be escaped by markdown-it).
    expect(prose).toContain(`[src:${CHUNK_A}]`);
    expect(prose).toContain(`[src:${CHUNK_B}]`);
    expect(prose).not.toContain('<sup>');
    // The numbering map drives the inline chips: first appearance → 1-based number,
    // the repeated reference reuses index 1 (not a new footnote).
    expect(numbering.get(CHUNK_A)).toBe(1);
    expect(numbering.get(CHUNK_B)).toBe(2);
    expect(numbering.size).toBe(2);
  });

  test('no tokens ⇒ unchanged prose + empty footnotes + empty numbering', () => {
    const { prose, footnotes, numbering } = parseArtifactCitations('Plain text, no citations.');
    expect(prose).toBe('Plain text, no citations.');
    expect(footnotes).toEqual([]);
    expect(numbering.size).toBe(0);
  });
});

describe('stripSrcTokens', () => {
  test('removes every [src:] token and collapses leftover whitespace', () => {
    expect(stripSrcTokens(`A [src:${CHUNK_A}] B [src:${CHUNK_B}] C`)).toBe('A B C');
  });
});

describe('artifact status terminal checks', () => {
  test('isArtifactNonTerminal: pending/generating are non-terminal, ready/error are terminal', () => {
    expect(isArtifactNonTerminal('pending')).toBe(true);
    expect(isArtifactNonTerminal('generating')).toBe(true);
    expect(isArtifactNonTerminal('ready')).toBe(false);
    expect(isArtifactNonTerminal('error')).toBe(false);
  });

  test('anyArtifactNonTerminal flags a set with any running job', () => {
    expect(anyArtifactNonTerminal([{ status: 'ready' }, { status: 'error' }])).toBe(false);
    expect(anyArtifactNonTerminal([{ status: 'ready' }, { status: 'generating' }])).toBe(true);
    expect(anyArtifactNonTerminal([])).toBe(false);
  });
});
