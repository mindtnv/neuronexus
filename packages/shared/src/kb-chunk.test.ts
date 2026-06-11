import { describe, expect, test } from 'bun:test';
import { CARD_TOKEN_RE, chunkSource } from './kb-chunk.ts';
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

describe('chunkSource — unsupported sourceType (AC7 seam)', () => {
  test('throws not_implemented for an unknown sourceType', () => {
    // The 'document' branch is now implemented (see kb-chunk-document.test.ts);
    // only a future/unknown sourceType hits the not_implemented guard.
    expect(() =>
      chunkSource({ sourceType: 'note' as any, sourceId: 'x', parentId: 'x', text: 'hi' }),
    ).toThrow('not_implemented');
  });
});

describe('CARD_TOKEN_RE — model-emitted card citation token', () => {
  test('captures the cardId from a [card:<uuid>] token', () => {
    const sample = 'answer [card:aaaaaaaa-0000-0000-0000-000000000001].';
    const re = new RegExp(CARD_TOKEN_RE.source, CARD_TOKEN_RE.flags);
    const match = re.exec(sample);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('aaaaaaaa-0000-0000-0000-000000000001');
  });

  test('captures every cardId across multiple tokens', () => {
    const sample =
      'first [card:aaaaaaaa-0000-0000-0000-000000000001] and second [card:bbbbbbbb-0000-0000-0000-000000000002].';
    const re = new RegExp(CARD_TOKEN_RE.source, CARD_TOKEN_RE.flags);
    const ids = [...sample.matchAll(re)].map((m) => m[1]);
    expect(ids).toEqual([
      'aaaaaaaa-0000-0000-0000-000000000001',
      'bbbbbbbb-0000-0000-0000-000000000002',
    ]);
  });

  test('does not match prose without a token', () => {
    const re = new RegExp(CARD_TOKEN_RE.source, CARD_TOKEN_RE.flags);
    expect(re.test('just a plain answer with no citation.')).toBe(false);
  });
});
