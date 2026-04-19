'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { NNIcon, NNBtn, NNCard, NNPlant, NNBadge } from '@/components/ui';
import { useNN } from '@/lib/store';
import type { DeckColor } from '@/lib/types';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';
import { aggregateCounts, buildDeckTree, flattenTree, deckPathLabel, DeckNode } from '@/lib/decks';

// ─────────────────────────────────────────────
// Decks screen — nested tree view
// ─────────────────────────────────────────────
const COLOR_OPTIONS: DeckColor[] = ['lime', 'amber', 'violet', 'sky', 'rose', 'neutral'];

const EXPANDED_KEY = 'nn:decks:collapsed';

export const NNDecks = () => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const searchParams = useSearchParams();
  const shouldOpenFirstDeckFlow = searchParams?.get('new') === '1';

  const decks = useNN((s) => s.decks);
  const cards = useNN((s) => s.cards);
  const addDeck = useNN((s) => s.addDeck);
  const updateDeck = useNN((s) => s.updateDeck);
  const deleteDeck = useNN((s) => s.deleteDeck);

  // Collapsed nodes stored in localStorage; default is expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw)));
    } catch {}
  }, []);
  const toggleCollapsed = (id: string) => {
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

  const router = useRouter();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<DeckColor>('lime');
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldOpenFirstDeckFlow || creating || decks.length > 0) return;
    openCreateAt(null);
  }, [creating, decks.length, shouldOpenFirstDeckFlow]);

  const now = Date.now();

  const tree = useMemo(() => buildDeckTree(decks), [decks]);
  // Tree flattening: nodes are expanded if NOT collapsed.
  const expanded = useMemo(() => {
    const s = new Set<string>();
    const walk = (ns: DeckNode[]) => {
      for (const n of ns) {
        if (!collapsed.has(n.deck.id)) s.add(n.deck.id);
        walk(n.children);
      }
    };
    walk(tree);
    return s;
  }, [tree, collapsed]);
  const rows = useMemo(() => flattenTree(tree, expanded), [tree, expanded]);

  // Aggregate counts (include descendants) for each deck.
  const aggregate = useMemo(() => {
    const out = new Map<string, { total: number; due: number }>();
    for (const d of decks) out.set(d.id, aggregateCounts(decks, cards, d.id, now));
    return out;
  }, [decks, cards, now]);

  // Direct counts (cards belonging to this deck only).
  const direct = useMemo(() => {
    const out = new Map<string, { total: number; due: number }>();
    for (const d of decks) out.set(d.id, { total: 0, due: 0 });
    for (const c of cards) {
      const s = out.get(c.deckId);
      if (!s) continue;
      s.total += 1;
      if (new Date(c.fsrs.due).getTime() <= now) s.due += 1;
    }
    return out;
  }, [decks, cards, now]);

  const resetForm = () => {
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
    if (!name) return;
    try {
      const wasFirstRootDeck = decks.length === 0 && !newParentId;
      const created = await addDeck({
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
      if (wasFirstRootDeck) {
        router.replace(`/editor?deck=${encodeURIComponent(created.id)}&from=decks`);
        return;
      }
      resetForm();
    } catch (err) {
      console.error('addDeck failed', err);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setOpenMenuId(null);
    if (typeof window !== 'undefined' && !window.confirm(t('decks.deleteConfirm', { name }))) return;
    try {
      await deleteDeck(id);
    } catch (err) {
      console.error('deleteDeck failed', err);
    }
  };

  const parentLabel = newParentId ? deckPathLabel(decks, newParentId) : null;

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? 14 : 24 }}>
      <div style={{ display: 'flex', gap: isMobile ? 6 : 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <NNBtn size="sm" variant="soft" icon="stack">{t('decks.tree')}</NNBtn>
        <div style={{ flex: 1 }} />
        {/* Import PDF lives behind a feature flag until the LLM integration
            lands — hidden from the deck toolbar so we don't route users to a
            placeholder screen. */}
        <NNBtn
          size="sm"
          variant="primary"
          icon="plus"
          onClick={() => openCreateAt(null)}
          testId="decks-create-trigger"
        >
          {t('decks.newDeck')}
        </NNBtn>
      </div>

      {creating && (
        <NNCard style={{ marginBottom: 14 }}>
          {parentLabel && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              {t('decks.underParent')}: <span style={{ color: 'var(--text)', fontWeight: 500 }}>{parentLabel}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px', minWidth: 200 }}>
              <div style={labelStyle}>{t('decks.name')}</div>
              <input
                data-testid="decks-create-name"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  else if (e.key === 'Escape') resetForm();
                }}
                placeholder={t('decks.namePlaceholder')}
                style={inputStyle}
              />
            </div>
            <div>
              <div style={labelStyle}>{t('decks.color')}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {COLOR_OPTIONS.map((c) => {
                  const selected = c === newColor;
                  const bg = c === 'neutral' ? 'var(--surface-3)' : `var(--${c}-500)`;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      aria-label={c}
                      title={c}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: bg,
                        border: selected ? '2px solid var(--text)' : '2px solid var(--border)',
                        boxShadow: selected ? '0 0 0 2px var(--surface)' : 'none',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
              <NNBtn size="sm" variant="ghost" onClick={resetForm}>
                {t('actions.cancel')}
              </NNBtn>
              <NNBtn
                size="sm"
                variant="primary"
                icon="check"
                onClick={handleCreate}
                testId="decks-create-submit"
              >
                {t('actions.create')}
              </NNBtn>
            </div>
          </div>
        </NNCard>
      )}

      {decks.length === 0 && !creating ? (
        <NNCard style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>{t('decks.emptyTitle')}</div>
          <div style={{ fontSize: 12 }}>{t('decks.emptyHint')}</div>
        </NNCard>
      ) : (
        <NNCard padding={0} style={{ overflow: 'visible' }} testId="decks-tree">
          {/* header row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr 80px 48px' : '1fr 90px 90px 170px 40px',
              padding: isMobile ? '10px 14px' : '10px 16px',
              borderBottom: '1px solid var(--border)',
              fontSize: 10.5,
              fontWeight: 600,
              color: 'var(--text-dim)',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              gap: 10,
            }}
          >
            <span>{t('decks.columns.name')}</span>
            <span style={{ textAlign: 'right' }}>{isMobile ? t('decks.columns.due') : t('decks.columns.cards')}</span>
            {!isMobile && <span style={{ textAlign: 'right' }}>{t('decks.columns.due')}</span>}
            {!isMobile && <span style={{ textAlign: 'right' }}>{t('decks.columns.actions')}</span>}
            <span />
          </div>

          {rows.map((node) => {
            const d = node.deck;
            const agg = aggregate.get(d.id) ?? { total: 0, due: 0 };
            const own = direct.get(d.id) ?? { total: 0, due: 0 };
            const hasChildren = node.children.length > 0;
            const isCollapsed = collapsed.has(d.id);
            const menuOpen = openMenuId === d.id;
            const indentPx = node.depth * 20;
            return (
              <div
                key={d.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr 80px 48px' : '1fr 90px 90px 170px 40px',
                  padding: isMobile ? '10px 14px' : '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  alignItems: 'center',
                  gap: 10,
                  position: 'relative',
                }}
              >
                {/* name + disclosure + dot */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, paddingLeft: indentPx }}>
                  <button
                    type="button"
                    onClick={() => hasChildren && toggleCollapsed(d.id)}
                    aria-label={hasChildren ? (isCollapsed ? t('decks.expand') : t('decks.collapse')) : undefined}
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
                      {t('decks.subCount', { n: node.children.length })}
                    </NNBadge>
                  )}
                </div>

                {/* cards / due on mobile shows due only */}
                {isMobile ? (
                  <span
                    className="mono"
                    style={{
                      fontSize: 13,
                      color: agg.due > 0 ? 'var(--lime-400)' : 'var(--text-dim)',
                      textAlign: 'right',
                    }}
                  >
                    {agg.due}
                  </span>
                ) : (
                  <>
                    <span className="mono" style={{ fontSize: 13, color: 'var(--text)', textAlign: 'right' }}>
                      {agg.total}
                      {hasChildren && own.total > 0 && (
                        <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}> ({own.total})</span>
                      )}
                    </span>
                    <span
                      className="mono"
                      style={{ fontSize: 13, color: agg.due > 0 ? 'var(--lime-400)' : 'var(--text-dim)', textAlign: 'right' }}
                    >
                      {agg.due}
                    </span>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <Link href={`/editor?deck=${encodeURIComponent(d.id)}&from=decks`} style={{ textDecoration: 'none' }}>
                        <NNBtn size="sm" variant="ghost" icon="plus">
                          {t('decks.addCard')}
                        </NNBtn>
                      </Link>
                      {agg.due > 0 && (
                        <Link href={`/review?deck=${encodeURIComponent(d.id)}`} style={{ textDecoration: 'none' }}>
                          <NNBtn size="sm" variant="soft" icon="bolt">
                            {t('decks.review')}
                          </NNBtn>
                        </Link>
                      )}
                    </div>
                  </>
                )}

                {/* menu */}
                <div style={{ position: 'relative', justifySelf: 'end' }}>
                  <button
                    type="button"
                    onClick={() => setOpenMenuId(menuOpen ? null : d.id)}
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
                    <div
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
                        onClick={() => { setOpenMenuId(null); router.push(`/editor?deck=${encodeURIComponent(d.id)}&from=decks`); }}
                        style={menuItemStyle()}
                      >
                        <NNIcon name="plus" size={13} />
                        <span>{t('decks.addCard')}</span>
                      </button>
                      {agg.due > 0 && (
                        <button
                          type="button"
                          onClick={() => { setOpenMenuId(null); router.push(`/review?deck=${encodeURIComponent(d.id)}`); }}
                          style={menuItemStyle('var(--lime-400)')}
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
                          if (typeof window === 'undefined') return;
                          const next = window.prompt(t('decks.renamePrompt'), d.name)?.trim();
                          if (next && next !== d.name) {
                            try {
                              await updateDeck(d.id, { name: next });
                            } catch (err) {
                              console.error('updateDeck failed', err);
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
                          const choice = typeof window !== 'undefined'
                            ? window.prompt(t('decks.recolorPrompt', { options: COLOR_OPTIONS.join('/') }), d.color)
                            : null;
                          const next = choice?.trim() as DeckColor | undefined;
                          if (next && COLOR_OPTIONS.includes(next) && next !== d.color) {
                            try {
                              await updateDeck(d.id, { color: next });
                            } catch (err) {
                              console.error('updateDeck failed', err);
                            }
                          }
                        }}
                        style={menuItemStyle()}
                      >
                        <NNIcon name="tag" size={13} />
                        <span>{t('actions.recolor')}</span>
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

      {!isMobile && rows.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-dim)', fontSize: 11 }}>
          <NNPlant stage={Math.min(5, Math.floor(cards.length / 10))} size={40} />
          <div>
            <div style={{ color: 'var(--text-muted)' }}>{t('decks.totalCards', { n: cards.length })}</div>
            <div>{t('decks.gardenHint')}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  marginBottom: 6,
};

const menuItemStyle = (color?: string): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '8px 10px',
  background: 'transparent',
  border: 'none',
  borderRadius: 6,
  color: color ?? 'var(--text)',
  fontFamily: 'var(--font-sans)',
  fontSize: 12.5,
  textAlign: 'left',
  cursor: 'pointer',
});
