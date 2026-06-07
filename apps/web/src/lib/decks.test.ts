import { describe, expect, test } from 'bun:test';
import { deckRowTarget, type DeckNode } from './decks';
import type { Deck } from './types';

function makeDeck(id: string, name: string): Deck {
  return { id, name, color: 'lime', species: 'fern', createdAt: 0 };
}

function leaf(id: string, name: string): DeckNode {
  return { deck: makeDeck(id, name), depth: 0, children: [] };
}

function parent(id: string, name: string, children: DeckNode[]): DeckNode {
  return { deck: makeDeck(id, name), depth: 0, children };
}

describe('deckRowTarget', () => {
  test('parent with children → toggle', () => {
    const node = parent('p', 'Languages', [leaf('c', 'German')]);
    expect(deckRowTarget(node)).toEqual({ kind: 'toggle' });
  });

  test('leaf → cards with escaped deck query', () => {
    const node = leaf('c', 'German');
    expect(deckRowTarget(node)).toEqual({
      kind: 'cards',
      query: encodeURIComponent('deck:"German"'),
    });
  });

  test('leaf with spaces in name → quoted query', () => {
    const node = leaf('c', 'My Deck');
    const result = deckRowTarget(node);
    expect(result).toEqual({ kind: 'cards', query: encodeURIComponent('deck:"My Deck"') });
    // round-trips back to a single quoted term
    expect(decodeURIComponent((result as { query: string }).query)).toBe('deck:"My Deck"');
  });

  test('leaf with embedded quotes → quotes escaped', () => {
    const node = leaf('c', 'a "b" c');
    const result = deckRowTarget(node);
    expect(decodeURIComponent((result as { query: string }).query)).toBe('deck:"a \\"b\\" c"');
  });
});
