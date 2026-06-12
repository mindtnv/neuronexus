'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseCardQuery, CardQueryError } from '@neuronexus/shared';
import { NNBtn, NNBadge, NNIcon } from '@/components/ui';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { useDialog } from '@/components/dialog';
import { NNSelect, type NNSelectOption } from '@/components/nn-select';
import { useBreakpoint } from '@/lib/use-breakpoint';
import type { FilteredDeck, FilteredDeckSortOrder } from '@/lib/types';

// ─────────────────────────────────────────────
// Quick-action definitions (canonical presets per plan Decision 5 / Phase 8)
// ─────────────────────────────────────────────

interface QuickAction {
  nameKey: string;
  descKey: string;
  query: string;
  sortOrder: FilteredDeckSortOrder;
  icon: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    nameKey: 'review.customStudy.quickActions.cram',
    descKey: 'review.customStudy.quickActions.cramDesc',
    query: '',
    sortOrder: 'cram',
    icon: 'bolt',
  },
  {
    nameKey: 'review.customStudy.quickActions.lapsed',
    descKey: 'review.customStudy.quickActions.lapsedDesc',
    query: 'prop:lapses>0',
    sortOrder: 'difficultyDesc',
    icon: 'flame',
  },
  {
    nameKey: 'review.customStudy.quickActions.hardFirst',
    descKey: 'review.customStudy.quickActions.hardFirstDesc',
    query: 'is:due',
    sortOrder: 'difficultyDesc',
    icon: 'target',
  },
];

const SORT_ORDER_VALUES: FilteredDeckSortOrder[] = [
  'due',
  'added',
  'random',
  'difficultyDesc',
  'overdue',
  'lapses',
  'cram',
];

function validateQuery(q: string): string | null {
  if (!q.trim()) return null; // empty query is valid (matches all cards)
  try {
    parseCardQuery(q);
    return null;
  } catch (err) {
    if (err instanceof CardQueryError) return err.message;
    return String(err);
  }
}

// ─────────────────────────────────────────────
// Inline form (create / edit)
// ─────────────────────────────────────────────

interface FormState {
  name: string;
  query: string;
  sortOrder: FilteredDeckSortOrder;
  cardLimit: number;
  includeSuspended: boolean;
}

interface FilteredDeckFormProps {
  initial?: Partial<FormState> & { id?: string };
  onClose: () => void;
  onSaved: (id: string) => void;
}

const FilteredDeckForm = ({ initial, onClose, onSaved }: FilteredDeckFormProps) => {
  const t = useT();
  const addFilteredDeck = useNN((s) => s.addFilteredDeck);
  const updateFilteredDeck = useNN((s) => s.updateFilteredDeck);

  const [name, setName] = useState(initial?.name ?? '');
  const [query, setQuery] = useState(initial?.query ?? '');
  const [sortOrder, setSortOrder] = useState<FilteredDeckSortOrder>(initial?.sortOrder ?? 'due');
  const [cardLimit, setCardLimit] = useState(initial?.cardLimit ?? 50);
  const [includeSuspended, setIncludeSuspended] = useState(initial?.includeSuspended ?? false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  const isEdit = !!initial?.id;

  const sortOrderOptions = useMemo<NNSelectOption<FilteredDeckSortOrder>[]>(
    () =>
      SORT_ORDER_VALUES.map((val) => ({
        value: val,
        label: t(`review.customStudy.sortOrders.${val}`),
      })),
    [t],
  );

  const handleSave = useCallback(async () => {
    setSaveError(null);
    const qErr = validateQuery(query);
    if (qErr) {
      setQueryError(qErr);
      return;
    }
    setQueryError(null);
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        query: query.trim(),
        sortOrder,
        cardLimit: Math.max(1, Math.min(1000, cardLimit)),
        includeSuspended,
      };
      if (isEdit && initial?.id) {
        const updated = await updateFilteredDeck(initial.id, payload);
        onSaved(updated.id);
      } else {
        const created = await addFilteredDeck(payload);
        onSaved(created.id);
      }
    } catch {
      setSaveError(t('review.customStudy.saveError'));
    } finally {
      setSaving(false);
    }
  }, [
    name, query, sortOrder, cardLimit, includeSuspended,
    isEdit, initial, addFilteredDeck, updateFilteredDeck, onSaved, t,
  ]);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    fontFamily: 'var(--font-sans)',
    borderRadius: 8,
    border: '1px solid var(--border-2)',
    background: 'var(--surface-2)',
    color: 'var(--text)',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginBottom: 4,
    display: 'block',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Name */}
      <div>
        <label style={labelStyle}>{t('review.customStudy.fieldName')}</label>
        <input
          style={inputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('review.customStudy.fieldNamePlaceholder')}
          autoFocus
        />
      </div>

      {/* Query */}
      <div>
        <label style={labelStyle}>{t('review.customStudy.fieldQuery')}</label>
        <input
          style={{
            ...inputStyle,
            borderColor: queryError ? 'var(--rose-500)' : 'var(--border-2)',
          }}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setQueryError(null);
          }}
          placeholder={t('review.customStudy.fieldQueryPlaceholder')}
        />
        {queryError ? (
          <span style={{ fontSize: 11.5, color: 'var(--rose-500)', marginTop: 3, display: 'block' }}>
            {t('review.customStudy.queryError', { error: queryError })}
          </span>
        ) : (
          <span style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 3, display: 'block' }}>
            {t('review.customStudy.fieldQueryHint')}
          </span>
        )}
      </div>

      {/* Sort order */}
      <div>
        <label style={labelStyle}>{t('review.customStudy.fieldSortOrder')}</label>
        <NNSelect<FilteredDeckSortOrder>
          value={sortOrder}
          onChange={setSortOrder}
          options={sortOrderOptions}
          ariaLabel={t('review.customStudy.fieldSortOrder')}
        />
      </div>

      {/* Card limit */}
      <div>
        <label style={labelStyle}>{t('review.customStudy.fieldCardLimit')}</label>
        <input
          style={inputStyle}
          type="number"
          min={1}
          max={1000}
          value={cardLimit}
          onChange={(e) => setCardLimit(Number(e.target.value) || 50)}
        />
      </div>

      {/* Include suspended */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => setIncludeSuspended((v) => !v)}
          style={{
            width: 36,
            height: 20,
            borderRadius: 10,
            background: includeSuspended ? 'var(--lime-500)' : 'var(--surface-3)',
            border: 'none',
            cursor: 'pointer',
            position: 'relative',
            transition: 'background 160ms ease',
            flexShrink: 0,
          }}
          aria-pressed={includeSuspended}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: includeSuspended ? 18 : 2,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: 'var(--text)',
              transition: 'left 160ms ease',
            }}
          />
        </button>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {t('review.customStudy.fieldIncludeSuspended')}
        </span>
      </div>

      {saveError && (
        <span style={{ fontSize: 12, color: 'var(--rose-500)' }}>{saveError}</span>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <NNBtn size="md" variant="ghost" onClick={onClose}>
          {t('review.customStudy.actions.cancel')}
        </NNBtn>
        <NNBtn
          size="md"
          variant="primary"
          onClick={handleSave}
          disabled={saving || !name.trim()}
        >
          {saving ? '…' : (isEdit ? t('review.customStudy.actions.save') : t('review.customStudy.actions.create'))}
        </NNBtn>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Main Custom Study screen
// ─────────────────────────────────────────────

export const NNCustomStudy = () => {
  const t = useT();
  const { confirm } = useDialog();
  const router = useRouter();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';

  const filteredDecks = useNN((s) => s.filteredDecks);
  const addFilteredDeck = useNN((s) => s.addFilteredDeck);
  const deleteFilteredDeck = useNN((s) => s.deleteFilteredDeck);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FilteredDeck | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [quickActionError, setQuickActionError] = useState<string | null>(null);

  const openCreate = () => {
    setEditTarget(null);
    setFormOpen(true);
  };

  const openEdit = (fd: FilteredDeck) => {
    setEditTarget(fd);
    setFormOpen(true);
  };

  const handleSaved = useCallback(
    (id: string) => {
      setFormOpen(false);
      setEditTarget(null);
      // Navigate to the reviewer with this filtered deck
      router.push(`/review?filteredDeckId=${id}`);
    },
    [router],
  );

  const handleStudy = useCallback(
    (id: string) => {
      router.push(`/review?filteredDeckId=${id}`);
    },
    [router],
  );

  const handleDelete = useCallback(
    async (fd: FilteredDeck) => {
      if (!(await confirm({ title: t('review.customStudy.deleteConfirm', { name: fd.name }), danger: true }))) return;
      setDeletingId(fd.id);
      setDeleteError(null);
      try {
        await deleteFilteredDeck(fd.id);
      } catch {
        setDeleteError(t('review.customStudy.deleteError'));
      } finally {
        setDeletingId(null);
      }
    },
    [deleteFilteredDeck, t, confirm],
  );

  const handleQuickAction = useCallback(
    async (action: QuickAction) => {
      setQuickActionError(null);
      try {
        const created = await addFilteredDeck({
          name: t(action.nameKey),
          query: action.query,
          sortOrder: action.sortOrder,
          cardLimit: 100,
          includeSuspended: action.sortOrder === 'cram',
        });
        router.push(`/review?filteredDeckId=${created.id}`);
      } catch {
        setQuickActionError(t('review.customStudy.saveError'));
      }
    },
    [addFilteredDeck, router, t],
  );

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: isMobile ? '16px 14px 32px' : '24px 32px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        maxWidth: 680,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Header */}
      <div>
        <h1 className="nn-h1" style={{ marginBottom: 4 }}>
          {t('review.customStudy.title')}
        </h1>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {t('review.customStudy.subtitle')}
        </div>
      </div>

      {/* Quick actions */}
      <section>
        <div className="nn-section-label">{t('review.customStudy.quickActions.title')}</div>
        {quickActionError && (
          <div style={{ fontSize: 12, color: 'var(--rose-500)', marginBottom: 8 }}>{quickActionError}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.nameKey}
              type="button"
              onClick={() => handleQuickAction(action)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 10,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                color: 'var(--text)',
                fontFamily: 'var(--font-sans)',
                textAlign: 'left',
                transition: 'background 120ms ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)';
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'var(--surface-3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: 'var(--lime-500)',
                }}
              >
                <NNIcon name={action.icon} size={16} color="var(--lime-500)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>
                  {t(action.nameKey)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.3 }}>
                  {t(action.descKey)}
                </div>
              </div>
              <NNIcon name="chevr" size={14} color="var(--text-dim)" />
            </button>
          ))}
        </div>
      </section>

      {/* Saved sessions */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="nn-section-label">{t('review.customStudy.sessions')}</div>
          <NNBtn size="sm" variant="soft" icon="plus" onClick={openCreate}>
            {t('review.customStudy.createNew')}
          </NNBtn>
        </div>

        {/* Inline form */}
        {formOpen && (
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '16px 16px 12px',
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>
              {editTarget
                ? t('review.customStudy.actions.edit')
                : t('review.customStudy.createNew')}
            </div>
            <FilteredDeckForm
              initial={editTarget ?? undefined}
              onClose={() => { setFormOpen(false); setEditTarget(null); }}
              onSaved={handleSaved}
            />
          </div>
        )}

        {filteredDecks.length === 0 && !formOpen ? (
          <div
            className="nn-empty-state"
            style={{
              borderRadius: 10,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <span className="nn-empty-state-icon"><NNIcon name="filter" size={24} color="var(--text-dim)" /></span>
            <p className="nn-empty-state-hint">{t('review.customStudy.noSessions')}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredDecks.map((fd) => (
              <div
                key={fd.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fd.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {fd.query && (
                      <span className="mono" style={{ color: 'var(--text-muted)' }}>{fd.query}</span>
                    )}
                    <NNBadge size="xs" tone="neutral">
                      {t(`review.customStudy.sortOrders.${fd.sortOrder}`)}
                    </NNBadge>
                    <span>{fd.cardLimit}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <NNBtn
                    size="sm"
                    variant="ghost"
                    onClick={() => openEdit(fd)}
                    icon="edit"
                  />
                  <NNBtn
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(fd)}
                    disabled={deletingId === fd.id}
                    icon="x"
                  />
                  <NNBtn
                    size="sm"
                    variant="primary"
                    onClick={() => handleStudy(fd.id)}
                    icon="play"
                  >
                    {t('review.customStudy.actions.study')}
                  </NNBtn>
                </div>
              </div>
            ))}
          </div>
        )}

        {deleteError && (
          <div style={{ fontSize: 12, color: 'var(--rose-500)', marginTop: 6 }}>{deleteError}</div>
        )}
      </section>
    </div>
  );
};
