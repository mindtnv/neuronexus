/** Shared tie-breaks keep existing alphabetical trees stable before any manual move. */
export function compareDeckOrder(a: { id: string; name: string; position?: number }, b: { id: string; name: string; position?: number }) {
  return (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}
export type DeckPlacement = 'before' | 'after' | 'inside';
