import { describe, expect, test } from 'bun:test';
import { chunkSource } from './kb-chunk.ts';
import type { SourceInput } from './kb-chunk.ts';

describe('chunkSource — card branch', () => {
  const input: SourceInput = {
    sourceType: 'card',
    sourceId: 'aaaaaaaa-0000-0000-0000-000000000001',
    parentId: 'aaaaaaaa-0000-0000-0000-000000000001',
    text: 'The mitochondria is the powerhouse of the cell.',
    meta: { deckId: 'dddddddd-0000-0000-0000-000000000001', noteId: 'nnnnnnnn-0000-0000-0000-000000000001' },
  };

  test('returns exactly 1 chunk', () => {
    const chunks = chunkSource(input);
    expect(chunks).toHaveLength(1);
  });

  test('chunk is at position 0', () => {
    const [chunk] = chunkSource(input);
    expect(chunk.position).toBe(0);
  });

  test('sourceType, sourceId, parentId are carried through', () => {
    const [chunk] = chunkSource(input);
    expect(chunk.sourceType).toBe('card');
    expect(chunk.sourceId).toBe(input.sourceId);
    expect(chunk.parentId).toBe(input.parentId);
  });

  test('text is carried through unchanged', () => {
    const [chunk] = chunkSource(input);
    expect(chunk.text).toBe(input.text);
  });

  test('meta is carried through', () => {
    const [chunk] = chunkSource(input);
    expect(chunk.meta).toEqual(input.meta);
  });

  test('works without meta', () => {
    const chunks = chunkSource({ ...input, meta: undefined });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].meta).toBeUndefined();
  });
});

describe('chunkSource — document branch (AC7 seam)', () => {
  test('throws not_implemented for unsupported sourceType', () => {
    // Cast to any to simulate calling with a future 'document' sourceType
    // before that branch is implemented.
    expect(() =>
      chunkSource({ sourceType: 'document' as any, sourceId: 'x', parentId: 'x', text: 'hi' }),
    ).toThrow('not_implemented');
  });
});
