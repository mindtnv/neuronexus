import { describe, expect, test } from 'bun:test';
import { diffAnswer } from './review-answer';

describe('typed answer comparison', () => {
  test('ignores casing and surrounding whitespace while preserving the answer spelling', () => {
    expect(diffAnswer('  hello ', 'Hello').every((token) => token.kind === 'match')).toBe(true);
    expect(diffAnswer('hello', 'Hello').map((token) => token.ch).join('')).toBe('Hello');
  });
  test('treats canonically equivalent accents as the same answer', () => {
    expect(diffAnswer('cafe\u0301', 'café').every((token) => token.kind === 'match')).toBe(true);
  });
  test('keeps emoji and combined graphemes intact', () => {
    expect(diffAnswer('👩🏽‍💻', '👩🏽‍💻')).toEqual([{ ch: '👩🏽‍💻', kind: 'match' }]);
  });
  test('long answers fall back to complete text instead of allocating a quadratic matrix', () => {
    expect(diffAnswer('x'.repeat(1200), 'y'.repeat(1200))).toEqual([
      { ch: 'x'.repeat(1200), kind: 'extra' }, { ch: 'y'.repeat(1200), kind: 'missing' },
    ]);
  });
  test('reports extra and missing text without dropping either side', () => {
    const tokens = diffAnswer('cat!', 'cats');
    expect(tokens.filter((t) => t.kind !== 'missing').map((t) => t.ch).join('')).toBe('cat!');
    expect(tokens.filter((t) => t.kind !== 'extra').map((t) => t.ch).join('')).toBe('cats');
  });
});
