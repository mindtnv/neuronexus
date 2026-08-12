'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { NNIcon, NNKbd } from '@/components/ui';
import { AppLink } from '@/components/navigation';
import { useNN } from '@/lib/store';
import { useBreakpoint } from '@/lib/use-breakpoint';
import type { Card, Deck, DeckColor, LibraryItem, Notebook } from '@/lib/types';
import { useT } from '@/lib/i18n';

// NeuroNexus — Command Palette (⌘K)
// Full overlay with search, grouped results, quick actions

type CmdItem = {
  group: string;
  id: string;
  icon: string;
  label: string;
  sub: string | null;
  kbd?: string[];
  tag?: string;
  href?: string;
};

type StaticBuilder = (t: (k: string, p?: Record<string, string | number>) => string) => CmdItem[];
const buildStaticCmdData: StaticBuilder = (t) => {
  const GRP_QUICK = t('overlays.palette.groups.quickActions');
  const GRP_NAV = t('overlays.palette.groups.navigate');
  // Only list actions that land the user on a real, working screen.
  // Keyboard G-chord bindings aren't wired to a global listener either,
  // so `kbd` shows reference only for the two shortcuts the palette itself
  // handles via input focus.
  return [
    { group: GRP_QUICK, id: 'review-now', icon: 'bolt',  label: t('overlays.palette.quick.reviewNow.label'), sub: t('overlays.palette.quick.reviewNow.sub'), kbd: [], href: '/review' },
    { group: GRP_QUICK, id: 'new-card',   icon: 'plus',  label: t('overlays.palette.quick.newCard.label'),   sub: t('overlays.palette.quick.newCard.sub'),   kbd: [], href: '/editor' },
    { group: GRP_QUICK, id: 'new-deck',   icon: 'stack', label: t('overlays.palette.quick.newDeck.label'),   sub: null, kbd: [], href: '/decks' },
    { group: GRP_NAV,   id: 'nav-home',      icon: 'home',     label: t('overlays.palette.quick.goHome'),      sub: null, kbd: [], href: '/' },
    { group: GRP_NAV,   id: 'nav-review',    icon: 'bolt',     label: t('overlays.palette.quick.goReview'),    sub: null, kbd: [], href: '/review' },
    { group: GRP_NAV,   id: 'nav-graph',     icon: 'graph',    label: t('overlays.palette.quick.goGraph'),     sub: null, kbd: [], href: '/graph' },
    { group: GRP_NAV,   id: 'nav-decks',     icon: 'stack',    label: t('overlays.palette.quick.goDecks'),     sub: null, kbd: [], href: '/decks' },
    { group: GRP_NAV,   id: 'nav-library',   icon: 'book',     label: t('overlays.palette.quick.goLibrary'),   sub: null, kbd: [], href: '/library' },
    { group: GRP_NAV,   id: 'nav-notebooks', icon: 'doc',      label: t('overlays.palette.quick.goNotebooks'), sub: null, kbd: [], href: '/notebooks' },
    { group: GRP_NAV,   id: 'nav-chat',      icon: 'sparkle',  label: t('overlays.palette.quick.goChat'),      sub: null, kbd: [], href: '/chat' },
    { group: GRP_NAV,   id: 'nav-garden',    icon: 'garden',   label: t('overlays.palette.quick.goGarden'),    sub: null, kbd: [], href: '/garden' },
    { group: GRP_NAV,   id: 'nav-note-types',icon: 'grid',     label: t('overlays.palette.quick.goNoteTypes'), sub: null, kbd: [], href: '/note-types' },
    { group: GRP_NAV,   id: 'nav-stats',     icon: 'target',   label: t('overlays.palette.quick.goStats'),     sub: null, kbd: [], href: '/stats' },
    { group: GRP_NAV,   id: 'nav-settings',  icon: 'settings', label: t('overlays.palette.quick.goSettings'),  sub: null, kbd: [], href: '/settings' },
  ];
};

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  amber:  { bg: 'var(--tone-amber-bg)',  color: 'var(--amber-400)' },
  violet: { bg: 'var(--tone-violet-bg)', color: 'var(--violet-400)' },
  sky:    { bg: 'var(--tone-sky-bg)',  color: 'var(--sky-400)' },
  rose:   { bg: 'var(--tone-rose-bg)', color: 'var(--rose-400)' },
};

const DECK_TAG: Record<DeckColor, string> = {
  lime:    'sky',
  amber:   'amber',
  violet:  'violet',
  sky:     'sky',
  rose:    'rose',
  neutral: 'sky',
};

function matches(q: string, ...fields: Array<string | null | undefined>) {
  if (!q) return true;
  return fields.some((f) => f && f.toLowerCase().includes(q));
}

export const CommandPalette = ({ defaultQuery = '', onClose }: { defaultQuery?: string; onClose?: () => void }) => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const isDesktop = bp === 'desktop';
  const [query, setQuery] = useState(defaultQuery);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const decks = useNN((s) => s.decks);
  const cards = useNN((s) => s.cards);
  const listLibrary = useNN((s) => s.listLibrary);
  const listNotebooks = useNN((s) => s.listNotebooks);

  // Knowledge-domain search data (P3.2). Notebooks load once on open + filter
  // client-side (small list); library sources are fetched server-side with a
  // debounced `q` (reuses the same idiom as the card debounce reset below).
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [sources, setSources] = useState<LibraryItem[]>([]);

  const STATIC_CMD_DATA = useMemo(() => buildStaticCmdData(t), [t]);
  const GROUP_ORDER = useMemo(() => [
    t('overlays.palette.groups.quickActions'),
    t('overlays.palette.groups.cards'),
    t('overlays.palette.groups.decks'),
    t('overlays.palette.groups.sources'),
    t('overlays.palette.groups.notebooks'),
    t('overlays.palette.groups.graph'),
    t('overlays.palette.groups.navigate'),
  ], [t]);
  const groupCards = t('overlays.palette.groups.cards');
  const groupDecks = t('overlays.palette.groups.decks');
  const groupSources = t('overlays.palette.groups.sources');
  const groupNotebooks = t('overlays.palette.groups.notebooks');

  // Load notebooks once when the palette opens (graceful: empty on failure).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nbs = await listNotebooks();
        if (!cancelled) setNotebooks(nbs);
      } catch {
        if (!cancelled) setNotebooks([]);
      }
    })();
    return () => { cancelled = true; };
  }, [listNotebooks]);

  // Debounced library source search (server-side `q`). Empty query → show the
  // most recent items; any error degrades silently to no source rows.
  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    const id = setTimeout(() => {
      void (async () => {
        try {
          const res = await listLibrary(q ? { q, limit: 6 } : { limit: 6 });
          if (!cancelled) setSources(res.items);
        } catch {
          if (!cancelled) setSources([]);
        }
      })();
    }, 180);
    return () => { cancelled = true; clearTimeout(id); };
  }, [query, listLibrary]);

  // Filter + group
  const filtered = useMemo<Record<string, CmdItem[]>>(() => {
    const q = query.toLowerCase().trim();
    const deckById = new Map<string, Deck>(decks.map((d) => [d.id, d]));

    // Build dynamic items from store data
    const cardItems: CmdItem[] = cards
      .filter((c: Card) => {
        const deck = deckById.get(c.deckId);
        return matches(q, c.renderFrontText, c.renderBackText, deck?.name, ...(c.tags ?? []));
      })
      .slice(0, 24)
      .map((c: Card) => {
        const deck = deckById.get(c.deckId);
        const tag = deck ? DECK_TAG[deck.color] : undefined;
        const front = c.renderFrontText.trim() || t('overlays.palette.untitledCard');
        return {
          group: groupCards,
          id: `card-${c.id}`,
          icon: 'edit',
          label: front.length > 72 ? front.slice(0, 72) + '…' : front,
          sub: deck ? deck.name : t('overlays.palette.cardItemSub'),
          tag,
          href: `/editor?card=${c.id}`,
        } satisfies CmdItem;
      });

    const deckItems: CmdItem[] = decks
      .filter((d: Deck) => matches(q, d.name))
      .slice(0, 24)
      .map((d: Deck) => {
        const due = cards.filter((c) => c.deckId === d.id).length;
        return {
          group: groupDecks,
          id: `deck-${d.id}`,
          icon: 'stack',
          label: d.name,
          sub: due === 1 ? t('overlays.palette.deckItemSub', { n: due }) : t('overlays.palette.deckItemSubPlural', { n: due }),
          tag: DECK_TAG[d.color],
          href: `/decks`,
        } satisfies CmdItem;
      });

    // Library sources are already query-filtered server-side; client-filter is a
    // cheap belt-and-suspenders so a stale debounce frame doesn't show non-matches.
    const sourceItems: CmdItem[] = sources
      .filter((s) => matches(q, s.title, s.author))
      .slice(0, 6)
      .map((s) => ({
        group: groupSources,
        id: `source-${s.id}`,
        icon: 'book',
        label: s.title.trim() || t('overlays.palette.untitledCard'),
        sub: t('overlays.palette.sourceItemSub', { kind: s.kind.toUpperCase() }),
        href: `/library/${s.id}`,
      } satisfies CmdItem));

    const notebookItems: CmdItem[] = notebooks
      .filter((n) => matches(q, n.title))
      .slice(0, 6)
      .map((n) => ({
        group: groupNotebooks,
        id: `notebook-${n.id}`,
        icon: 'doc',
        label: n.title.trim() || t('overlays.palette.untitledCard'),
        sub: t('overlays.palette.notebookItemSub'),
        href: `/notebooks/${n.id}`,
      } satisfies CmdItem));

    const staticItems = STATIC_CMD_DATA.filter((d) =>
      matches(q, d.label, d.sub, d.group),
    );

    const everything: CmdItem[] = [...staticItems, ...cardItems, ...deckItems, ...sourceItems, ...notebookItems];

    // Group
    const groups: Record<string, CmdItem[]> = {};
    everything.forEach((item) => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    });

    // Cap each group to top 6 matches
    for (const key of Object.keys(groups)) {
      groups[key] = groups[key].slice(0, 6);
    }

    // Return groups in a stable order
    const ordered: Record<string, CmdItem[]> = {};
    for (const key of GROUP_ORDER) {
      if (groups[key] && groups[key].length) ordered[key] = groups[key];
    }
    for (const key of Object.keys(groups)) {
      if (!(key in ordered) && groups[key].length) ordered[key] = groups[key];
    }
    return ordered;
  }, [query, cards, decks, sources, notebooks, STATIC_CMD_DATA, GROUP_ORDER, groupCards, groupDecks, groupSources, groupNotebooks, t]);

  const flatItems = useMemo(() => Object.values(filtered).flat(), [filtered]);

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'ArrowDown') setActive(a => Math.min(a + 1, flatItems.length - 1));
      if (e.key === 'ArrowUp')   setActive(a => Math.max(a - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [flatItems.length, onClose]);

  // Scroll active into view
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let runningIdx = 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'var(--scrim)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: isMobile ? 40 : 100,
      paddingLeft: isMobile ? '2vw' : 0,
      paddingRight: isMobile ? '2vw' : 0,
    }} onClick={() => onClose?.()}>
      <div onClick={e => e.stopPropagation()} style={{
        width: isMobile ? '96vw' : 620,
        maxWidth: '100%',
        maxHeight: isMobile ? '80vh' : 520,
        background: 'var(--surface)',
        border: '1px solid var(--border-2)',
        borderRadius: 18,
        boxShadow: '0 32px 80px var(--scrim-strong), 0 0 0 1px var(--hairline-contrast)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
        }}>
          <NNIcon name="search" size={18} color="var(--text-muted)"/>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={isMobile ? t('overlays.palette.searchPlaceholderMobile') : t('overlays.palette.searchPlaceholder')}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontSize: isMobile ? 14 : 15, color: 'var(--text)', fontFamily: 'var(--font-sans)',
              caretColor: 'var(--accent-400)',
              minWidth: 0,
            }}
          />
          {query && (
            <span onClick={() => setQuery('')} style={{ cursor: 'pointer', color: 'var(--text-dim)', lineHeight: 1 }}>
              <NNIcon name="x" size={14}/>
            </span>
          )}
          <NNKbd>esc</NNKbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: 'auto', flex: 1, padding: '6px 0 8px' }} className="nn-scroll">
          {Object.entries(filtered).map(([groupName, items]) => (
            <div key={groupName}>
              <div style={{
                padding: '8px 18px 4px',
                fontSize: 10.5, fontWeight: 600, letterSpacing: 0.8,
                textTransform: 'uppercase', color: 'var(--text-dim)',
              }}>{groupName}</div>
              {items.map(item => {
                const idx = runningIdx++;
                const isActive = idx === active;
                const row = (
                  <div
                    data-active={isActive}
                    style={{
                      margin: '1px 6px',
                      padding: '9px 12px',
                      borderRadius: 10,
                      display: 'flex', alignItems: 'center', gap: 10,
                      cursor: 'pointer',
                      background: isActive ? 'var(--surface-3)' : 'transparent',
                      transition: 'background 60ms',
                    }}
                    onMouseEnter={() => setActive(idx)}
                  >
                    <div style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: isActive ? 'var(--surface-2)' : 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <NNIcon name={item.icon} size={14} color={isActive ? 'var(--accent-400)' : 'var(--text-muted)'}/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: isMobile ? 12.5 : 13.5, fontWeight: 500, color: 'var(--text)', letterSpacing: -0.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.label}
                      </div>
                      {item.sub && (
                        <div style={{ fontSize: isMobile ? 10.5 : 11.5, color: 'var(--text-dim)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sub}</div>
                      )}
                    </div>
                    {item.tag && (() => {
                      const tc = TAG_COLORS[item.tag] || TAG_COLORS.amber;
                      return (
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', background: tc.color, flexShrink: 0,
                        }}/>
                      );
                    })()}
                    {item.kbd && item.kbd.length > 0 && (
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        {item.kbd.map((k, i) => <NNKbd key={i}>{k}</NNKbd>)}
                      </div>
                    )}
                  </div>
                );
                return item.href ? (
                  <AppLink
                    key={item.id}
                    href={item.href}
                    onClick={() => onClose?.()}
                    style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}
                  >
                    {row}
                  </AppLink>
                ) : (
                  <div key={item.id}>{row}</div>
                );
              })}
            </div>
          ))}
          {flatItems.length === 0 && (
            <div style={{
              padding: '40px 20px', textAlign: 'center',
              color: 'var(--text-dim)', fontSize: 13,
            }}>
              {t('overlays.palette.noResults')} <em>"{query}"</em>
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div style={{
          padding: '8px 14px',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: isMobile ? 8 : 16, alignItems: 'center', flexWrap: 'wrap',
        }}>
          {[
            { k: '↑↓', l: t('overlays.palette.hints.navigate') },
            { k: '↵',  l: t('overlays.palette.hints.open') },
            { k: 'esc',l: t('overlays.palette.hints.close') },
          ].map(h => (
            <div key={h.k} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <NNKbd>{h.k}</NNKbd>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{h.l}</span>
            </div>
          ))}
          <div style={{ flex: 1 }}/>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            <NNKbd>⌘</NNKbd> <NNKbd>K</NNKbd> {t('overlays.palette.hints.toggle')}
          </span>
        </div>
      </div>
    </div>
  );
};
