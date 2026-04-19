import { describe, expect, test } from 'bun:test';
import { getHomeAddCardHref } from './home-actions';

describe('getHomeAddCardHref', () => {
  test('routes first-run users to create a deck', () => {
    expect(getHomeAddCardHref([])).toBe('/decks?new=1');
  });

  test('routes single-deck users straight into the editor with deck context', () => {
    expect(getHomeAddCardHref(['deck-1'])).toBe('/editor?deck=deck-1&from=home');
  });

  test('routes multi-deck users to decks to avoid ambiguous editor context', () => {
    expect(getHomeAddCardHref(['deck-1', 'deck-2'])).toBe('/decks');
  });
});
