export function getHomeAddCardHref(deckIds: string[]): string {
  if (deckIds.length === 0) return '/decks?new=1';
  if (deckIds.length === 1) {
    return `/editor?deck=${encodeURIComponent(deckIds[0]!)}&from=home`;
  }
  return '/decks';
}
