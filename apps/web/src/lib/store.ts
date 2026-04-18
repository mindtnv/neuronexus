'use client';

import { create } from 'zustand';
import { countDueCardsByDeck, getDueCards } from './cards';
import { api, ok } from './api';
import { cardFromApi, deckFromApi, profileFromApi, reviewFromApi } from './mappers';
import type { Card, Deck, Profile, Rating, Review } from './types';

// Server-first store. Zustand holds a cached mirror of the user's decks, cards,
// and profile — fetched at bootstrap, mutated optimistically-ish on each API
// call. Dexie is gone: the server is the source of truth now.

interface State {
  bootstrapped: boolean;
  decks: Deck[];
  cards: Card[];
  profile: Profile | null;

  bootstrap: () => Promise<void>;
  reset: () => void;

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
    // Strip fields the server owns (fsrs, updatedAt) — only content mutates here.
    const body: any = {};
    if (patch.variant !== undefined) body.variant = patch.variant;
    if (patch.front !== undefined) body.front = patch.front;
    if (patch.back !== undefined) body.back = patch.back;
    if (patch.clozeText !== undefined) body.clozeText = patch.clozeText;
    if (patch.tags !== undefined) body.tags = patch.tags;
    const updated = cardFromApi(await ok(await (api as any).cards({ id }).patch(body)));
    set((s) => ({ cards: s.cards.map((c) => (c.id === id ? updated : c)) }));
  },

  async deleteCard(id) {
    await ok(await (api as any).cards({ id }).delete());
    set((s) => ({ cards: s.cards.filter((c) => c.id !== id) }));
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
        const dispatch = (detail: { kind: string; title: string; description?: string }) => {
          window.dispatchEvent(new CustomEvent('nn:toast', { detail }));
        };
        if (res.freezeUsed) {
          dispatch({
            kind: 'freeze',
            title: 'Стрик сохранён',
            description: 'Использована заморозка — serie continues.',
          });
        }
        if (res.dailyGoalJustMet) {
          dispatch({
            kind: 'dailyGoal',
            title: 'Дневная цель выполнена',
            description: 'Так держать — streak и XP дальше.',
          });
        }
        const newCodes: string[] = Array.isArray(res.newAchievements) ? res.newAchievements : [];
        if (newCodes.length > 0) {
          // Look up the catalog once so we can show human titles.
          let catalog: Record<string, { title: string; description: string }> = {};
          try {
            catalog = (await ok(await (api as any).achievements.catalog.get())) as Record<
              string,
              { title: string; description: string }
            >;
          } catch {
            catalog = {};
          }
          for (const code of newCodes) {
            const def = catalog[code];
            dispatch({
              kind: 'achievement',
              title: def?.title ?? code,
              description: def?.description,
            });
          }
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
