import { expect, test } from 'bun:test';
import { parseSourceTextSelection, normalizeSourceText } from './source-text-selection';
const id = '01900000-0000-7000-8000-000000000001';
const chunk = { chunkId: id, textHash: 'a'.repeat(64), renderedHash: 'b'.repeat(64), start: 2, end: 7 };
test('text selections retain ordered source/render hashes and allow explicit quote-only fallback', () => {
  const selection = { version: 1 as const, quote: 'A Pod', chunks: [chunk], prefix: 'About ', suffix: ' groups' };
  expect(parseSourceTextSelection(selection)).toEqual(selection);
  expect(parseSourceTextSelection({ version: 1, quote: 'Formula x²', chunks: [] }).chunks).toEqual([]);
  expect(normalizeSourceText('  A\n\tPod\u00a0groups  containers. ')).toBe('A Pod groups containers.');
});
test('text selections reject oversized quotes, ambiguous chunks, invalid hashes and invented PDF coordinates', () => {
  for (const input of [
    { version: 1, quote: 'x'.repeat(4001), chunks: [] },
    { version: 1, quote: 'A', chunks: [chunk,chunk] },
    { version: 1, quote: 'A', chunks: [{ ...chunk, end: 1 }] },
    { version: 1, quote: 'A', chunks: [{ ...chunk, textHash: 'made-up' }] },
    { version: 1, quote: 'A', chunks: [], page: 4, rects: [] },
    { version: 1, quote: ' ', chunks: [] },
  ]) expect(() => parseSourceTextSelection(input)).toThrow();
});
