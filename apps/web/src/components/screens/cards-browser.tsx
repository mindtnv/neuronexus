'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  buildCardPredicate,
  parseCardQuery,
  CardQueryError,
  stateLabel,
  stripCloze,
  type CardLike,
} from '@neuronexus/shared';
import { NNBtn, NNBadge, NNTag, NNIcon, NNSkeleton } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { CardsViewSwitcher } from '@/components/cards-view-switcher';
import { NNCardForm } from '@/components/card-form';
import { useNN } from '@/lib/store';
import type { Card } from '@/lib/types';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT, useDateLocale } from '@/lib/i18n';
import {
  buildDeckTree,
  deckPathLabel,
  flattenTree,
  getDescendantIds,
} from '@/lib/decks';
import { addOrReplaceToken, toggleToken } from '@/lib/card-query-ui';

const DEFAULT_CARDS_PAGE = 500;

// Sort keys map: UI column → server `sort` field (the part before the direction).
type SortField = 'created' | 'updated' | 'due' | 'lapses' | 'reps' | 'front';
type SortDir = 'asc' | 'desc';

interface ColumnDef {
  id: string;
  labelKey: string;
  sort?: SortField;
  align?: 'left' | 'right';
  /** Hidden on mobile when false. */
  mobile?: boolean;
  width: string;
}

const COLUMNS: ColumnDef[] = [
  { id: 'question', labelKey: 'cards.columns.question', sort: 'front', mobile: true, width: 'minmax(160px, 1.4fr)' },
  { id: 'answer', labelKey: 'cards.columns.answer', mobile: true, width: 'minmax(140px, 1.2fr)' },
  { id: 'deck', labelKey: 'cards.columns.deck', width: '140px' },
  { id: 'variant', labelKey: 'cards.columns.variant', width: '80px' },
  { id: 'state', labelKey: 'cards.columns.state', mobile: true, width: '90px' },
  { id: 'due', labelKey: 'cards.columns.due', sort: 'due', align: 'right', width: '90px' },
  { id: 'lapses', labelKey: 'cards.columns.lapses', sort: 'lapses', align: 'right', width: '70px' },
  { id: 'tags', labelKey: 'cards.columns.tags', width: '140px' },
  { id: 'created', labelKey: 'cards.columns.created', sort: 'created', align: 'right', width: '90px' },
  { id: 'edited', labelKey: 'cards.columns.edited', sort: 'updated', align: 'right', width: '90px' },
];

const STATE_CHIPS: { value: string; labelKey: string }[] = [
  { value: 'is:new', labelKey: 'cards.states.new' },
  { value: 'is:learn', labelKey: 'cards.states.learning' },
  { value: 'is:review', labelKey: 'cards.states.review' },
  { value: 'is:due', labelKey: 'cards.states.due' },
  { value: 'is:suspended', labelKey: 'cards.states.suspended' },
];

const variantTone: Record<Card['variant'], BadgeTone> = {
  basic: 'lime',
  cloze: 'violet',
  type: 'amber',
};

const stateTone: Record<string, BadgeTone> = {
  new: 'sky',
  learning: 'amber',
  review: 'lime',
  relearning: 'rose',
};

/** Build the structural CardLike the shared predicate operates over. */
function toCardLike(card: Card): CardLike {
  return {
    front: card.front,
    back: card.back,
    clozeText: card.clozeText ?? null,
    tags: card.tags,
    variant: card.variant,
    deckId: card.deckId,
    state: stateLabel(card.fsrs.state),
    suspended: card.suspended,
    due: new Date(card.fsrs.due).getTime(),
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    lapses: card.fsrs.lapses ?? 0,
    reps: card.fsrs.reps ?? 0,
    stability: card.fsrs.stability ?? 0,
    difficulty: card.fsrs.difficulty ?? 0,
    scheduledDays: card.fsrs.scheduled_days ?? 0,
  };
}

function truncate(s: string, n = 90): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > n ? `${clean.slice(0, n - 1)}…` : clean;
}

export const NNCardsBrowser = () => {
  const t = useT();
  const dateLocale = useDateLocale();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const router = useRouter();
  const searchParams = useSearchParams();

  const cards = useNN((s) => s.cards);
  const decks = useNN((s) => s.decks);
  const cardTags = useNN((s) => s.cardTags);
  const bootstrapped = useNN((s) => s.bootstrapped);
  const searchCards = useNN((s) => s.searchCards);
  const bulkCards = useNN((s) => s.bulkCards);
  const getCardTags = useNN((s) => s.getCardTags);

  // Query string: URL `?q=` is the source of truth, mirrored into local state
  // for instant typing (URL writes are debounced).
  const urlQ = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(urlQ);

  const [sortField, setSortField] = useState<SortField>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Hybrid completeness signal (must-fix #4): server results for the current `q`.
  const [serverResults, setServerResults] = useState<Card[] | null>(null);
  const [serverQ, setServerQ] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  // Honest pagination: the cursor for the NEXT server page (null = no more rows).
  const [serverCursor, setServerCursor] = useState<string | null>(null);
  // Surface transport failures instead of silently sitting on stale local rows.
  const [serverError, setServerError] = useState(false);

  // Selection (set of card ids) + the row anchor for shift-range select.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastClickedRef = useRef<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer

  const urlWriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch the distinct tag universe once on mount (C3 — not from the ≤500 mirror).
  useEffect(() => {
    void getCardTags();
  }, [getCardTags]);

  // Keep local query in sync when the URL changes externally (deck drill-in,
  // back/forward). Only adopt the URL value when it actually differs.
  useEffect(() => {
    setQuery((prev) => (prev === urlQ ? prev : urlQ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ]);

  // Resolve a deck NAME (or path) to its id + descendants for the predicate.
  const resolveDeckIds = useCallback(
    (value: string, nested: boolean): string[] => {
      const target = value.trim().toLowerCase();
      if (!target) return [];
      // Match by name OR by full path label (e.g. "Languages / French").
      const matches = decks.filter((d) => {
        if (d.name.toLowerCase() === target) return true;
        return deckPathLabel(decks, d.id).toLowerCase() === target;
      });
      const ids = new Set<string>();
      for (const d of matches) {
        ids.add(d.id);
        if (nested) for (const id of getDescendantIds(decks, d.id)) ids.add(id);
      }
      return [...ids];
    },
    [decks],
  );

  // Parse the query → predicate. CardQueryError surfaces as an inline hint.
  const { predicate, queryError } = useMemo(() => {
    try {
      const ast = parseCardQuery(query);
      return {
        predicate: buildCardPredicate(ast, { now: Date.now(), resolveDeckIds }),
        queryError: null as string | null,
      };
    } catch (err) {
      const msg = err instanceof CardQueryError ? err.message : String(err);
      // On error, match nothing — but keep the previous render stable-ish.
      return { predicate: () => true, queryError: msg };
    }
  }, [query, resolveDeckIds]);

  // Client-side filtered + sorted view over the mirror (instant type-ahead).
  const clientFiltered = useMemo(() => {
    if (queryError) return [] as Card[];
    const out = cards.filter((c) => predicate(toCardLike(c)));
    return sortCards(out, sortField, sortDir);
  }, [cards, predicate, queryError, sortField, sortDir]);

  // Provisional whenever the mirror is at cap OR no server fetch finished for q.
  const provisional =
    cards.length >= DEFAULT_CARDS_PAGE || serverQ !== query;

  // True when the displayed rows are the authoritative server result set for the
  // current query (vs the provisional client mirror).
  const serverActive = serverResults !== null && serverQ === query;

  // The list actually rendered: authoritative server results when available for
  // the current query, otherwise the instant client view.
  const rows = useMemo(() => {
    if (serverResults && serverQ === query) {
      return sortCards(serverResults, sortField, sortDir);
    }
    return clientFiltered;
  }, [serverResults, serverQ, query, clientFiltered, sortField, sortDir]);

  // More server pages exist beyond what's shown → render an honest "Load more"
  // and an "N+" count instead of silently capping at the page size.
  const hasMore = serverActive && serverCursor !== null;

  const sortStr = `${sortField} ${sortDir}`;

  const runServerSearch = useCallback(
    async (q: string) => {
      setSearching(true);
      setServerError(false);
      try {
        const { items, nextCursor } = await searchCards(q, { sort: sortStr });
        setServerResults(items);
        setServerQ(q);
        setServerCursor(nextCursor);
      } catch (err) {
        console.error('searchCards failed', err);
        setServerError(true);
      } finally {
        setSearching(false);
      }
    },
    [searchCards, sortStr],
  );

  // Honest "Load more": fetch the next page from the cursor and APPEND it to the
  // displayed server results (no silent truncation at the 500-row cap).
  const loadMore = useCallback(async () => {
    if (!serverCursor || serverQ === null) return;
    setSearching(true);
    setServerError(false);
    try {
      const { items, nextCursor } = await searchCards(serverQ, {
        sort: sortStr,
        cursor: serverCursor,
      });
      setServerResults((prev) => {
        const base = prev ?? [];
        const byId = new Map(base.map((c) => [c.id, c]));
        for (const c of items) byId.set(c.id, c);
        return [...byId.values()];
      });
      setServerCursor(nextCursor);
    } catch (err) {
      console.error('searchCards (load more) failed', err);
      setServerError(true);
    } finally {
      setSearching(false);
    }
  }, [searchCards, serverCursor, serverQ, sortStr]);

  // Auto-fire the debounced server search whenever results are provisional for
  // the current query (and the query is parseable).
  useEffect(() => {
    if (queryError) return;
    if (!provisional) return;
    if (serverTimer.current) clearTimeout(serverTimer.current);
    serverTimer.current = setTimeout(() => {
      void runServerSearch(query);
    }, 300);
    return () => {
      if (serverTimer.current) clearTimeout(serverTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, provisional, queryError, sortStr]);

  // Debounced write of the query into the URL (?q=).
  const writeUrl = useCallback(
    (q: string) => {
      if (urlWriteTimer.current) clearTimeout(urlWriteTimer.current);
      urlWriteTimer.current = setTimeout(() => {
        const params = new URLSearchParams(Array.from(searchParams.entries()));
        if (q) params.set('q', q);
        else params.delete('q');
        const qs = params.toString();
        router.replace(qs ? `/cards?${qs}` : '/cards');
      }, 250);
    },
    [router, searchParams],
  );

  const onQueryChange = (q: string) => {
    setQuery(q);
    // Reset server authority — results are provisional until the new fetch lands.
    setServerResults(null);
    setServerQ(null);
    setServerCursor(null);
    setServerError(false);
    writeUrl(q);
  };

  const onQueryEnter = () => {
    if (urlWriteTimer.current) clearTimeout(urlWriteTimer.current);
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (query) params.set('q', query);
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/cards?${qs}` : '/cards');
    if (!queryError) void runServerSearch(query);
  };

  // Sidebar token insertion.
  const applyToken = (key: string, value: string) => {
    onQueryChange(addOrReplaceToken(query, key, value));
    if (isMobile) setSidebarOpen(false);
  };
  const applyChip = (token: string) => {
    onQueryChange(toggleToken(query, token));
    if (isMobile) setSidebarOpen(false);
  };

  // Header click toggles sort (same column flips dir; new column resets to its
  // natural direction — text asc, everything else desc).
  const onSortClick = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'front' ? 'asc' : 'desc');
    }
    // A sort change invalidates server authority (server re-sorts too).
    setServerResults(null);
    setServerQ(null);
    setServerCursor(null);
    setServerError(false);
  };

  // Row selection with Ctrl/Shift modifiers.
  const onRowSelect = (id: string, e: React.MouseEvent) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && lastClickedRef.current) {
        const ids = rows.map((c) => c.id);
        const a = ids.indexOf(lastClickedRef.current);
        const b = ids.indexOf(id);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(ids[i]!);
        }
      } else if (e.metaKey || e.ctrlKey) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        next.clear();
        next.add(id);
      }
      return next;
    });
    lastClickedRef.current = id;
  };

  const toggleCheckbox = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastClickedRef.current = id;
  };

  // The single selected card drives the inline edit panel.
  const selectedIds = useMemo(() => [...selected], [selected]);
  const singleSelected = useMemo(
    () => (selectedIds.length === 1 ? cards.find((c) => c.id === selectedIds[0]) ?? null : null),
    [selectedIds, cards],
  );

  // prev/next walk the CURRENT filtered+sorted result list.
  const movePanel = (delta: 1 | -1) => {
    if (!singleSelected) return;
    const ids = rows.map((c) => c.id);
    const idx = ids.indexOf(singleSelected.id);
    if (idx === -1) return;
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= ids.length) return;
    const nextId = ids[nextIdx]!;
    setSelected(new Set([nextId]));
    lastClickedRef.current = nextId;
  };

  // Bulk actions.
  const runBulk = async (
    action: 'move' | 'delete' | 'suspend' | 'unsuspend' | 'addTag' | 'removeTag',
  ) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      if (action === 'delete') {
        if (typeof window !== 'undefined' && !window.confirm(t('cards.bulk.deleteConfirm', { n: ids.length }))) return;
        await bulkCards('delete', ids);
        setSelected(new Set());
      } else if (action === 'move') {
        const target = typeof window !== 'undefined' ? window.prompt(t('cards.bulk.movePrompt')) : null;
        const name = target?.trim();
        if (!name) return;
        const deck = decks.find(
          (d) =>
            d.name.toLowerCase() === name.toLowerCase() ||
            deckPathLabel(decks, d.id).toLowerCase() === name.toLowerCase(),
        );
        if (!deck) return;
        await bulkCards('move', ids, { deckId: deck.id });
      } else if (action === 'addTag' || action === 'removeTag') {
        const tag = typeof window !== 'undefined' ? window.prompt(t('cards.bulk.tagPrompt')) : null;
        const clean = tag?.trim();
        if (!clean) return;
        await bulkCards(action, ids, { tag: clean });
        await getCardTags();
      } else {
        await bulkCards(action, ids);
      }
      // Refresh server view so the table reflects the mutation authoritatively.
      if (!queryError && serverQ === query) void runServerSearch(query);
    } catch (err) {
      console.error('bulk action failed', err);
      setServerError(true);
    }
  };

  const fmtDate = (ms: number) => {
    if (!ms) return '—';
    const d = new Date(ms);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return format(d, sameYear ? 'MMM d' : 'MMM d, yyyy', { locale: dateLocale });
  };

  const visibleColumns = COLUMNS.filter((c) => !isMobile || c.mobile);
  const gridTemplate = `36px ${visibleColumns.map((c) => c.width).join(' ')}`;

  const loading = !bootstrapped;

  // ── render ──────────────────────────────────────────────────────────────────

  const sidebar = (
    <Sidebar
      decks={decks}
      tags={cardTags}
      onDeck={(name) => applyToken('deck', name)}
      onTag={(tag) => applyToken('tag', tag)}
      onChip={applyChip}
      onAll={() => onQueryChange('')}
      activeQuery={query}
    />
  );

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
      {/* Sidebar (desktop/tablet inline; mobile drawer) */}
      {!isMobile && (
        <aside
          style={{
            width: 220,
            flexShrink: 0,
            borderRight: '1px solid var(--border)',
            overflow: 'auto',
            background: 'var(--surface)',
          }}
        >
          {sidebar}
        </aside>
      )}

      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 40 }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: 260,
              background: 'var(--surface)',
              borderRight: '1px solid var(--border)',
              overflow: 'auto',
              zIndex: 41,
            }}
          >
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Query bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: isMobile ? '10px 12px' : '12px 16px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <CardsViewSwitcher />
          {isMobile && (
            <NNBtn size="sm" variant="soft" icon="filter" onClick={() => setSidebarOpen(true)} ariaLabel={t('cards.sidebar.decks')} />
          )}
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <NNIcon name="search" size={16} color="var(--text-dim)" />
            </span>
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onQueryEnter();
                }
              }}
              placeholder={t('cards.search.placeholder')}
              style={{
                width: '100%',
                padding: '9px 12px 9px 32px',
                borderRadius: 10,
                background: 'var(--surface)',
                border: `1px solid ${queryError ? 'var(--rose-400)' : 'var(--border)'}`,
                color: 'var(--text)',
                fontFamily: 'var(--font-sans)',
                fontSize: 13.5,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          {!isMobile && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }} className="mono">
              {t('cards.search.help')}
            </span>
          )}
        </div>

        {/* Status line: result count / provisional / error */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 16px',
            borderBottom: '1px solid var(--border)',
            fontSize: 11.5,
            color: 'var(--text-dim)',
            flexShrink: 0,
            minHeight: 30,
          }}
        >
          {queryError ? (
            <span style={{ color: 'var(--rose-400)' }}>{queryError}</span>
          ) : (
            <>
              <span>
                {hasMore
                  ? t('cards.search.resultCountMore', { n: rows.length })
                  : t('cards.search.resultCount', { n: rows.length })}
              </span>
              {searching && <span>{t('cards.search.searching')}</span>}
              {!searching && serverError && (
                <span style={{ color: 'var(--rose-400)' }}>{t('cards.search.serverError')}</span>
              )}
              {!searching && !serverError && provisional && (serverQ !== query) && (
                <NNBadge tone="amber" size="xs">{t('cards.search.localResults')}</NNBadge>
              )}
            </>
          )}
        </div>

        {/* Body: table + (optional) inline panel */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0, flexDirection: isMobile ? 'column' : 'row' }}>
          {/* Table */}
          <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
            {/* Header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: gridTemplate,
                gap: 8,
                padding: '8px 14px',
                borderBottom: '1px solid var(--border)',
                position: 'sticky',
                top: 0,
                background: 'var(--surface)',
                zIndex: 1,
                fontSize: 10.5,
                fontWeight: 600,
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              }}
            >
              <span />
              {visibleColumns.map((col) => {
                const active = col.sort && col.sort === sortField;
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => col.sort && onSortClick(col.sort)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      cursor: col.sort ? 'pointer' : 'default',
                      color: active ? 'var(--text)' : 'var(--text-dim)',
                      font: 'inherit',
                      textTransform: 'uppercase',
                      letterSpacing: 0.8,
                      textAlign: col.align ?? 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                      justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    {t(col.labelKey)}
                    {active && <span aria-hidden style={{ fontSize: 9 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                );
              })}
            </div>

            {/* Rows */}
            {loading ? (
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <NNSkeleton key={i} height={34} />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-dim)' }}>
                <div style={{ fontSize: 14, marginBottom: 8, color: 'var(--text-muted)' }}>{t('cards.empty.title')}</div>
                <div style={{ fontSize: 12 }}>{t('cards.empty.subtitle')}</div>
              </div>
            ) : (
              rows.map((card) => {
                const isSel = selected.has(card.id);
                const sLabel = stateLabel(card.fsrs.state);
                const q = stripCloze(card.front || card.clozeText || '', 'prompt');
                const a = stripCloze(card.back || card.clozeText || '', 'answer');
                return (
                  <div
                    key={card.id}
                    onClick={(e) => onRowSelect(card.id, e)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: gridTemplate,
                      gap: 8,
                      padding: '9px 14px',
                      borderBottom: '1px solid var(--border)',
                      alignItems: 'center',
                      cursor: 'pointer',
                      background: isSel ? 'var(--surface-3)' : 'transparent',
                      opacity: card.suspended ? 0.55 : 1,
                      fontSize: 12.5,
                    }}
                  >
                    <span onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleCheckbox(card.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </span>
                    {visibleColumns.map((col) => (
                      <span
                        key={col.id}
                        style={{
                          textAlign: col.align ?? 'left',
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: col.id === 'tags' ? 'normal' : 'nowrap',
                          color: 'var(--text)',
                        }}
                      >
                        {col.id === 'question' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {card.suspended && <NNBadge tone="rose" size="xs">{t('cards.states.suspended')}</NNBadge>}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{truncate(q)}</span>
                          </span>
                        )}
                        {col.id === 'answer' && <span style={{ color: 'var(--text-muted)' }}>{truncate(a)}</span>}
                        {col.id === 'deck' && (
                          <span style={{ color: 'var(--text-muted)' }}>{deckPathLabel(decks, card.deckId) || '—'}</span>
                        )}
                        {col.id === 'variant' && <NNBadge tone={variantTone[card.variant]} size="xs">{card.variant}</NNBadge>}
                        {col.id === 'state' && (
                          <NNBadge tone={stateTone[sLabel] ?? 'neutral'} size="xs">{t(`cards.states.${sLabel}`)}</NNBadge>
                        )}
                        {col.id === 'due' && <span className="mono" style={{ color: 'var(--text-muted)' }}>{fmtDate(new Date(card.fsrs.due).getTime())}</span>}
                        {col.id === 'lapses' && <span className="mono" style={{ color: card.fsrs.lapses ? 'var(--rose-400)' : 'var(--text-dim)' }}>{card.fsrs.lapses ?? 0}</span>}
                        {col.id === 'tags' && (
                          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                            {card.tags.length === 0
                              ? <span style={{ color: 'var(--text-dim)' }}>—</span>
                              : card.tags.slice(0, 3).map((tag, i) => <NNTag key={`${tag}-${i}`} color="sky">{tag}</NNTag>)}
                            {card.tags.length > 3 && <span style={{ color: 'var(--text-dim)' }}>+{card.tags.length - 3}</span>}
                          </span>
                        )}
                        {col.id === 'created' && <span className="mono" style={{ color: 'var(--text-muted)' }}>{fmtDate(card.createdAt)}</span>}
                        {col.id === 'edited' && <span className="mono" style={{ color: 'var(--text-muted)' }}>{fmtDate(card.updatedAt)}</span>}
                      </span>
                    ))}
                  </div>
                );
              })
            )}

            {/* Honest pagination: more server rows exist beyond this page. */}
            {hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 14px' }}>
                <NNBtn size="sm" variant="soft" onClick={() => void loadMore()} disabled={searching}>
                  {t('cards.search.loadMore')}
                </NNBtn>
              </div>
            )}
          </div>

          {/* Inline edit panel — single-row selection */}
          {singleSelected && (
            <div
              style={{
                width: isMobile ? '100%' : 420,
                flexShrink: 0,
                borderLeft: isMobile ? 'none' : '1px solid var(--border)',
                borderTop: isMobile ? '1px solid var(--border)' : 'none',
                background: 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                maxHeight: isMobile ? '50vh' : undefined,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--border)',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('cards.panel.editing')}</span>
                <div style={{ flex: 1 }} />
                <NNBtn size="sm" variant="ghost" icon="chevl" ariaLabel={t('cards.panel.prev')} onClick={() => movePanel(-1)} />
                <NNBtn size="sm" variant="ghost" icon="chevr" ariaLabel={t('cards.panel.next')} onClick={() => movePanel(1)} />
                <NNBtn size="sm" variant="ghost" icon="x" ariaLabel={t('cards.panel.close')} onClick={() => setSelected(new Set())} />
              </div>
              <div style={{ flex: 1, overflow: 'auto', display: 'flex' }}>
                <NNCardForm
                  key={singleSelected.id}
                  card={singleSelected}
                  showFsrsPanel={false}
                  onDeleted={() => setSelected(new Set())}
                />
              </div>
            </div>
          )}
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderTop: '1px solid var(--border)',
              background: 'var(--surface-2)',
              flexShrink: 0,
              flexWrap: 'wrap',
            }}
          >
            <NNBadge tone="lime" size="sm">{t('cards.bulk.selected', { n: selected.size })}</NNBadge>
            <div style={{ flex: 1 }} />
            <NNBtn size="sm" variant="soft" icon="stack" onClick={() => runBulk('move')}>{t('cards.bulk.move')}</NNBtn>
            <NNBtn size="sm" variant="soft" icon="tag" onClick={() => runBulk('addTag')}>{t('cards.bulk.addTag')}</NNBtn>
            <NNBtn size="sm" variant="soft" icon="x" onClick={() => runBulk('removeTag')}>{t('cards.bulk.removeTag')}</NNBtn>
            <NNBtn size="sm" variant="soft" icon="pause" onClick={() => runBulk('suspend')}>{t('cards.bulk.suspend')}</NNBtn>
            <NNBtn size="sm" variant="soft" icon="play" onClick={() => runBulk('unsuspend')}>{t('cards.bulk.unsuspend')}</NNBtn>
            <NNBtn size="sm" variant="danger" icon="x" onClick={() => runBulk('delete')}>{t('cards.bulk.delete')}</NNBtn>
            <NNBtn size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t('cards.bulk.clear')}</NNBtn>
          </div>
        )}
      </div>
    </div>
  );
};

// Sort helper shared by client + server-result views (server already sorts, but
// re-sorting client-side keeps the two paths visually identical).
function sortCards(list: Card[], field: SortField, dir: SortDir): Card[] {
  const mul = dir === 'asc' ? 1 : -1;
  const val = (c: Card): number | string => {
    switch (field) {
      case 'created':
        return c.createdAt;
      case 'updated':
        return c.updatedAt;
      case 'due':
        return new Date(c.fsrs.due).getTime();
      case 'lapses':
        return c.fsrs.lapses ?? 0;
      case 'reps':
        return c.fsrs.reps ?? 0;
      case 'front':
        return (c.front || c.clozeText || '').toLowerCase();
    }
  };
  return [...list].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va < vb) return -1 * mul;
    if (va > vb) return 1 * mul;
    // Tiebreak by id for a stable order (matches the server keyset tuple).
    return a.id < b.id ? -1 * mul : a.id > b.id ? 1 * mul : 0;
  });
}

// ── sidebar builder ───────────────────────────────────────────────────────────

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  padding: '14px 14px 6px',
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '6px 14px',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  textAlign: 'left',
  cursor: 'pointer',
};

const Sidebar = ({
  decks,
  tags,
  onDeck,
  onTag,
  onChip,
  onAll,
  activeQuery,
}: {
  decks: import('@/lib/types').Deck[];
  tags: string[];
  onDeck: (name: string) => void;
  onTag: (tag: string) => void;
  onChip: (token: string) => void;
  onAll: () => void;
  activeQuery: string;
}) => {
  const t = useT();
  const tree = useMemo(() => buildDeckTree(decks), [decks]);
  const rows = useMemo(
    () => flattenTree(tree, new Set(decks.map((d) => d.id))),
    [tree, decks],
  );

  return (
    <div style={{ paddingBottom: 16 }}>
      <button type="button" onClick={onAll} style={{ ...itemStyle, fontWeight: 600, color: 'var(--text)', paddingTop: 12 }}>
        <NNIcon name="stack" size={14} />
        <span>{t('cards.sidebar.allCards')}</span>
      </button>

      <div style={sectionLabelStyle}>{t('cards.sidebar.decks')}</div>
      {rows.map((node) => (
        <button
          key={node.deck.id}
          type="button"
          onClick={() => onDeck(node.deck.name)}
          style={{ ...itemStyle, paddingLeft: 14 + node.depth * 14 }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              flexShrink: 0,
              background: `var(--${node.deck.color === 'neutral' ? 'ink-500' : `${node.deck.color}-500`})`,
            }}
          />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.deck.name}</span>
        </button>
      ))}

      <div style={sectionLabelStyle}>{t('cards.sidebar.states')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 14px' }}>
        {STATE_CHIPS.map((chip) => {
          const active = activeQuery.split(/\s+/).includes(chip.value);
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => onChip(chip.value)}
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              <NNBadge tone={active ? 'lime' : 'neutral'} size="sm">{t(chip.labelKey)}</NNBadge>
            </button>
          );
        })}
      </div>

      <div style={sectionLabelStyle}>{t('cards.sidebar.tags')}</div>
      {tags.length === 0 ? (
        <div style={{ ...itemStyle, color: 'var(--text-dim)', cursor: 'default' }}>{t('cards.sidebar.noTags')}</div>
      ) : (
        tags.map((tag) => (
          <button key={tag} type="button" onClick={() => onTag(tag)} style={itemStyle}>
            <NNIcon name="tag" size={13} color="var(--sky-400)" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag}</span>
          </button>
        ))
      )}
    </div>
  );
};
