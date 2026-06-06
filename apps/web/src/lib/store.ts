'use client';

import { create } from 'zustand';
import { countDueCardsByDeck, getDueCards } from './cards';
import { api, ok } from './api';
import {
  cardFromApi,
  deckFromApi,
  filteredDeckFromApi,
  noteTypeFromApi,
  presetFromApi,
  profileFromApi,
  reviewFromApi,
} from './mappers';
import type { CardTemplate, FieldValues, NoteField, RenderKind } from '@neuronexus/shared';
import type { Card, Deck, DeckOptionsPreset, FilteredDeck, FilteredDeckSortOrder, NoteType, Profile, Rating, Review } from './types';

// Server-first store. Zustand holds a cached mirror of the user's decks, cards,
// and profile — fetched at bootstrap, mutated optimistically-ish on each API
// call. Dexie is gone: the server is the source of truth now.

type BulkAction = 'move' | 'delete' | 'suspend' | 'unsuspend' | 'addTag' | 'removeTag';

interface State {
  bootstrapped: boolean;
  decks: Deck[];
  cards: Card[];
  noteTypes: NoteType[];
  presets: DeckOptionsPreset[];
  filteredDecks: FilteredDeck[];
  profile: Profile | null;
  cardTags: string[];

  bootstrap: () => Promise<void>;
  reset: () => void;

  addDeck: (input: Omit<Deck, 'id' | 'createdAt'>) => Promise<Deck>;
  updateDeck: (id: string, patch: Partial<Omit<Deck, 'id' | 'createdAt'>>) => Promise<void>;
  deleteDeck: (id: string) => Promise<void>;

  /**
   * Create a note (POST /notes). The server generates one-or-more cards from
   * the note-type's templates; the response carries the note + the enriched
   * cards which we merge into the mirror. Returns the generated cards.
   */
  addNote: (input: {
    noteTypeId: string;
    deckId: string;
    fieldValues: FieldValues;
    tags: string[];
  }) => Promise<Card[]>;

  /**
   * Update a note (PATCH /notes/:id). The server re-generates cards (FSRS
   * preserved on surviving template ords) and returns the note + cards; we
   * replace this note's cards in the mirror.
   */
  updateNote: (
    noteId: string,
    patch: { fieldValues?: FieldValues; tags?: string[] },
  ) => Promise<Card[]>;

  /** Delete a note (DELETE /notes/:id). Cascades its cards via FK; mirror drops them. */
  deleteNote: (noteId: string) => Promise<void>;

  /** Delete a single card (DELETE /cards/:id). Card-level delete still exists. */
  deleteCard: (id: string) => Promise<void>;

  /** Fetch own + builtin note-types (GET /note-types) into the store. */
  getNoteTypes: () => Promise<NoteType[]>;

  /** Create a user-owned note-type (POST /note-types). Appends to the mirror. */
  addNoteType: (def: {
    name: string;
    fields: NoteField[];
    templates: CardTemplate[];
    styling?: string;
    kind?: RenderKind;
  }) => Promise<NoteType>;

  /**
   * Edit a note-type (PATCH /note-types/:id). CLONE-ON-EDIT: editing a global
   * builtin makes the server return a NEW user-owned copy with a DIFFERENT id —
   * we append the clone (the builtin stays in the list) and return it. Editing
   * an owned type returns the same id and we replace it in the mirror.
   */
  updateNoteType: (
    id: string,
    patch: {
      name?: string;
      fields?: NoteField[];
      templates?: CardTemplate[];
      styling?: string;
      kind?: RenderKind;
    },
  ) => Promise<NoteType>;

  /** Delete an own note-type (DELETE /note-types/:id). Cascades notes+cards. */
  deleteNoteType: (id: string) => Promise<void>;

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

  gradeCard: (cardId: string, rating: Rating, durationMs: number, source?: 'regular' | 'filtered') => Promise<Review>;
  updateProfile: (patch: Partial<Omit<Profile, 'id'>>) => Promise<void>;

  /** Create a preset (POST /deck-options). Appends to the mirror. */
  addPreset: (input: {
    name: string;
    newPerDay: number;
    reviewsPerDay: number;
    learningSteps: string[];
    relearningSteps: string[];
    desiredRetention?: number | null;
    leechThreshold: number;
    maximumInterval: number;
  }) => Promise<DeckOptionsPreset>;

  /** Update a preset (PATCH /deck-options/:id). Replaces in the mirror. */
  updatePreset: (
    id: string,
    patch: Partial<{
      name: string;
      newPerDay: number;
      reviewsPerDay: number;
      learningSteps: string[];
      relearningSteps: string[];
      desiredRetention: number | null;
      leechThreshold: number;
      maximumInterval: number;
    }>,
  ) => Promise<DeckOptionsPreset>;

  /**
   * Delete a preset (DELETE /deck-options/:id). Returns the count of decks
   * whose presetId was SET NULL by the server (they revert to defaults).
   */
  deletePreset: (id: string) => Promise<{ affectedDecks: number }>;

  /**
   * Bind (or unbind) a preset to a deck (PATCH /decks/:id { presetId }).
   * Pass null to unbind (revert to defaults).
   */
  bindDeckPreset: (deckId: string, presetId: string | null) => Promise<void>;

  /** Create a filtered deck (POST /filtered-decks). Appends to the mirror. */
  addFilteredDeck: (input: {
    name: string;
    query: string;
    sortOrder: FilteredDeckSortOrder;
    cardLimit: number;
    includeSuspended: boolean;
  }) => Promise<FilteredDeck>;

  /** Update a filtered deck (PATCH /filtered-decks/:id). Replaces in the mirror. */
  updateFilteredDeck: (
    id: string,
    patch: Partial<{
      name: string;
      query: string;
      sortOrder: FilteredDeckSortOrder;
      cardLimit: number;
      includeSuspended: boolean;
    }>,
  ) => Promise<FilteredDeck>;

  /** Delete a filtered deck (DELETE /filtered-decks/:id). Removes from mirror. */
  deleteFilteredDeck: (id: string) => Promise<void>;

  /**
   * Upload an image to S3 (M2 Phase 4). Three-step (plan Decision A1): presign →
   * direct multipart POST to S3 (bytes never touch Bun) → finalize. Returns the
   * relative media token `/m/{uuid}` to embed as `<img src=…>` (the only img-src
   * shape the dual-edge sanitizer keeps) plus the media id.
   */
  uploadMedia: (file: File) => Promise<{ token: string; mediaId: string }>;
}

export const useNN = create<State>()((set, get) => ({
  bootstrapped: false,
  decks: [],
  cards: [],
  noteTypes: [],
  presets: [],
  filteredDecks: [],
  profile: null,
  cardTags: [],

  async bootstrap() {
    if (get().bootstrapped) return;
    // Parallel fetch of the user's snapshot. /cards is cursor-paginated;
    // bootstrap takes the first page (500 most recent cards). If the user has
    // more, we load on-demand later — all current UI fits in one page. Note-
    // types (own + global builtins) load too so the note editor can pick one.
    // Presets (deck-options) are also fetched here so the settings editor and
    // per-deck binding are immediately available.
    const [profile, decks, cardsPage, noteTypes, presetsRes, filteredDecksRes] = await Promise.all([
      ok(await (api as any).profile.get()),
      ok(await (api as any).decks.get()),
      ok(await (api as any).cards.get()),
      ok(await (api as any)['note-types'].get()),
      ok(await (api as any)['deck-options'].get()),
      ok(await (api as any)['filtered-decks'].get()),
    ]);
    const cardRows = Array.isArray(cardsPage)
      ? cardsPage
      : ((cardsPage as { items: unknown[] }).items ?? []);
    set({
      profile: profileFromApi(profile),
      decks: (decks as any[]).map(deckFromApi),
      cards: (cardRows as any[]).map(cardFromApi),
      noteTypes: (noteTypes as any[]).map(noteTypeFromApi),
      presets: (presetsRes as any[]).map(presetFromApi),
      filteredDecks: (filteredDecksRes as any[]).map(filteredDeckFromApi),
      bootstrapped: true,
    });
  },

  reset() {
    // Server is source of truth — blow away the local mirror and let bootstrap
    // repopulate on next mount.
    set({ decks: [], cards: [], noteTypes: [], presets: [], filteredDecks: [], profile: null, bootstrapped: false });
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

  async addNote(input) {
    // POST /notes → server generates cards from the note-type templates and
    // returns the enriched cards (each carrying its embedded note + noteType).
    const res: any = await ok(
      await (api as any).notes.post({
        noteTypeId: input.noteTypeId,
        deckId: input.deckId,
        fieldValues: input.fieldValues,
        tags: input.tags,
      }),
    );
    const created: Card[] = ((res.cards ?? []) as any[]).map(cardFromApi);
    set((s) => ({ cards: [...s.cards, ...created] }));
    return created;
  },

  async updateNote(noteId, patch) {
    const body: any = {};
    if (patch.fieldValues !== undefined) body.fieldValues = patch.fieldValues;
    if (patch.tags !== undefined) body.tags = patch.tags;
    const res: any = await ok(await (api as any).notes({ id: noteId }).patch(body));
    const updated: Card[] = ((res.cards ?? []) as any[]).map(cardFromApi);
    // Replace this note's cards in the mirror (regeneration may add/remove).
    set((s) => {
      const kept = s.cards.filter((c) => c.noteId !== noteId);
      return { cards: [...kept, ...updated] };
    });
    return updated;
  },

  async deleteNote(noteId) {
    await ok(await (api as any).notes({ id: noteId }).delete());
    set((s) => ({ cards: s.cards.filter((c) => c.noteId !== noteId) }));
  },

  async deleteCard(id) {
    await ok(await (api as any).cards({ id }).delete());
    set((s) => ({ cards: s.cards.filter((c) => c.id !== id) }));
  },

  async getNoteTypes() {
    const rows: any = await ok(await (api as any)['note-types'].get());
    const list: NoteType[] = (rows as any[]).map(noteTypeFromApi);
    set({ noteTypes: list });
    return list;
  },

  async addNoteType(def) {
    const created = noteTypeFromApi(
      await ok(
        await (api as any)['note-types'].post({
          name: def.name,
          fields: def.fields,
          templates: def.templates,
          styling: def.styling ?? '',
          kind: def.kind ?? 'custom',
        }),
      ),
    );
    set((s) => ({ noteTypes: [...s.noteTypes, created] }));
    return created;
  },

  async updateNoteType(id, patch) {
    const body: any = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.fields !== undefined) body.fields = patch.fields;
    if (patch.templates !== undefined) body.templates = patch.templates;
    if (patch.styling !== undefined) body.styling = patch.styling;
    if (patch.kind !== undefined) body.kind = patch.kind;
    const updated = noteTypeFromApi(
      await ok(await (api as any)['note-types']({ id }).patch(body)),
    );
    // Clone-on-edit: editing a global builtin returns a NEW id (a user-owned
    // copy). The original builtin stays in the list; we append the clone.
    // Editing an owned type returns the same id and we replace it in place.
    set((s) => {
      const exists = s.noteTypes.some((nt) => nt.id === updated.id);
      return {
        noteTypes: exists
          ? s.noteTypes.map((nt) => (nt.id === updated.id ? updated : nt))
          : [...s.noteTypes, updated],
      };
    });
    return updated;
  },

  async deleteNoteType(id) {
    await ok(await (api as any)['note-types']({ id }).delete());
    set((s) => ({ noteTypes: s.noteTypes.filter((nt) => nt.id !== id) }));
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
    // Tags are NOTE-level: the server mutates notes.tags for the notes of the
    // selected cards, so the mirror must update EVERY card sharing one of those
    // notes (multi-template siblings), not just the selected card ids.
    const noteIdSet = new Set(
      get().cards.filter((c) => idSet.has(c.id)).map((c) => c.noteId),
    );
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
              noteIdSet.has(c.noteId) && !c.tags.includes(tag)
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
              noteIdSet.has(c.noteId) ? { ...c, tags: c.tags.filter((t) => t !== tag) } : c,
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

  async gradeCard(cardId, rating, durationMs, source) {
    const body: Record<string, unknown> = { cardId, rating, durationMs };
    if (source) body.source = source;
    const res: any = await ok(
      await (api as any).reviews.post(body),
    );
    const updatedCard = cardFromApi(res.card);
    const review = reviewFromApi(res.review);
    const nextProfile = res.profile ? profileFromApi(res.profile) : null;
    set((s) => ({
      cards: s.cards.map((c) => (c.id === cardId ? updatedCard : c)),
      profile: nextProfile ?? s.profile,
    }));

    // Fire gamification toasts. The server returns everything we need in the
    // grade response (freezeUsed, dailyGoalJustMet) — we just turn them into
    // user-visible notifications without pulling in an extra subscription layer.
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

  async addPreset(input) {
    const created = presetFromApi(
      await ok(
        await (api as any)['deck-options'].post({
          name: input.name,
          newPerDay: input.newPerDay,
          reviewsPerDay: input.reviewsPerDay,
          learningSteps: input.learningSteps,
          relearningSteps: input.relearningSteps,
          desiredRetention: input.desiredRetention ?? null,
          leechThreshold: input.leechThreshold,
          maximumInterval: input.maximumInterval,
        }),
      ),
    );
    set((s) => ({ presets: [...s.presets, created] }));
    return created;
  },

  async updatePreset(id, patch) {
    const body: any = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.newPerDay !== undefined) body.newPerDay = patch.newPerDay;
    if (patch.reviewsPerDay !== undefined) body.reviewsPerDay = patch.reviewsPerDay;
    if (patch.learningSteps !== undefined) body.learningSteps = patch.learningSteps;
    if (patch.relearningSteps !== undefined) body.relearningSteps = patch.relearningSteps;
    if ('desiredRetention' in patch) body.desiredRetention = patch.desiredRetention ?? null;
    if (patch.leechThreshold !== undefined) body.leechThreshold = patch.leechThreshold;
    if (patch.maximumInterval !== undefined) body.maximumInterval = patch.maximumInterval;
    const updated = presetFromApi(
      await ok(await (api as any)['deck-options']({ id }).patch(body)),
    );
    set((s) => ({ presets: s.presets.map((p) => (p.id === id ? updated : p)) }));
    return updated;
  },

  async deletePreset(id) {
    const res: any = await ok(await (api as any)['deck-options']({ id }).delete());
    const affectedDecks: number = res.affectedDecks ?? 0;
    set((s) => ({
      presets: s.presets.filter((p) => p.id !== id),
      // Mirror the SET NULL that the server applied to bound decks.
      decks: s.decks.map((d) => (d.presetId === id ? { ...d, presetId: null } : d)),
    }));
    return { affectedDecks };
  },

  async bindDeckPreset(deckId, presetId) {
    const updated = deckFromApi(
      await ok(await (api as any).decks({ id: deckId }).patch({ presetId })),
    );
    set((s) => ({ decks: s.decks.map((d) => (d.id === deckId ? updated : d)) }));
  },

  async addFilteredDeck(input) {
    const created = filteredDeckFromApi(
      await ok(
        await (api as any)['filtered-decks'].post({
          name: input.name,
          query: input.query,
          sortOrder: input.sortOrder,
          cardLimit: input.cardLimit,
          includeSuspended: input.includeSuspended,
        }),
      ),
    );
    set((s) => ({ filteredDecks: [...s.filteredDecks, created] }));
    return created;
  },

  async updateFilteredDeck(id, patch) {
    const body: any = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.query !== undefined) body.query = patch.query;
    if (patch.sortOrder !== undefined) body.sortOrder = patch.sortOrder;
    if (patch.cardLimit !== undefined) body.cardLimit = patch.cardLimit;
    if (patch.includeSuspended !== undefined) body.includeSuspended = patch.includeSuspended;
    const updated = filteredDeckFromApi(
      await ok(await (api as any)['filtered-decks']({ id }).patch(body)),
    );
    set((s) => ({
      filteredDecks: s.filteredDecks.map((fd) => (fd.id === id ? updated : fd)),
    }));
    return updated;
  },

  async deleteFilteredDeck(id) {
    await ok(await (api as any)['filtered-decks']({ id }).delete());
    set((s) => ({ filteredDecks: s.filteredDecks.filter((fd) => fd.id !== id) }));
  },

  async uploadMedia(file) {
    // 1. Presign: server validates {mime,size}, mints a uuid, returns the POST
    //    policy (url + fields) + the relative token. NO DB row yet.
    const presign: any = await ok(
      await (api as any).media.presign.post({ mime: file.type, size: file.size }),
    );

    // 2. Direct multipart POST to S3/MinIO — a RAW cross-origin fetch, NOT Eden
    //    (the bytes must bypass Bun, plan A1). The policy fields go first, then
    //    Content-Type (signed in the policy), then the file LAST per S3's rules.
    const fd = new FormData();
    for (const [k, v] of Object.entries(presign.upload.fields as Record<string, string>)) {
      fd.append(k, v);
    }
    fd.set('Content-Type', file.type);
    fd.append('file', file);
    const res = await fetch(presign.upload.url, { method: 'POST', body: fd });
    if (!res.ok) {
      throw new Error(`upload failed (${res.status})`);
    }

    // 3. Finalize: server HEADs the object for real size + ranged-GET magic-byte
    //    sniff, then inserts the media row (deletes + 400 on mismatch).
    await ok(await (api as any).media({ id: presign.mediaId }).finalize.post());

    return { token: presign.token as string, mediaId: presign.mediaId as string };
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
