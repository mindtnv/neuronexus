import type { Card } from './types';

function resolveNow(now?: number | Date): number {
  if (now instanceof Date) return now.getTime();
  return now ?? Date.now();
}

export function isCardDue(card: Card, now?: number | Date): boolean {
  return new Date(card.fsrs.due).getTime() <= resolveNow(now);
}

export function getDueCards(cards: Card[], now?: number | Date): Card[] {
  return cards.filter((card) => isCardDue(card, now));
}

export function countDueCards(cards: Card[], now?: number | Date): number {
  return getDueCards(cards, now).length;
}

export function countDueCardsByDeck(cards: Card[], now?: number | Date): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (!isCardDue(card, now)) continue;
    counts.set(card.deckId, (counts.get(card.deckId) ?? 0) + 1);
  }
  return counts;
}

export function getFirstDueCard(cards: Card[], now?: number | Date): Card | null {
  return (
    getDueCards(cards, now).sort(
      (left, right) => new Date(left.fsrs.due).getTime() - new Date(right.fsrs.due).getTime(),
    )[0] ?? null
  );
}
