'use client';

import { create } from 'zustand';
import { db } from './db';
import { gradeFsrs, newFsrsCard } from './fsrs';
import type { Card, Deck, Profile, Rating, Review } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

function todayISO(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function yesterdayISO(now = new Date()): string {
  return new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10);
}

interface State {
  bootstrapped: boolean;
  decks: Deck[];
  cards: Card[];
  profile: Profile | null;

  bootstrap: () => Promise<void>;
  reset: () => Promise<void>;

  addDeck: (input: Omit<Deck, 'id' | 'createdAt'>) => Promise<Deck>;
  updateDeck: (id: string, patch: Partial<Omit<Deck, 'id' | 'createdAt'>>) => Promise<void>;
  deleteDeck: (id: string) => Promise<void>;

  addCard: (input: Omit<Card, 'id' | 'createdAt' | 'updatedAt' | 'fsrs'>) => Promise<Card>;
  updateCard: (id: string, patch: Partial<Omit<Card, 'id' | 'deckId' | 'createdAt'>>) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;

  gradeCard: (cardId: string, rating: Rating, durationMs: number) => Promise<Review>;
  updateProfile: (patch: Partial<Omit<Profile, 'id'>>) => Promise<void>;
}

export const useNN = create<State>()((set, get) => ({
  bootstrapped: false,
  decks: [],
  cards: [],
  profile: null,

  async bootstrap() {
    if (get().bootstrapped) return;
    const [decks, cards, profile] = await Promise.all([
      db.decks.toArray(),
      db.cards.toArray(),
      db.profile.get('me'),
    ]);
    set({ decks, cards, profile: profile ?? null, bootstrapped: true });
  },

  async reset() {
    await db.transaction('rw', db.decks, db.cards, db.reviews, db.profile, async () => {
      await Promise.all([db.decks.clear(), db.cards.clear(), db.reviews.clear(), db.profile.clear()]);
    });
    set({ decks: [], cards: [], profile: null, bootstrapped: false });
  },

  async addDeck(input) {
    const deck: Deck = { ...input, id: crypto.randomUUID(), createdAt: Date.now() };
    await db.decks.add(deck);
    set((s) => ({ decks: [...s.decks, deck] }));
    return deck;
  },

  async updateDeck(id, patch) {
    await db.decks.update(id, patch);
    set((s) => ({ decks: s.decks.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  },

  async deleteDeck(id) {
    // Gather deck + all descendants so delete cascades through the tree.
    const all = get().decks;
    const queue = [id];
    const toRemove = new Set<string>();
    while (queue.length) {
      const current = queue.shift()!;
      if (toRemove.has(current)) continue;
      toRemove.add(current);
      for (const d of all) if (d.parentId === current) queue.push(d.id);
    }
    const ids = Array.from(toRemove);
    await db.transaction('rw', db.decks, db.cards, db.reviews, async () => {
      await db.decks.bulkDelete(ids);
      await db.cards.where('deckId').anyOf(ids).delete();
      await db.reviews.where('deckId').anyOf(ids).delete();
    });
    const removed = new Set(ids);
    set((s) => ({
      decks: s.decks.filter((d) => !removed.has(d.id)),
      cards: s.cards.filter((c) => !removed.has(c.deckId)),
    }));
  },

  async addCard(input) {
    const now = Date.now();
    const card: Card = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      fsrs: newFsrsCard(new Date(now)),
    };
    await db.cards.add(card);
    set((s) => ({ cards: [...s.cards, card] }));
    return card;
  },

  async updateCard(id, patch) {
    const next = { ...patch, updatedAt: Date.now() };
    await db.cards.update(id, next);
    set((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, ...next } : c)) }));
  },

  async deleteCard(id) {
    await db.transaction('rw', db.cards, db.reviews, async () => {
      await db.cards.delete(id);
      await db.reviews.where('cardId').equals(id).delete();
    });
    set((s) => ({ cards: s.cards.filter((c) => c.id !== id) }));
  },

  async gradeCard(cardId, rating, durationMs) {
    const card = get().cards.find((c) => c.id === cardId);
    if (!card) throw new Error(`card ${cardId} not found`);
    const now = new Date();
    const res = gradeFsrs(card.fsrs, rating, now);
    const updatedCard: Card = { ...card, fsrs: res.card, updatedAt: now.getTime() };
    const review: Review = {
      id: crypto.randomUUID(),
      cardId,
      deckId: card.deckId,
      rating,
      durationMs,
      reviewedAt: now.getTime(),
      nextDue: new Date(res.card.due).getTime(),
      nextStability: res.card.stability,
      nextDifficulty: res.card.difficulty,
    };

    const profile = get().profile;
    const today = todayISO(now);
    let nextProfile: Profile | null = null;
    if (profile) {
      const last = profile.lastReviewDate;
      let streakDays = profile.streakDays;
      if (last !== today) {
        streakDays = last === yesterdayISO(now) ? streakDays + 1 : 1;
      }
      const xp = profile.xp + rating * 10;
      const level = Math.max(1, Math.floor(xp / 500) + 1);
      const plantStage = Math.max(0, Math.min(5, Math.floor(streakDays / 7))) as Profile['plantStage'];
      nextProfile = { ...profile, streakDays, xp, level, lastReviewDate: today, plantStage };
    }

    await db.transaction('rw', db.cards, db.reviews, db.profile, async () => {
      await db.cards.put(updatedCard);
      await db.reviews.add(review);
      if (nextProfile) await db.profile.put(nextProfile);
    });

    set((s) => ({
      cards: s.cards.map((c) => (c.id === cardId ? updatedCard : c)),
      profile: nextProfile ?? s.profile,
    }));

    return review;
  },

  async updateProfile(patch) {
    const cur = get().profile;
    if (!cur) return;
    const next: Profile = { ...cur, ...patch };
    await db.profile.put(next);
    set({ profile: next });
  },
}));

// Selectors (pure functions, used in components with `useNN(selector)`)
export const selectDueCards = (now: Date = new Date()) => (s: State) =>
  s.cards.filter((c) => new Date(c.fsrs.due).getTime() <= now.getTime());

export const selectDeckById = (id: string) => (s: State) => s.decks.find((d) => d.id === id);

export const selectCardsByDeck = (deckId: string) => (s: State) =>
  s.cards.filter((c) => c.deckId === deckId);

export const selectDueCountByDeck = (now: Date = new Date()) => (s: State) => {
  const counts = new Map<string, number>();
  const n = now.getTime();
  for (const c of s.cards) {
    if (new Date(c.fsrs.due).getTime() <= n) {
      counts.set(c.deckId, (counts.get(c.deckId) ?? 0) + 1);
    }
  }
  return counts;
};
