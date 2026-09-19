import type { DeckNode } from './decks';
export type DeckFilter = 'all' | 'due' | 'empty';

/** Preserve ancestor context; never mutate the source tree or its expansion state. */
export function filterDeckTree(nodes: DeckNode[], query: string, mode: DeckFilter, counts: ReadonlyMap<string, { total: number; due: number }>): DeckNode[] {
  const text = query.trim().toLocaleLowerCase();
  if (!text && mode === 'all') return nodes;
  const walk = (items: DeckNode[], parentMatches = false): DeckNode[] => items.flatMap(node => {
    const nameMatches = !text || parentMatches || node.deck.name.toLocaleLowerCase().includes(text);
    const children = walk(node.children, parentMatches || (Boolean(text) && nameMatches));
    const count = counts.get(node.deck.id) ?? { total: 0, due: 0 };
    const statusMatches = mode === 'all' || (mode === 'due' ? count.due > 0 : count.total === 0);
    return (nameMatches && statusMatches) || children.length ? [{ ...node, children }] : [];
  });
  return walk(nodes);
}
