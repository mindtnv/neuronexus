'use client';

import { create } from 'zustand';
import { countDueCardsByDeck, getDueCards } from './cards';
import { api, ok } from './api';
import { cardFromApi, deckFromApi, profileFromApi, reviewFromApi } from './mappers';
import type { Card, Deck, Profile, Rating, Review } from './types';

// Server-first store. Zustand holds a cached mirror of the user's decks, cards,
// and profile — fetched at bootstrap, mutated optimistically-ish on each API
// call. Dexie is gone: the server is the source of truth now.

type BulkAction = 'move' | 'delete' | 'suspend' | 'unsuspend' | 'addTag' | 'removeTag';

interface State {
  bootstrapped: boolean;
  decks: Deck[];
  cards: Card[];
  profile: Profile | null;
  cardTags: string[];

  bootstrap: () => Promise<void>;
  reset: () => void;

  addDeck: (input: Omit<Deck, 'id' | 'createdAt'>) => Promise<Deck>;
  updateDeck: (id: string, patch: Partial<Omit<Deck, 'id' | 'createdAt'>>) => Promise<void>;
  deleteDeck: (id: string) => Promise<void>;

  addCard: (input: Omit<Card, 'id' | 'createdAt' | 'updatedAt' | 'fsrs' | 'suspended'>) => Promise<Card>;
  updateCard: (id: string, patch: Partial<Omit<Card, 'id' | 'createdAt'>>) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;

  /**
   * Search cards via the server (GET /cards/search). Maps rows via cardFromApi,
   * merges returned items into the mirror (dedupe by id), returns typed results.
   * Eden key is `query` — NOT `$query` (Architect must-fix #2).
   */
  searchCards: (
    q: string,
    opts?: { sort?: string; cursor?: string; limit?: string },
  ) => Promise<{ items: Card[]; nextCursor: string | null }>;

  /**
   * Bulk operation on a set of card ids (POST /cards/bulk). Applies the same
   * mutation to the in-memory mirror so the UI updates without a reload.
   */
  bulkCards: (
    action: BulkAction,
    cardIds: string[],
    payload?: { deckId?: string; tag?: string },
  ) => Promise<void>;

  /**
   * Fetch the distinct tag universe from the server (GET /cards/tags). Caches
   * the result in `cardTags` on the store. Call after tag bulk-ops to refresh.
   */
  getCardTags: () => Promise<string[]>;

  gradeCard: (cardId: string, rating: Rating, durationMs: number) => Promise<Review>;
  updateProfile: (patch: Partial<Omit<Profile, 'id'>>) => Promise<void>;
}

export const useNN = create<State>()((set, get) => ({
  bootstrapped: false,
  decks: [],
  cards: [],
  profile: null,
  cardTags: [],

  async bootstrap() {
    if (get().bootstrapped) return;
    // Parallel fetch of the user's snapshot. /cards is cursor-paginated;
    // bootstrap takes the first page (500 most recent cards). If the user has
    // more, we load on-demand later — all current UI fits in one page.
    const [profile, decks, cardsPage] = await Promise.all([
      ok(await (api as any).profile.get()),
      ok(await (api as any).decks.get()),
      ok(await (api as any).cards.get()),
    ]);
    const cardRows = Array.isArray(cardsPage)
      ? cardsPage
      : ((cardsPage as { items: unknown[] }).items ?? []);
    set({
      profile: profileFromApi(profile),
      decks: (decks as any[]).map(deckFromApi),
      cards: (cardRows as any[]).map(cardFromApi),
      bootstrapped: true,
    });
  },

  reset() {
    // Server is source of truth — blow away the local mirror and let bootstrap
    // repopulate on next mount.
    set({ decks: [], cards: [], profile: null, bootstrapped: false });
  },

  async addDeck(input) {
    const created = deckFromApi(
      await ok(
        await (api as any).decks.post({
          name: input.name,
          color: input.color,
          icon: input.icon,
          parentId: input.parentId,
        }),
      ),
    );
    set((s) => ({ decks: [...s.decks, created] }));
    return created;
  },

  async updateDeck(id, patch) {
    const updated = deckFromApi(await ok(await (api as any).decks({ id }).patch(patch)));
    set((s) => ({ decks: s.decks.map((d) => (d.id === id ? updated : d)) }));
  },

  async deleteDeck(id) {
    await ok(await (api as any).decks({ id }).delete());
    // Drop this deck + any local descendants + any cards under them. The server
    // cascades via FK ON DELETE CASCADE, we mirror that in the cache.
    const all = get().decks;
    const queue = [id];
    const removed = new Set<string>();
    while (queue.length) {
      const cur = queue.shift()!;
      if (removed.has(cur)) continue;
      removed.add(cur);
      for (const d of all) if (d.parentId === cur) queue.push(d.id);
    }
    set((s) => ({
      decks: s.decks.filter((d) => !removed.has(d.id)),
      cards: s.cards.filter((c) => !removed.has(c.deckId)),
    }));
  },

  async addCard(input) {
    const created = cardFromApi(
      await ok(
        await (api as any).cards.post({
          deckId: input.deckId,
          variant: input.variant,
          front: input.front,
          back: input.back,
          clozeText: input.clozeText,
          tags: input.tags,
        }),
      ),
    );
    set((s) => ({ cards: [...s.cards, created] }));
    return created;
  },

  async updateCard(id, patch) {
    // Strip fields the server owns (fsrs, updatedAt) — only content + placement
    // mutate here. `deckId` moves the card to another deck (server checks the
    // target deck belongs to the user).
    const body: any = {};
    if (patch.deckId !== undefined) body.deckId = patch.deckId;
    if (patch.variant !== undefined) body.variant = patch.variant;
    if (patch.front !== undefined) body.front = patch.front;
    if (patch.back !== undefined) body.back = patch.back;
    if (patch.clozeText !== undefined) body.clozeText = patch.clozeText;
    if (patch.tags !== undefined) body.tags = patch.tags;
    if (patch.suspended !== undefined) body.suspended = patch.suspended;
    const updated = cardFromApi(await ok(await (api as any).cards({ id }).patch(body)));
    set((s) => ({ cards: s.cards.map((c) => (c.id === id ? updated : c)) }));
  },

  async deleteCard(id) {
    await ok(await (api as any).cards({ id }).delete());
    set((s) => ({ cards: s.cards.filter((c) => c.id !== id) }));
  },

  async searchCards(q, opts) {
    const res: any = await ok(
      await (api as any).cards.search.get({
        query: {
          q,
          sort: opts?.sort,
          cursor: opts?.cursor,
          limit: opts?.limit,
        },
      }),
    );
    const items: Card[] = (res.items as any[]).map(cardFromApi);
    // Merge into mirror: update existing by id, append new.
    set((s) => {
      const byId = new Map(s.cards.map((c) => [c.id, c]));
      for (const c of items) byId.set(c.id, c);
      return { cards: [...byId.values()] };
    });
    return { items, nextCursor: res.nextCursor ?? null };
  },

  async bulkCards(action, cardIds, payload) {
    await ok(await (api as any).cards.bulk.post({ action, cardIds, payload }));
    // Mirror the same mutation locally so the UI reflects immediately.
    const idSet = new Set(cardIds);
    set((s) => {
      switch (action) {
        case 'move': {
          const deckId = payload?.deckId;
          if (!deckId) return s;
          return {
            cards: s.cards.map((c) => (idSet.has(c.id) ? { ...c, deckId } : c)),
          };
        }
        case 'delete':
          return { cards: s.cards.filter((c) => !idSet.has(c.id)) };
        case 'suspend':
          return {
            cards: s.cards.map((c) => (idSet.has(c.id) ? { ...c, suspended: true } : c)),
          };
        case 'unsuspend':
          return {
            cards: s.cards.map((c) => (idSet.has(c.id) ? { ...c, suspended: false } : c)),
          };
        case 'addTag': {
          const tag = payload?.tag;
          if (!tag) return s;
          return {
            cards: s.cards.map((c) =>
              idSet.has(c.id) && !c.tags.includes(tag)
                ? { ...c, tags: [...c.tags, tag] }
                : c,
            ),
          };
        }
        case 'removeTag': {
          const tag = payload?.tag;
          if (!tag) return s;
          return {
            cards: s.cards.map((c) =>
              idSet.has(c.id) ? { ...c, tags: c.tags.filter((t) => t !== tag) } : c,
            ),
          };
        }
      }
    });
  },

  async getCardTags() {
    const res: any = await ok(await (api as any).cards.tags.get());
    const tags: string[] = res.tags ?? [];
    set({ cardTags: tags });
    return tags;
  },

  async gradeCard(cardId, rating, durationMs) {
    const res: any = await ok(
      await (api as any).reviews.post({ cardId, rating, durationMs }),
    );
    const updatedCard = cardFromApi(res.card);
    const review = reviewFromApi(res.review);
    const nextProfile = res.profile ? profileFromApi(res.profile) : null;
    set((s) => ({
      cards: s.cards.map((c) => (c.id === cardId ? updatedCard : c)),
      profile: nextProfile ?? s.profile,
    }));

    // Fire gamification toasts. The server returns everything we need in the
    // grade response (newAchievements: string[], freezeUsed, dailyGoalJustMet)
    // — we just turn them into user-visible notifications without pulling in
    // an extra subscription layer.
    if (typeof window !== 'undefined') {
      // Defer a tick so React has committed the state update first.
      queueMicrotask(async () => {
        const dispatch = (detail: {
          kind: string;
          title?: string;
          description?: string;
          titleKey?: string;
          descriptionKey?: string;
        }) => {
          window.dispatchEvent(new CustomEvent('nn:toast', { detail }));
        };
        // Leech auto-suspend — surface it so the user knows the card left the queue.
        if (res.leeched) {
          dispatch({
            kind: 'leech',
            titleKey: 'toasts.leech.title',
            descriptionKey: 'toasts.leech.description',
          });
        }
        if (res.freezeUsed) {
          dispatch({
            kind: 'freeze',
            titleKey: 'toasts.freeze.title',
            descriptionKey: 'toasts.freeze.description',
          });
        }
        if (res.dailyGoalJustMet) {
          dispatch({
            kind: 'dailyGoal',
            titleKey: 'toasts.dailyGoal.title',
            descriptionKey: 'toasts.dailyGoal.description',
          });
        }
      });
    }

    return review;
  },

  async updateProfile(patch) {
    const body: any = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.dailyGoalMinutes !== undefined) body.dailyGoalMinutes = patch.dailyGoalMinutes;
    if (patch.desiredRetention !== undefined) body.desiredRetention = patch.desiredRetention;
    if (patch.plantStage !== undefined) body.plantStage = patch.plantStage;
    if (patch.plantSpecies !== undefined) body.plantSpecies = patch.plantSpecies;
    const next = profileFromApi(await ok(await (api as any).profile.patch(body)));
    set({ profile: next });
  },
}));

// Selectors (pure functions, used in components with `useNN(selector)`)
export const selectDueCards = (now: Date = new Date()) => (s: State) =>
  getDueCards(s.cards, now);

export const selectDeckById = (id: string) => (s: State) => s.decks.find((d) => d.id === id);

export const selectCardsByDeck = (deckId: string) => (s: State) =>
  s.cards.filter((c) => c.deckId === deckId);

export const selectDueCountByDeck = (now: Date = new Date()) => (s: State) =>
  countDueCardsByDeck(s.cards, now);
