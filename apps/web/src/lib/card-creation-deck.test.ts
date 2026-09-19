import { expect, test } from 'bun:test';
import { cardCreationDeck } from './card-creation-deck';
import type { Deck } from './types';
const decks = [
  { id: 'root', name: '.NET', color: 'violet', species: 'fern', createdAt: 0 },
  { id: 'aspnet', name: 'ASP.NET Core', parentId: 'root', color: 'violet', species: 'fern', createdAt: 0 },
] as Deck[];
test('creation follows the positive deck selection, not other filters', () => {
  expect(cardCreationDeck('deck:"ASP.NET Core" tag:aspnet is:due', decks)?.id).toBe('aspnet');
  expect(cardCreationDeck('deck:".NET / ASP.NET Core"', decks)?.id).toBe('aspnet');
});
test('ambiguous, negated and absent scopes do not choose a deck', () => {
  for (const query of ['', '-deck:"ASP.NET Core"', 'deck:.NET OR tag:aspnet', 'deck:.NET deck:"ASP.NET Core"', 'deck:missing', '(']) {
    expect(cardCreationDeck(query, decks)).toBeUndefined();
  }
  expect(cardCreationDeck('deck:"ASP.NET Core"', [...decks, { ...decks[1]!, id: 'duplicate' }])).toBeUndefined();
});
