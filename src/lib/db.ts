import Dexie, { Table } from 'dexie';
import type { Card, Deck, Profile, Review } from './types';

class NNDexie extends Dexie {
  decks!: Table<Deck, string>;
  cards!: Table<Card, string>;
  reviews!: Table<Review, string>;
  profile!: Table<Profile, 'me'>;

  constructor() {
    super('neuronexus');
    this.version(1).stores({
      decks: 'id, name, createdAt',
      cards: 'id, deckId, createdAt, variant, [deckId+createdAt]',
      reviews: 'id, cardId, deckId, reviewedAt, [deckId+reviewedAt]',
      profile: 'id',
    });
    // v2 — add parentId index for nested-deck queries.
    this.version(2).stores({
      decks: 'id, name, createdAt, parentId',
      cards: 'id, deckId, createdAt, variant, [deckId+createdAt]',
      reviews: 'id, cardId, deckId, reviewedAt, [deckId+reviewedAt]',
      profile: 'id',
    });
  }
}

export const db = new NNDexie();
