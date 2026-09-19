import { expect, test } from 'bun:test';
import { filterDeckTree } from './deck-filter';
import type { DeckNode } from './decks';
import type { Deck } from './types';
const leaf = (id: string, name: string): DeckNode => ({ deck: { id, name } as Deck, depth: 1, children: [] });
const tree: DeckNode[] = [{ deck: { id: 'root', name: 'Frontend' } as Deck, depth: 0, children: [leaf('react', 'React'), leaf('css', 'CSS'), leaf('empty', 'Unsorted')] }];
const counts = new Map([['root', {total: 5, due: 2}], ['react', {total: 3, due: 2}], ['css', {total: 2, due: 0}], ['empty', {total: 0, due: 0}]]);
test('nested case-insensitive search keeps the ancestor path without mutating the source', () => {
  const result = filterDeckTree(tree, ' REACT ', 'all', counts);
  expect(result[0].deck.id).toBe('root');
  expect(result[0].children.map(n => n.deck.id)).toEqual(['react']);
  expect(tree[0].children.length).toBe(3);
});
test('matching parent includes descendants, intersected with status', () => {
  expect(filterDeckTree(tree, 'front', 'all', counts)[0].children.length).toBe(3);
  expect(filterDeckTree(tree, 'front', 'due', counts)[0].children.map(n => n.deck.id)).toEqual(['react']);
});
test('empty filter keeps parent context without falsely treating a populated subtree as empty', () => {
  expect(filterDeckTree(tree, '', 'empty', counts)[0].children.map(n => n.deck.id)).toEqual(['empty']);
  expect(filterDeckTree(tree, 'React', 'empty', counts)).toEqual([]);
});
test('no filter returns the original tree; no match returns no rows', () => {
  expect(filterDeckTree(tree, '', 'all', counts)).toBe(tree);
  expect(filterDeckTree(tree, 'no match', 'all', counts)).toEqual([]);
});
