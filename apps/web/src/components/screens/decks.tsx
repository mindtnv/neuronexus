'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

import { AppLink, useAppNavigation } from '@/components/navigation';
import { Modal } from '@/components/design-system/modal';
import { TextInput, Field, PageSurface, SegmentedControl } from '@/components/design-system/primitives';
import { NNAppPage } from '@/components/app-page';
import { NNIcon, NNBtn, NNCard, NNBadge } from '@/components/ui';
import { useNN } from '@/lib/store';
import { useStudyOverview } from '@/lib/use-study-overview';
import type { DeckColor } from '@/lib/types';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';
import { useDialog } from '@/components/dialog';
import { raiseToast } from '@/components/toasts';
import { filterDeckTree, type DeckFilter } from '@/lib/deck-filter';
import { buildDeckTree, flattenTree, deckPathLabel, deckRowTarget, DeckNode } from '@/lib/decks';


// ─────────────────────────────────────────────
// Decks screen — nested tree view
// ─────────────────────────────────────────────
const COLOR_OPTIONS: DeckColor[] = ['lime', 'amber', 'violet', 'sky', 'rose', 'neutral'];

const EXPANDED_KEY = 'nn:decks:collapsed';

export const NNDecks = () => {
  const t = useT();
  const { confirm, prompt, select } = useDialog();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';

  const decks = useNN((s) => s.decks);
  const study = useStudyOverview();
  const profile = useNN((s) => s.profile);
  const presets = useNN((s) => s.presets);
  const addDeck = useNN((s) => s.addDeck);
  const updateDeck = useNN((s) => s.updateDeck);
  const deleteDeck = useNN((s) => s.deleteDeck);
  const bindDeckPreset = useNN((s) => s.bindDeckPreset);

  const [deckSearch, setDeckSearch] = useState('');
  const [deckFilter, setDeckFilter] = useState<DeckFilter>('all');
  const [filterCollapsed, setFilterCollapsed] = useState<Set<string>>(() => new Set());
  const filterActive = Boolean(deckSearch.trim()) || deckFilter !== 'all';
  const clearFilters = () => { setDeckSearch(''); setDeckFilter('all'); setFilterCollapsed(new Set()); };

  // Collapsed nodes stored in localStorage; default is expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw)));
    } catch {}
  }, []);
  const toggleCollapsed = (id: string) => {
    if (filterActive) {
      setFilterCollapsed(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; });
      return;
    }
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  const router = useAppNavigation();

  const [creating, setCreating] = useState(false);
  const createRequested = useSearchParams()?.get('create') === '1';
  useEffect(() => {
    if (!createRequested) return;
    setNewParentId(null); setCreating(true);
    router.replace('/decks');
  }, [createRequested, router]);
  const [createBusy, setCreateBusy] = useState(false);
  const createPending = useRef(false);
  const [createError, setCreateError] = useState('');

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<DeckColor>('lime');
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);


  const tree = useMemo(() => buildDeckTree(decks), [decks]);
  const childCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const deck of decks) if (deck.parentId) counts.set(deck.parentId, (counts.get(deck.parentId) ?? 0) + 1);
    return counts;
  }, [decks]);
  const aggregate = useMemo(() => new Map(Object.entries(study.data?.decks ?? {}).map(([id, counts]) =>
    [id, { total: counts.total, due: counts.totalAvailable }])), [study.data]);
  const direct = useMemo(() => new Map(Object.entries(study.data?.direct ?? {}).map(([id, counts]) =>
    [id, { total: counts.total }])), [study.data]);

  const filteredTree = useMemo(() => filterDeckTree(tree, deckSearch, deckFilter, aggregate), [tree, deckSearch, deckFilter, aggregate]);
  const effectiveCollapsed = filterActive ? filterCollapsed : collapsed;
  const expanded = useMemo(() => new Set(decks.filter(deck => !effectiveCollapsed.has(deck.id)).map(deck => deck.id)), [decks, effectiveCollapsed]);
  const rows = useMemo(() => flattenTree(filteredTree, expanded), [filteredTree, expanded]);
  const filterNodes = useMemo(() => flattenTree(filteredTree, new Set(decks.map(deck => deck.id))), [filteredTree, decks]);
  const hasOpenBranch = filterNodes.some(node => node.children.length > 0 && !effectiveCollapsed.has(node.deck.id));
  const toggleAll = () => {
    const next = hasOpenBranch ? new Set(filterNodes.filter(node => node.children.length > 0).map(node => node.deck.id)) : new Set<string>();
    if (filterActive) setFilterCollapsed(next);
    else {
      setCollapsed(next);
      try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next])); } catch {}
    }
  };



  const resetForm = () => {
    setCreateError('');
    setNewName('');
    setNewColor('lime');
    setNewParentId(null);
    setCreating(false);
  };

  const openCreateAt = (parentId: string | null) => {
    setNewParentId(parentId);
    if (parentId) {
      const parent = decks.find((d) => d.id === parentId);
      if (parent) setNewColor(parent.color as DeckColor);
    }
    setCreating(true);
    setOpenMenuId(null);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || createPending.current) return;
    createPending.current = true; setCreateBusy(true); setCreateError('');

    try {
      await addDeck({
        name,
        color: newColor,
        species: 'fern',
        parentId: newParentId ?? undefined,
      });
      // Ensure parent is expanded so the new child is visible immediately.
      if (newParentId) {
        setCollapsed((prev) => {
          const next = new Set(prev);
          next.delete(newParentId);
          try {
            localStorage.setItem(EXPANDED_KEY, JSON.stringify(Array.from(next)));
          } catch {}
          return next;
        });
      }
      resetForm();
    } catch (err) {
      setCreateError(t('toasts.error'));
    } finally {
      createPending.current = false; setCreateBusy(false);

    }
  };

  const handleDelete = async (id: string, name: string) => {
    setOpenMenuId(null);
    if (!(await confirm({ title: t('decks.deleteConfirm', { name }), danger: true }))) return;
    try {
      await deleteDeck(id);
    } catch (err) {
      console.error('deleteDeck failed', err);
      raiseToast({ kind: 'error', title: t('common.toasts.error') });
    }
  };

  // Whole-row tap: parent → toggle collapse, leaf → open cards browser
  // filtered to the deck. Pure routing decision lives in deckRowTarget.
  const handleRowTap = (node: DeckNode) => {
    const target = deckRowTarget(node);
    if (target.kind === 'toggle') toggleCollapsed(node.deck.id);
    else router.push(`/cards?q=${target.query}`);
  };

  const parentLabel = newParentId ? deckPathLabel(decks, newParentId) : null;

  return (
    <NNAppPage
      title={t('nav.decks')}
      subtitle={study.data ? String(study.data.overall.total) : undefined}
      actions={<NNBtn className="reomi-create-icon" variant="soft" icon="plus" ariaLabel={t('decks.newDeck')} title={t('decks.newDeck')} onClick={() => openCreateAt(null)} />}
    >
    <PageSurface className="reomi-decks-page">
      <Modal open={creating} title={t('decks.newDeck')} closeLabel={t('actions.close')} busy={createBusy} onClose={resetForm}>
        <form onSubmit={event => { event.preventDefault(); void handleCreate(); }}>
          <div className="reomi-modal-body">
            {parentLabel && <p className="reomi-modal-description">{t('decks.underParent')}: <strong>{parentLabel}</strong></p>}
            <Field label={t('decks.name')} error={createError || undefined}>
              <TextInput autoFocus required maxLength={100} value={newName} disabled={createBusy}
                onChange={event => setNewName(event.target.value)} placeholder={t('decks.namePlaceholder')} />
            </Field>
            <fieldset className="reomi-color-field"><legend>{t('decks.color')}</legend>
              <div className="reomi-color-options">
                {COLOR_OPTIONS.map(color => <button key={color} type="button" disabled={createBusy}
                  aria-label={color} data-tooltip={color} aria-pressed={color === newColor} onClick={() => setNewColor(color)}
                  style={{ background: color === 'neutral' ? 'var(--surface-3)' : `var(--${color}-500)` }}>
                  {color === newColor && <NNIcon name="check" size={16} />}
                </button>)}
              </div>
            </fieldset>
          </div>
          <footer className="reomi-modal-footer">
            <NNBtn variant="ghost" disabled={createBusy} onClick={resetForm}>{t('actions.cancel')}</NNBtn>
            <NNBtn variant="primary" type="submit" loading={createBusy} disabled={!newName.trim()}>{t('actions.create')}</NNBtn>
          </footer>
        </form>
      </Modal>

      <div className="reomi-decks-toolbar">
        <div className="reomi-decks-search"><NNIcon name="search" size={16} />
          <TextInput value={deckSearch} aria-label={t('decks.filters.search')} placeholder={t('decks.filters.search')}
            onChange={event => { setDeckSearch(event.target.value); setFilterCollapsed(new Set()); }} />
        </div>
        <SegmentedControl label={t('decks.filters.label')} value={deckFilter}
          options={(['all', 'due', 'empty'] as const).map(value => ({ value, label: t(`decks.filters.${value}`), tooltip: t(`decks.filterHints.${value}`) }))}
          onChange={value => { setDeckFilter(value); setFilterCollapsed(new Set()); }} />
        <span className="reomi-decks-count">{t('decks.filters.count', { n: filterNodes.length })}</span>
        {filterActive && <NNBtn icon="x" variant="ghost" ariaLabel={t('decks.filters.clear')} title={t('decks.filters.clear')} onClick={clearFilters} />}
        <NNBtn icon={hasOpenBranch ? 'chevd' : 'chevr'} variant="ghost" disabled={!filterNodes.some(node => node.children.length > 0)}
          ariaLabel={t(hasOpenBranch ? 'decks.filters.collapseAll' : 'decks.filters.expandAll')}
          title={t(hasOpenBranch ? 'decks.filters.collapseAll' : 'decks.filters.expandAll')} onClick={toggleAll} />
      </div>

      {study.error && <div role="alert">{t('home.countsError')} <NNBtn onClick={study.reload}>{t('review.retry')}</NNBtn></div>}
      {decks.length > 0 && <NNBtn size="sm" variant="soft" icon="filter" onClick={() => router.push('/review/custom-study')}>{t('review.customStudy.title')}</NNBtn>}
      {decks.length === 0 ? (

        <NNCard style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>{t('decks.emptyTitle')}</div>
          <div style={{ fontSize: 12 }}>{t('decks.emptyHint')}</div>
        </NNCard>
      ) : rows.length === 0 ? (
        <div className="reomi-decks-empty"><NNIcon name="search" size={24} /><p>{t('decks.filters.noResults')}</p><NNBtn variant="soft" onClick={clearFilters}>{t('decks.filters.clear')}</NNBtn></div>
      ) : (
        <NNCard className="reomi-deck-list" padding={0} style={{ overflow: 'visible' }}>
          {rows.map((node, rowIndex) => {
            const d = node.deck;
            const agg = aggregate.get(d.id) ?? { total: 0, due: 0 };
            const own = direct.get(d.id) ?? { total: 0, due: 0 };
            const hasChildren = node.children.length > 0;
            const isCollapsed = effectiveCollapsed.has(d.id);
            const menuOpen = openMenuId === d.id;
            const indentPx = node.depth * 20;
            return (
              <div
                key={d.id}
                className="nn-deck-row"
                role="button"
                tabIndex={0}
                aria-label={
                  hasChildren
                    ? `${d.name} — ${isCollapsed ? t('decks.expand') : t('decks.collapse')}`
                    : `${d.name} — ${t('cards.openCards')}`
                }
                onClick={() => handleRowTap(node)}
                onKeyDown={(e) => {
                  // Only act when the row itself is focused — a focused child
                  // (chevron, due-pill, kebab, hover links) handles Enter/Space
                  // natively, so the row must not double-fire.
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault(); // stop Space from scrolling the page
                    handleRowTap(node);
                  }
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-3)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }}
                onMouseDown={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0.5px)';
                }}
                onMouseUp={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = '';
                }}
                onFocus={(e) => {
                  if (e.target !== e.currentTarget) return;
                  (e.currentTarget as HTMLDivElement).style.outline = '2px solid var(--accent-500)';
                  (e.currentTarget as HTMLDivElement).style.outlineOffset = '-2px';
                }}
                onBlur={(e) => {
                  if (e.target !== e.currentTarget) return;
                  (e.currentTarget as HTMLDivElement).style.outline = 'none';
                  (e.currentTarget as HTMLDivElement).style.outlineOffset = '';
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: isMobile ? '10px 14px' : '12px 16px',
                  borderBottom: rowIndex === rows.length - 1 ? 'none' : '1px solid var(--panel-edge)',
                  position: 'relative',
                  cursor: 'pointer',
                  background: 'transparent',
                  outline: 'none',
                  transition: 'background 120ms ease',
                }}
              >
                {/* name + disclosure + dot — takes the freed space */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, paddingLeft: indentPx }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      // Only intercept the row tap when the chevron is actionable.
                      // For leaf rows the (invisible) chevron lets the click bubble to
                      // handleRowTap → opens the deck's cards, avoiding a dead-zone.
                      if (hasChildren) {
                        e.stopPropagation();
                        toggleCollapsed(d.id);
                      }
                    }}
                    aria-label={hasChildren ? (isCollapsed ? t('decks.expand') : t('decks.collapse')) : undefined}
                    aria-hidden={!hasChildren || undefined}
                    tabIndex={hasChildren ? 0 : -1}
                    style={{
                      width: 18,
                      height: 18,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: hasChildren ? 'pointer' : 'default',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-dim)',
                      flexShrink: 0,
                      transform: hasChildren && !isCollapsed ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 120ms ease',
                      opacity: hasChildren ? 1 : 0,
                      padding: 0,
                    }}
                  >
                    <NNIcon name="chevr" size={12} color="currentColor" />
                  </button>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: `var(--${d.color === 'neutral' ? 'ink-500' : `${d.color}-500`})`,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: node.depth === 0 ? 600 : 500,
                      color: 'var(--text)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {d.name}
                  </span>
                  {hasChildren && (
                    <NNBadge size="xs" tone="neutral">
                      {t('decks.subCount', { n: childCounts.get(d.id) ?? node.children.length })}
                    </NNBadge>
                  )}
                  {!isMobile && d.presetId && (() => {
                    const preset = presets.find((p) => p.id === d.presetId);
                    return preset ? (
                      <NNBadge size="xs" tone="neutral">
                        {t('decks.presetBound', { name: preset.name })}
                      </NNBadge>
                    ) : null;
                  })()}
                  {/* demoted total — desktop only; carries the (own.total) parenthetical */}
                  {!isMobile && (
                    <span className="mono" tabIndex={0} data-tooltip={t('decks.totalCards', { n: agg.total })} style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0, marginLeft: 2 }}>
                      {study.data ? agg.total : '—'}

                      {hasChildren && own.total > 0 && <span> ({own.total})</span>}
                    </span>
                  )}
                </div>

                {/* hover-revealed icon actions (desktop only) */}
                {!isMobile && (
                  <div className="nn-deck-row-actions" style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <AppLink
                      href={`/editor?deck=${encodeURIComponent(d.id)}`}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={t('decks.addCard')}
                      title={t('decks.addCard')}
                      style={iconActionStyle}
                    >
                      <NNIcon name="plus" size={14} />
                    </AppLink>
                    {agg.total > 0 && (
                      <AppLink
                        href={`/review?deck=${encodeURIComponent(d.id)}`}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={t('decks.review')}
                        title={t('decks.review')}
                        style={{ ...iconActionStyle, color: 'var(--accent-500)' }}
                      >
                        <NNIcon name="bolt" size={14} />
                      </AppLink>
                    )}
                  </div>
                )}

                {/* due-pill */}
                {agg.due > 0 ? (
                  <AppLink
                    href={`/review?deck=${encodeURIComponent(d.id)}`}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={t('decks.review')}
                    data-tooltip={t('decks.reviewCount', { n: agg.due })}
                    className="mono"
                    style={{
                      flexShrink: 0,
                      minWidth: 36,
                      textAlign: 'center',
                      padding: '3px 9px',
                      borderRadius: 999,
                      background: 'var(--accent-500)',
                      color: 'var(--text-on-accent)',
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    {study.data ? agg.due : '—'}
                  </AppLink>
                ) : study.data && agg.total === 0 ? (
                  <AppLink href={`/editor?deck=${encodeURIComponent(d.id)}`} onClick={(e) => e.stopPropagation()}
                    style={{ fontSize: 12, color: 'var(--accent-400)', textDecoration: 'none' }}>{t('decks.firstCard')}</AppLink>
                ) : (
                  <span
                    className="mono"
                    style={{
                      flexShrink: 0,
                      minWidth: 36,
                      textAlign: 'center',
                      padding: '3px 9px',
                      borderRadius: 999,
                      background: 'var(--surface-3)',
                      color: 'var(--text-dim)',
                      fontSize: 12,
                    }}
                  >
                    {study.data ? agg.due : '—'}
                  </span>
                )}

                {/* menu */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(menuOpen ? null : d.id);
                    }}
                    aria-label={t('decks.deckMenu')}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <NNIcon name="dots" size={14} />
                  </button>
                  {menuOpen && (
                    <div className="reomi-deck-menu"
                      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpenMenuId(null); } }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        top: 30,
                        right: 0,
                        minWidth: 180,
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 5,
                        padding: 4,
                      }}
                    >
                        <button
                        type="button"
                        onClick={() => { setOpenMenuId(null); router.push(`/editor?deck=${encodeURIComponent(d.id)}`); }}
                        style={menuItemStyle()}
                      >
                        <NNIcon name="plus" size={13} />
                        <span>{t('decks.addCard')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          // Drill into the Browse screen pre-filtered to this deck.
                          // Quote the name (escaping embedded quotes) so deck names
                          // with spaces parse as one `deck:` term.
                          const escaped = d.name.replace(/"/g, '\\"');
                          router.push(`/cards?q=${encodeURIComponent(`deck:"${escaped}"`)}`);
                        }}
                        style={menuItemStyle()}
                      >
                        <NNIcon name="grid" size={13} />
                        <span>{t('cards.openCards')}</span>
                      </button>
                      {agg.total > 0 && (
                        <button
                          type="button"
                          onClick={() => { setOpenMenuId(null); router.push(`/review?deck=${encodeURIComponent(d.id)}`); }}
                          style={menuItemStyle('var(--accent-500)')}
                        >
                          <NNIcon name="bolt" size={13} />
                          <span>{t('decks.review')}</span>
                        </button>
                      )}
                      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                      <button
                        type="button"
                        onClick={() => openCreateAt(d.id)}
                        style={menuItemStyle()}
                      >
                        <NNIcon name="plus" size={13} />
                        <span>{t('decks.newSubDeck')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setOpenMenuId(null);
                          const next = (await prompt({ title: t('decks.renamePrompt'), defaultValue: d.name }))?.trim();
                          if (next && next !== d.name) {
                            try {
                              await updateDeck(d.id, { name: next });
                            } catch (err) {
                              console.error('updateDeck failed', err);
                              raiseToast({ kind: 'error', title: t('common.toasts.error') });
                            }
                          }
                        }}
                        style={menuItemStyle()}
                      >
                        <NNIcon name="edit" size={13} />
                        <span>{t('actions.rename')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setOpenMenuId(null);
                          const next = await select<DeckColor>({
                            title: t('actions.recolor'),
                            value: d.color as DeckColor,
                            options: COLOR_OPTIONS.map((c) => ({
                              value: c,
                              label: t(`decks.colors.${c}`),
                              swatch: c === 'neutral' ? 'var(--surface-3)' : `var(--${c}-500)`,
                            })),
                          });
                          if (next && COLOR_OPTIONS.includes(next) && next !== d.color) {
                            try {
                              await updateDeck(d.id, { color: next });
                            } catch (err) {
                              console.error('updateDeck failed', err);
                              raiseToast({ kind: 'error', title: t('common.toasts.error') });
                            }
                          }
                        }}
                        style={menuItemStyle()}
                      >
                        <NNIcon name="tag" size={13} />
                        <span>{t('actions.recolor')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setOpenMenuId(null);
                          // Sentinel for "no preset" (unbind) — distinguishes the None
                          // choice from a cancelled dialog (which resolves to null).
                          const NONE = '__none__';
                          const picked = await select<string>({
                            title: t('decks.presetPickTitle', { deck: d.name }),
                            value: d.presetId ?? NONE,
                            options: [
                              { value: NONE, label: t('decks.presetPickNone') },
                              ...presets.map((p) => ({ value: p.id, label: p.name })),
                            ],
                          });
                          if (picked === null) return;
                          const presetId = picked === NONE ? null : picked;
                          try {
                            await bindDeckPreset(d.id, presetId);
                          } catch (err) {
                            console.error('bindDeckPreset failed', err);
                            raiseToast({ kind: 'error', title: t('common.toasts.error') });
                          }
                        }}
                        style={menuItemStyle()}
                      >
                        <NNIcon name="settings" size={13} />
                        <span>{t('decks.deckOptionsMenu')}</span>
                      </button>
                      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                      <button
                        type="button"
                        onClick={() => handleDelete(d.id, d.name)}
                        style={menuItemStyle('var(--rose-400)')}
                      >
                        <NNIcon name="x" size={13} />
                        <span>{t('actions.delete')}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </NNCard>
      )}
    </PageSurface>
    </NNAppPage>
  );
};


const iconActionStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--surface-3)',
  color: 'var(--text-muted)',
  textDecoration: 'none',
};

const menuItemStyle = (color?: string): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '10px 12px',
  border: 'none',
  borderRadius: 8,
  color: color ?? 'var(--text)',
  fontFamily: 'var(--font-sans)',
  fontSize: 12.5,
  textAlign: 'left',
  cursor: 'pointer',
});
