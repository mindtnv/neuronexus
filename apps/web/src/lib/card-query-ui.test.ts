import { describe, expect, test } from 'bun:test';
import {
  addOrReplaceToken,
  quoteIfNeeded,
  toggleToken,
  tokenizeQuery,
} from './card-query-ui';

describe('quoteIfNeeded', () => {
  test('leaves simple values alone', () => {
    expect(quoteIfNeeded('French')).toBe('French');
    expect(quoteIfNeeded('verb')).toBe('verb');
  });
  test('quotes values with whitespace', () => {
    expect(quoteIfNeeded('My Deck')).toBe('"My Deck"');
  });
  test('quotes empty values and escapes embedded quotes', () => {
    expect(quoteIfNeeded('')).toBe('""');
    expect(quoteIfNeeded('a "b" c')).toBe('"a \\"b\\" c"');
  });
});

describe('tokenizeQuery', () => {
  test('splits on whitespace but keeps quoted spans whole', () => {
    expect(tokenizeQuery('deck:"My Deck" tag:verb is:due')).toEqual([
      'deck:"My Deck"',
      'tag:verb',
      'is:due',
    ]);
  });
  test('handles empty input', () => {
    expect(tokenizeQuery('')).toEqual([]);
    expect(tokenizeQuery('   ')).toEqual([]);
  });
});

describe('addOrReplaceToken', () => {
  test('appends when key is absent', () => {
    expect(addOrReplaceToken('tag:verb', 'deck', 'French')).toBe('tag:verb deck:French');
  });
  test('replaces an existing token with the same key', () => {
    expect(addOrReplaceToken('deck:German tag:verb', 'deck', 'French')).toBe(
      'deck:French tag:verb',
    );
  });
  test('replaces a quoted deck token and re-quotes spaced values', () => {
    expect(addOrReplaceToken('deck:"Old Deck"', 'deck', 'New Deck')).toBe('deck:"New Deck"');
  });
  test('drops duplicate keys, keeping a single replacement', () => {
    expect(addOrReplaceToken('deck:a deck:b tag:x', 'deck', 'c')).toBe('deck:c tag:x');
  });
  test('starts from an empty query', () => {
    expect(addOrReplaceToken('', 'is', 'due')).toBe('is:due');
  });
});

describe('toggleToken', () => {
  test('adds the token when absent', () => {
    expect(toggleToken('tag:verb', 'is:due')).toBe('tag:verb is:due');
  });
  test('removes the token when present', () => {
    expect(toggleToken('tag:verb is:due', 'is:due')).toBe('tag:verb');
  });
  test('toggles state chips independently', () => {
    expect(toggleToken('is:new', 'is:due')).toBe('is:new is:due');
    expect(toggleToken('is:new is:due', 'is:new')).toBe('is:due');
  });
});
