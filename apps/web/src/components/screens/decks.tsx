'use client';

import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { DeckPlacement } from '@neuronexus/shared';
import { AppLink, useAppNavigation } from '@/components/navigation';
import { Modal } from '@/components/design-system/modal';
import { TextInput, Field, PageSurface } from '@/components/design-system/primitives';
import { NNAppPage } from '@/components/app-page';
import { NNIcon, NNBtn } from '@/components/ui';
import { CardActionsMenu, type CardMenuAction } from '@/components/card-actions-menu';
import { DeckAppearance, deckIconName, deckColorValue } from '@/components/deck-appearance';
import { useAssistantPageContext } from '@/components/chat/assistant-provider';
import { DeckDetails, deckCardsHref } from '@/components/deck-details';
import { useDeckDrag } from '@/lib/use-deck-drag';
import { useNN } from '@/lib/store';
import { useStudyOverview } from '@/lib/use-study-overview';
import type { Deck, DeckColor } from '@/lib/types';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';
import { useDialog } from '@/components/dialog';
import { raiseToast } from '@/components/toasts';
import { filterDeckTree } from '@/lib/deck-filter';
import { buildDeckTree, flattenTree, deckPathLabel, canBeParentOf } from '@/lib/decks';

const EXPANDED_KEY = 'nn:decks:collapsed';
export const NNDecks = () => {
  const t = useT();
  const { confirm, prompt, select } = useDialog();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const wide = bp === 'desktop';
  const router = useAppNavigation();
  const params = useSearchParams();
  const bootstrapped = useNN(s => s.bootstrapped);
  const decks = useNN(s => s.decks);
  const presets = useNN(s => s.presets);
  const addDeck = useNN(s => s.addDeck);
  const updateDeck = useNN(s => s.updateDeck);
  const moveDeck = useNN(s => s.moveDeck);
  const deleteDeck = useNN(s => s.deleteDeck);
  const bindDeckPreset = useNN(s => s.bindDeckPreset);
  const study = useStudyOverview();
  const [deckSearch, setDeckSearch] = useState('');
  const [filterCollapsed, setFilterCollapsed] = useState<Set<string>>(() => new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filterActive = Boolean(deckSearch.trim());
  const clearFilters = () => { setDeckSearch(''); setFilterCollapsed(new Set()); };
  useEffect(() => { try { const raw = localStorage.getItem(EXPANDED_KEY); if (raw) setCollapsed(new Set(JSON.parse(raw))); } catch {} }, []);
  const saveCollapsed = (next: Set<string>) => {
    setCollapsed(next);
    try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next])); } catch {}
  };
  const toggleCollapsed = (id: string) => {
    const next = new Set(filterActive ? filterCollapsed : collapsed);
    next.has(id) ? next.delete(id) : next.add(id);
    if (filterActive) setFilterCollapsed(next); else saveCollapsed(next);
  };
  const expand = (id: string) => { const next = new Set(collapsed); next.delete(id); saveCollapsed(next); };
  const tree = useMemo(() => buildDeckTree(decks), [decks]);
  const filteredTree = useMemo(() => filterDeckTree(tree, deckSearch), [tree, deckSearch]);
  const effectiveCollapsed = filterActive ? filterCollapsed : collapsed;
  const expanded = useMemo(() => new Set(decks.filter(d => !effectiveCollapsed.has(d.id)).map(d => d.id)), [decks, effectiveCollapsed]);
  const rows = useMemo(() => flattenTree(filteredTree, expanded), [filteredTree, expanded]);
  const filterNodes = useMemo(() => flattenTree(filteredTree, new Set(decks.map(d => d.id))), [filteredTree, decks]);
  const hasOpenBranch = filterNodes.some(node => node.children.length > 0 && !effectiveCollapsed.has(node.deck.id));
  const toggleAll = () => {
    const next = hasOpenBranch ? new Set(filterNodes.filter(node => node.children.length > 0).map(node => node.deck.id)) : new Set<string>();
    if (filterActive) setFilterCollapsed(next); else saveCollapsed(next);
  };
  const selected = rows.length > 0 ? decks.find(d => d.id === selectedId) ?? (wide ? rows[0]?.deck : undefined) : undefined;
  useAssistantPageContext(selected ? { kind: 'deck', id: selected.id } : null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mutate = async (operation: () => Promise<unknown>) => {
    if (pending.current) return false;
    pending.current = true; setBusy(true);
    try { await operation(); return true; }
    catch { raiseToast({ kind: 'error', title: t('common.toasts.error') }); return false; }
    finally { pending.current = false; setBusy(false); }
  };

  const [creating, setCreating] = useState(false);
  const [appearanceId, setAppearanceId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<DeckColor>('lime');
  const [newIcon, setNewIcon] = useState('decks');
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const closeForm = () => { setCreating(false); setAppearanceId(null); setFormError(''); };
  const openCreateAt = (parentId: string | null) => {
    const parent = decks.find(d => d.id === parentId);
    setNewParentId(parentId); setNewName(''); setNewColor(parent?.color ?? 'lime'); setNewIcon(parent?.icon ? deckIconName(parent.icon) : 'decks'); setFormError(''); setCreating(true);
  };
  const openAppearance = (deck: Deck) => { setAppearanceId(deck.id); setNewColor(deck.color); setNewIcon(deckIconName(deck.icon)); setFormError(''); };
  const createRequested = params?.get('create') === '1';
  const focusRequested = params?.get('focus');
  const consumedFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focusRequested) { consumedFocus.current = null; return; }
    if (!bootstrapped || consumedFocus.current === focusRequested) return;
    consumedFocus.current = focusRequested;
    const deck = decks.find(d => d.id === focusRequested);
    if (deck) {
      setSelectedId(deck.id); setDeckSearch('');
      const ancestors = new Set<string>();
      let parent: string | null | undefined = deck.parentId;
      while (parent && !ancestors.has(parent)) { ancestors.add(parent); parent = decks.find(d => d.id === parent)?.parentId ?? null; }
      setCollapsed(previous => {
        const next = new Set([...previous].filter(id => !ancestors.has(id)));
        try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next])); } catch {}
        return next;
      });
    } else raiseToast({ kind: 'error', title: t('common.toasts.error') });
    const next = new URLSearchParams(params?.toString()); next.delete('focus');
    router.replace(`/decks${next.size ? `?${next}` : ''}`, { scroll: false, track: false });
  }, [focusRequested, bootstrapped, decks, params, router, t]);
  useEffect(() => { if (createRequested) { openCreateAt(null); router.replace('/decks'); } }, [createRequested]);
  const saveForm = async () => {
    if (creating && !newName.trim()) return;
    const saved = await mutate(async () => {
      if (appearanceId) await updateDeck(appearanceId, { color: newColor, icon: newIcon });
      else {
        const deck = await addDeck({ name: newName.trim(), color: newColor, icon: newIcon, species: 'fern', parentId: newParentId ?? undefined });
        if (newParentId) expand(newParentId);
        setSelectedId(deck.id);
      }
    });
    if (saved) closeForm(); else setFormError(t('common.toasts.error'));
  };

  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState('');
  const [placement, setPlacement] = useState<DeckPlacement>('inside');
  const [moveError, setMoveError] = useState('');
  const moveOptions = useMemo(() => flattenTree(tree, new Set(decks.map(d => d.id))).filter(n => movingId && canBeParentOf(decks, movingId, n.deck.id)), [tree, decks, movingId]);
  const performMove = async (id: string, targetId: string | null, place: DeckPlacement) => {
    const saved = await mutate(() => moveDeck(id, targetId, place));
    if (saved) {
      if (targetId && place === 'inside') expand(targetId);
      setSelectedId(id); setMovingId(null); setMoveError('');
      raiseToast({ kind: 'success', title: t('decks.move.saved') });
    } else setMoveError(t('common.toasts.error'));
  };
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; anchor: HTMLElement } | null>(null);
  const closeMenu = useCallback((restore: boolean) => { if (restore && menu?.anchor.isConnected) menu.anchor.focus(); setMenu(null); }, [menu]);
  const openMenu = (id: string, anchor: HTMLElement, point?: { x: number; y: number }) => {
    if (busy) return;
    const rect = anchor.getBoundingClientRect(); setMenu({ id, anchor, x: point?.x ?? rect.left, y: point?.y ?? rect.bottom });
  };
  const menuDeck = decks.find(d => d.id === menu?.id);
  const actions: CardMenuAction[] = menuDeck ? [
    { label: t('cards.openCards'), icon: 'cards', run: () => router.push(deckCardsHref(decks, menuDeck.id)) },
    { label: t('decks.details.study'), icon: 'play', run: () => router.push(`/review?deck=${menuDeck.id}`) },
    { label: t('decks.addCard'), icon: 'plus', run: () => router.push(`/editor?deck=${menuDeck.id}`) },
    { label: t('decks.newSubDeck'), icon: 'decks', run: () => openCreateAt(menuDeck.id) },
    { label: t('actions.rename'), icon: 'edit', run: () => { void (async () => {
      const name = (await prompt({ title: t('decks.renamePrompt'), defaultValue: menuDeck.name }))?.trim();
      if (name && name !== menuDeck.name) await mutate(() => updateDeck(menuDeck.id, { name }));
    })(); } },
    { label: t('decks.appearance.title'), icon: 'star', run: () => openAppearance(menuDeck) },
    { label: t('decks.move.title'), icon: 'stack', run: () => { setMovingId(menuDeck.id); setMoveTarget(''); setPlacement('inside'); setMoveError(''); } },
    { label: t('decks.deckOptionsMenu'), icon: 'settings', run: () => { void (async () => {
      const picked = await select<string>({ title: t('decks.presetPickTitle', { deck: menuDeck.name }), value: menuDeck.presetId ?? '__none__', options: [{ value:'__none__', label:t('decks.presetPickNone') }, ...presets.map(p => ({ value:p.id,label:p.name }))] });
      if (picked !== null) await mutate(() => bindDeckPreset(menuDeck.id, picked === '__none__' ? null : picked));
    })(); } },
    { label: t('actions.delete'), icon: 'x', danger: true, run: () => { void (async () => {
      if (await confirm({ title: t('decks.deleteConfirm', { name: menuDeck.name }), danger:true })) await mutate(() => deleteDeck(menuDeck.id));
    })(); } },
  ] : [];

  const treeRef = useRef<HTMLDivElement>(null);
  const { dragging, drop, start: startDrag, consumeClick } = useDeckDrag({ decks, disabled: busy || filterActive || isMobile,
    root: treeRef, expand, onMove: (id,target,placement) => { void performMove(id,target,placement); } });
  return <NNAppPage title={t('nav.decks')} subtitle={study.data ? String(study.data.overall.total) : undefined}
    actions={<NNBtn className="reomi-create-icon" variant="soft" icon="plus" ariaLabel={t('decks.newDeck')} onClick={() => openCreateAt(null)} />}>
    <PageSurface className="reomi-decks-page">
      <Modal open={creating || Boolean(appearanceId)} title={t(creating ? 'decks.newDeck' : 'decks.appearance.title')} closeLabel={t('actions.close')} busy={busy} onClose={closeForm}>
        <form onSubmit={event => { event.preventDefault(); void saveForm(); }}><div className="reomi-modal-body">
          {creating && <><p className="reomi-modal-description">{t('decks.underParent')}: {newParentId ? deckPathLabel(decks,newParentId) : t('decks.move.root')}</p>
            <Field label={t('decks.name')}><TextInput autoFocus required maxLength={100} value={newName} disabled={busy} onChange={event => setNewName(event.target.value)} placeholder={t('decks.namePlaceholder')}/></Field></>}
          <DeckAppearance icon={newIcon} color={newColor} disabled={busy} onIcon={setNewIcon} onColor={setNewColor}/>
          {formError && <p role="alert">{formError}</p>}
        </div><footer className="reomi-modal-footer"><NNBtn variant="ghost" disabled={busy} onClick={closeForm}>{t('actions.cancel')}</NNBtn><NNBtn variant="primary" type="submit" loading={busy} disabled={creating && !newName.trim()}>{t(creating ? 'actions.create' : 'actions.save')}</NNBtn></footer></form>
      </Modal>
      <Modal open={Boolean(movingId)} title={t('decks.move.title')} closeLabel={t('actions.close')} busy={busy} onClose={() => setMovingId(null)}>
        <form onSubmit={event => { event.preventDefault(); if (movingId) void performMove(movingId, moveTarget || null, placement); }}>
          <div className="reomi-modal-body"><p>{decks.find(d => d.id === movingId)?.name}</p>
            <Field label={t('decks.move.destination')}><select className="reomi-input" aria-label={t('decks.move.destination')} value={moveTarget} disabled={busy} onChange={event => { setMoveTarget(event.target.value); if (!event.target.value) setPlacement('inside'); }}>
              <option value="">{t('decks.move.root')}</option>{moveOptions.map(n => <option key={n.deck.id} value={n.deck.id}>{deckPathLabel(decks,n.deck.id)}</option>)}
            </select></Field>
            <Field label={t('decks.move.placement')}><select className="reomi-input" aria-label={t('decks.move.placement')} value={placement} disabled={busy || !moveTarget} onChange={event => setPlacement(event.target.value as DeckPlacement)}>
              {(['inside','before','after'] as const).map(value => <option key={value} value={value}>{t(`decks.move.${value}`)}</option>)}
            </select></Field><p className="reomi-modal-description">{t('decks.move.subtree')}</p>{moveError && <p role="alert">{moveError}</p>}
          </div><footer className="reomi-modal-footer"><NNBtn variant="ghost" disabled={busy} onClick={() => setMovingId(null)}>{t('actions.cancel')}</NNBtn><NNBtn type="submit" variant="primary" loading={busy}>{t('decks.move.apply')}</NNBtn></footer>
        </form>
      </Modal>
      {decks.length > 0 && <div className="reomi-decks-toolbar">
        <div className="reomi-decks-search"><NNIcon name="search" size={16} />
          <TextInput value={deckSearch} aria-label={t('decks.filters.search')} placeholder={t('decks.filters.search')}
            onChange={event => { setDeckSearch(event.target.value); setFilterCollapsed(new Set()); }} />
        </div>
        <span className="reomi-decks-count">{t('decks.filters.count', { n: filterNodes.length })}</span>
        {filterActive && <NNBtn icon="x" variant="ghost" ariaLabel={t('decks.filters.clear')} title={t('decks.filters.clear')} onClick={clearFilters} />}
        <NNBtn icon={hasOpenBranch ? 'chevd' : 'chevr'} variant="ghost" disabled={!filterNodes.some(node => node.children.length > 0)}
          ariaLabel={t(hasOpenBranch ? 'decks.filters.collapseAll' : 'decks.filters.expandAll')}
          title={t(hasOpenBranch ? 'decks.filters.collapseAll' : 'decks.filters.expandAll')} onClick={toggleAll} />
      </div>}
      {study.error && <div role="alert" className="reomi-deck-status">{t('home.countsError')} <NNBtn onClick={study.reload}>{t('review.retry')}</NNBtn></div>}
      <div className="reomi-deck-workspace" data-detail={selected ? 'open' : 'closed'}>
        <div className="reomi-deck-tree-pane nn-scroll" data-empty={rows.length === 0 || undefined} ref={treeRef}>
          {filterActive && rows.length > 0 && <p className="reomi-deck-drag-hint">{t('decks.move.filterHint')}</p>}
          {dragging && <div className="reomi-deck-root-drop" style={{ left: (treeRef.current?.getBoundingClientRect().left ?? 0) + 12, top: (treeRef.current?.getBoundingClientRect().bottom ?? 0) - 54, width: (treeRef.current?.getBoundingClientRect().width ?? 0) - 24 }} data-deck-root-drop data-active={drop?.id === null || undefined}>{t('decks.move.toRoot')}</div>}
          {rows.length === 0 ? <div className="reomi-decks-empty">
            <span className="reomi-decks-empty-icon" aria-hidden="true"><NNIcon name={decks.length ? 'search' : 'decks'} size={28}/></span>
            <h2>{t(decks.length ? 'decks.filters.noResults' : 'decks.emptyTitle')}</h2>
            {!decks.length && <p>{t('decks.emptyHint')}</p>}
            <NNBtn variant={decks.length ? 'soft' : 'primary'} icon={decks.length ? 'x' : 'plus'} onClick={decks.length ? clearFilters : () => openCreateAt(null)}>{t(decks.length ? 'decks.filters.clear' : 'decks.newDeck')}</NNBtn></div> :
          <div className="reomi-deck-list" role="tree" aria-label={t('nav.decks')} aria-busy={busy}>
            {rows.map((node,index) => {
              const d = node.deck, counts = study.data?.decks[d.id];
              const hasChildren = decks.some(child => child.parentId === d.id);
              const isCollapsed = effectiveCollapsed.has(d.id);
              return <div key={d.id} role="treeitem" tabIndex={0} aria-level={node.depth + 1} aria-selected={selected?.id === d.id}
                aria-expanded={hasChildren ? !isCollapsed : undefined} aria-label={d.name}
                className="nn-deck-row reomi-organized-deck-row" data-deck-id={d.id} data-selected={selected?.id === d.id || undefined}
                data-drop={drop?.id === d.id ? drop.placement : undefined} data-dragging={dragging === d.id || undefined}
                onClick={() => { if (!consumeClick()) setSelectedId(d.id); }} onContextMenu={event => { event.preventDefault(); openMenu(d.id,event.currentTarget,{x:event.clientX,y:event.clientY}); }}
                onKeyDown={event => {
                  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); event.stopPropagation(); openMenu(d.id,event.currentTarget); return; }
                  if (event.target !== event.currentTarget) return;
                  const items = treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]');
                  let focusIndex: number | undefined;
                  if (event.key === 'ArrowDown') focusIndex = Math.min(rows.length-1,index+1);
                  if (event.key === 'ArrowUp') focusIndex = Math.max(0,index-1);
                  if (event.key === 'Home') focusIndex=0;
                  if (event.key === 'End') focusIndex=rows.length-1;
                  if (focusIndex !== undefined) { event.preventDefault(); items?.[focusIndex]?.focus(); }
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(d.id); }
                  if (event.key === 'ArrowRight' && hasChildren) { event.preventDefault(); if (isCollapsed) toggleCollapsed(d.id); else items?.[index+1]?.focus(); }
                  if (event.key === 'ArrowLeft') { event.preventDefault(); if (hasChildren && !isCollapsed) toggleCollapsed(d.id); else { const parentIndex=rows.findIndex(n=>n.deck.id===d.parentId); if(parentIndex>=0) items?.[parentIndex]?.focus(); } }
                }}>
                <button type="button" className="reomi-deck-drag-handle" onPointerDown={event => startDrag(event,d.id)} disabled={busy || filterActive}
                  aria-label={t('decks.move.drag')} title={t('decks.move.drag')}
                  onClick={event => { event.stopPropagation(); if (consumeClick()) return; setMovingId(d.id); setMoveTarget(''); setPlacement('inside'); setMoveError(''); }}
                  >
                  <span aria-hidden="true">⠿</span>
                </button>
                <div className="reomi-deck-name" style={{ paddingLeft: Math.min(node.depth,6) * (isMobile ? 12 : 16) }}>
                  <button type="button" className="reomi-deck-disclosure" aria-label={t(isCollapsed ? 'decks.expand' : 'decks.collapse')}
                    aria-hidden={!hasChildren || undefined} tabIndex={hasChildren ? 0 : -1} style={{ visibility: hasChildren ? 'visible' : 'hidden', transform: !isCollapsed ? 'rotate(90deg)' : undefined }}
                    onClick={event => { event.stopPropagation(); toggleCollapsed(d.id); }}><NNIcon name="chevr" size={13}/></button>
                  <button type="button" className="reomi-deck-row-icon" style={{ color: deckColorValue(d.color) }} aria-label={`${t('decks.appearance.title')}: ${d.name}`}
                    onClick={event => { event.stopPropagation(); openAppearance(d); }}><NNIcon name={deckIconName(d.icon)} size={19}/></button>
                  <div className="reomi-deck-name-copy"><strong title={deckPathLabel(decks,d.id)}>{d.name}</strong><small>{counts ? t('decks.totalCards',{n:counts.total}) : '—'}{hasChildren ? ` · ${t('decks.subCount',{n:decks.filter(child=>child.parentId===d.id).length})}` : ''}</small></div>
                </div>
                <div className="reomi-deck-row-stats">
                  <span title={t('cards.states.new')}><i style={{background:'var(--sky-500)'}}/>{counts?.newCount ?? '—'}<small>{t('decks.row.new')}</small></span>
                  <span title={t('cards.states.learning')}><i style={{background:'var(--amber-500)'}}/>{counts?.learningCount ?? '—'}<small>{t('decks.row.learning')}</small></span>
                </div>
                {counts && counts.totalAvailable > 0 ? <AppLink className="reomi-deck-due" data-active href={`/review?deck=${d.id}`} onClick={event=>event.stopPropagation()}
                  aria-label={t('decks.review')} title={t('decks.reviewCount',{n:counts.totalAvailable})}>
                  <NNIcon name="review" size={13}/>{counts.totalAvailable}
                </AppLink> : <span className="reomi-deck-due" title={counts ? t('decks.details.caughtUp') : t('cards.loading')}><NNIcon name="review" size={13}/>{counts ? 0 : '—'}</span>}
                <button type="button" className="reomi-deck-more" aria-label={`${t('decks.deckMenu')}: ${d.name}`} aria-haspopup="menu" disabled={busy}
                  onClick={event=>{event.stopPropagation();openMenu(d.id,event.currentTarget);}}><NNIcon name="dots" size={16}/></button>
              </div>;
            })}
          </div>}
        </div>
        {selected && <DeckDetails key={selected.id} deck={selected} decks={decks} counts={study.data?.decks[selected.id]} onBack={()=>setSelectedId(null)} onAppearance={()=>openAppearance(selected)}/>}
      </div>
      {menu && menuDeck && <CardActionsMenu x={menu.x} y={menu.y} label={menuDeck.name} closeLabel={t('actions.close')} mobile={isMobile} actions={actions} onClose={closeMenu}/>}
    </PageSurface>
  </NNAppPage>;
};
