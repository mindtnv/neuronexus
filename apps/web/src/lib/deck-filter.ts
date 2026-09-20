import type { DeckNode } from './decks';

/** Preserve ancestor context; never mutate the source tree or its expansion state. */
export function filterDeckTree(nodes: DeckNode[], query: string): DeckNode[] {
  const text = query.trim().toLocaleLowerCase();
  if (!text) return nodes;
  const walk = (items: DeckNode[], parentMatches = false): DeckNode[] => items.flatMap(node => {
    const nameMatches = !text || parentMatches || node.deck.name.toLocaleLowerCase().includes(text);
    const children = walk(node.children, parentMatches || (Boolean(text) && nameMatches));
    return nameMatches || children.length ? [{ ...node, children }] : [];
  });
  return walk(nodes);
}
