import { expect, test } from 'bun:test';
import { filterDeckTree } from './deck-filter';
import type { DeckNode } from './decks';
import type { Deck } from './types';
const leaf = (id: string, name: string): DeckNode => ({ deck: { id, name } as Deck, depth: 1, children: [] });
const tree: DeckNode[] = [{ deck: { id: 'root', name: 'Frontend' } as Deck, depth: 0, children: [leaf('react', 'React'), leaf('css', 'CSS'), leaf('empty', 'Unsorted')] }];
test('nested case-insensitive search keeps the ancestor path without mutating the source', () => {
  const result = filterDeckTree(tree, ' REACT ');
  expect(result[0].deck.id).toBe('root');
  expect(result[0].children.map(n => n.deck.id)).toEqual(['react']);
  expect(tree[0].children.length).toBe(3);
});
test('matching parent includes descendants', () => {
  expect(filterDeckTree(tree, 'front')[0].children.length).toBe(3);
});
test('no filter returns the original tree; no match returns no rows', () => {
  expect(filterDeckTree(tree, '')).toBe(tree);
  expect(filterDeckTree(tree, 'no match')).toEqual([]);
});
