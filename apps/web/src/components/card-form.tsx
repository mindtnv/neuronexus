'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NNBtn, NNBadge, NNTag, NNCard } from '@/components/ui';
import { useNN } from '@/lib/store';
import type { Card, CardVariant } from '@/lib/types';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';
import { buildDeckTree, deckPathLabel, flattenTree } from '@/lib/decks';

// ─────────────────────────────────────────────
// Reusable card create/edit form
//
// Re-sync strategy (Critic C1 / Architect should-fix #8): this component keeps
// an internal effect keyed on `card?.id` so its field state resets whenever the
// selected card changes (e.g. the browser inline-panel prev/next that does NOT
// re-mount). Consumers that drive selection by URL/router may ALSO mount with
// `key={card?.id ?? 'new'}` for belt-and-braces — both paths are supported and
// the effect alone is sufficient.
// ─────────────────────────────────────────────

const VARIANT_DEFS: { value: CardVariant; i18nKey: string; tone: 'lime' | 'violet' | 'amber' }[] = [
  { value: 'basic', i18nKey: 'editor.variants.basic', tone: 'lime' },
  { value: 'cloze', i18nKey: 'editor.variants.cloze', tone: 'violet' },
  { value: 'type', i18nKey: 'editor.variants.type', tone: 'amber' },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const textareaStyle = (
  opts: { size: 'front' | 'back' | 'cloze'; serif?: boolean; mobile?: boolean },
): React.CSSProperties => {
  const { size, serif, mobile } = opts;
  const isFront = size === 'front';
  const fontSize = isFront ? (mobile ? 22 : 28) : 15;
  const minHeight =
    isFront
      ? (mobile ? 110 : 120)
      : size === 'back'
      ? (mobile ? 200 : 180)
      : (mobile ? 160 : 140);
  return {
    width: '100%',
    padding: isFront ? (mobile ? '16px 16px' : '20px 18px') : '14px 16px',
    borderRadius: 10,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    fontFamily: serif ? 'var(--font-serif)' : 'var(--font-sans)',
    fontSize,
    lineHeight: 1.5,
    resize: 'vertical',
    minHeight,
    outline: 'none',
    boxSizing: 'border-box',
    display: 'block',
  };
};

// Keep textareas growing as the user types so long answers are fully visible.
const autosize = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = 'auto';
  const min = parseInt(getComputedStyle(el).minHeight) || 0;
  el.style.height = `${Math.max(el.scrollHeight, min)}px`;
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  marginBottom: 6,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

export interface NNCardFormProps {
  /** The card to edit. Omit / null to create a new card. */
  card?: Card | null;
  /** Deck pre-selected when creating a new card. */
  defaultDeckId?: string;
  /** Called after a successful save (create or update) with the resulting card. */
  onSaved?: (card: Card) => void;
  /** Called after a successful delete with the deleted card id. */
  onDeleted?: (id: string) => void;
  /** Render the read-only FSRS side panel. Default true. */
  showFsrsPanel?: boolean;
  /** Auto-focus the front textarea when creating a new card. */
  autoFocusFront?: boolean;
  /** Extra controls rendered in the top action bar (e.g. prev/next). */
  footerExtra?: React.ReactNode;
}

export const NNCardForm = ({
  card,
  defaultDeckId,
  onSaved,
  onDeleted,
  showFsrsPanel = true,
  autoFocusFront = false,
  footerExtra,
}: NNCardFormProps) => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';

  const decks = useNN((s) => s.decks);
  const addCard = useNN((s) => s.addCard);
  const updateCard = useNN((s) => s.updateCard);
  const deleteCard = useNN((s) => s.deleteCard);

  const editing = card ?? null;

  const resolvedDefaultDeckId = useMemo(() => {
    if (editing) return editing.deckId;
    if (defaultDeckId && decks.some((d) => d.id === defaultDeckId)) return defaultDeckId;
    return decks[0]?.id ?? '';
  }, [editing, defaultDeckId, decks]);

  const [deckId, setDeckId] = useState<string>(resolvedDefaultDeckId);
  const [variant, setVariant] = useState<CardVariant>(editing?.variant ?? 'basic');
  const [front, setFront] = useState<string>(editing?.front ?? '');
  const [back, setBack] = useState<string>(editing?.back ?? '');
  const [clozeText, setClozeText] = useState<string>(editing?.clozeText ?? '');
  const [tagsText, setTagsText] = useState<string>(editing?.tags?.join(', ') ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const frontRef = useRef<HTMLTextAreaElement | null>(null);
  const backRef = useRef<HTMLTextAreaElement | null>(null);
  const clozeRef = useRef<HTMLTextAreaElement | null>(null);

  // Re-sync field state when the selected card changes (navigation inside the
  // editor, or prev/next within the browser inline panel). Keyed on card?.id so
  // it survives a non-remounting parent.
  useEffect(() => {
    if (editing) {
      setDeckId(editing.deckId);
      setVariant(editing.variant);
      setFront(editing.front);
      setBack(editing.back);
      setClozeText(editing.clozeText ?? '');
      setTagsText(editing.tags.join(', '));
    } else {
      setDeckId(resolvedDefaultDeckId);
      setVariant('basic');
      setFront('');
      setBack('');
      setClozeText('');
      setTagsText('');
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id, resolvedDefaultDeckId]);

  // Initial + content-driven auto-size for all textareas.
  useEffect(() => {
    autosize(frontRef.current);
    autosize(backRef.current);
    autosize(clozeRef.current);
  }, [front, back, clozeText, variant, isMobile]);

  // AC16: focus the front field when creating a new card.
  useEffect(() => {
    if (autoFocusFront && !editing) {
      frontRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocusFront, editing?.id]);

  const tags = useMemo(
    () => tagsText.split(',').map((s) => s.trim()).filter(Boolean),
    [tagsText],
  );

  const currentDeck = decks.find((d) => d.id === deckId);

  const handleSave = async () => {
    setError(null);
    if (!deckId) {
      setError(t('editor.errors.pickDeck'));
      return;
    }
    if (!front.trim() && variant !== 'cloze') {
      setError(t('editor.errors.frontRequired'));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateCard(editing.id, {
          deckId, // moves the card to another deck (server verifies ownership)
          variant,
          front: front.trim(),
          back: back.trim(),
          clozeText: variant === 'cloze' ? clozeText.trim() : undefined,
          tags,
        });
        const saved = useNN.getState().cards.find((c) => c.id === editing.id);
        if (saved) onSaved?.(saved);
      } else {
        const created = await addCard({
          deckId,
          variant,
          front: front.trim(),
          back: back.trim(),
          clozeText: variant === 'cloze' ? clozeText.trim() : undefined,
          tags,
        });
        onSaved?.(created);
      }
    } catch (err) {
      console.error('save failed', err);
      setError(err instanceof Error ? err.message : t('editor.errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (typeof window !== 'undefined' && !window.confirm(t('editor.deleteConfirm'))) return;
    try {
      await deleteCard(editing.id);
      onDeleted?.(editing.id);
    } catch (err) {
      console.error('deleteCard failed', err);
      setError(err instanceof Error ? err.message : t('editor.errors.deleteFailed'));
    }
  };

  // AC16: ⌘/Ctrl+Enter triggers save.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!saving) void handleSave();
    }
  };

  const deckTone = (currentDeck?.color ?? 'neutral') as
    | 'neutral' | 'lime' | 'amber' | 'violet' | 'sky' | 'rose';

  return (
    <div
      onKeyDown={handleKeyDown}
      style={{
        flex: 1,
        display: isMobile ? 'flex' : showFsrsPanel ? 'grid' : 'flex',
        flexDirection: isMobile || !showFsrsPanel ? 'column' : undefined,
        gridTemplateColumns: isMobile || !showFsrsPanel ? undefined : '1fr 360px',
        overflow: isMobile ? 'auto' : 'hidden',
      }}
    >
      <div style={{ padding: isMobile ? '16px 14px' : 24, overflow: isMobile ? 'visible' : 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <NNBadge tone={deckTone} size="sm">{currentDeck?.name ?? t('editor.noDeck')}</NNBadge>
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>/</span>
          <span style={{ fontSize: 13, color: 'var(--text)' }}>
            {editing ? t('editor.editingCard', { id: editing.id.slice(0, 6) }) : t('editor.newCard')}
          </span>
          <div style={{ flex: 1 }}/>
          {footerExtra}
          {editing && (
            <NNBtn size="sm" variant="danger" icon="x" onClick={handleDelete}>{t('actions.delete')}</NNBtn>
          )}
          <NNBtn size="sm" variant="primary" icon="check" onClick={handleSave}>
            {saving ? t('editor.saving') : editing ? t('actions.save') : t('actions.create')}
          </NNBtn>
        </div>

        {/* Deck + variant selectors */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 8 : 12, marginBottom: 16 }}>
          <div>
            <div style={labelStyle}><span>{t('editor.deckLabel')}</span></div>
            <select
              value={deckId}
              onChange={(e) => setDeckId(e.target.value)}
              style={inputStyle}
            >
              {decks.length === 0 && <option value="">{t('editor.noDecksYet')}</option>}
              {flattenTree(buildDeckTree(decks), new Set(decks.map((d) => d.id))).map((node) => {
                const prefix = node.depth > 0 ? '— '.repeat(node.depth) : '';
                return (
                  <option key={node.deck.id} value={node.deck.id}>
                    {prefix}{node.deck.name}
                  </option>
                );
              })}
            </select>
            {currentDeck && currentDeck.parentId && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                {deckPathLabel(decks, currentDeck.id)}
              </div>
            )}
          </div>
          <div>
            <div style={labelStyle}><span>{t('editor.variantLabel')}</span></div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', height: 38 }}>
              {VARIANT_DEFS.map((v) => {
                const active = variant === v.value;
                return (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => setVariant(v.value)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                    }}
                  >
                    <NNBadge tone={active ? v.tone : 'neutral'} size="md">{t(v.i18nKey)}</NNBadge>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Fields */}
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}><span>{t('editor.fields.front')}</span></div>
          <textarea
            ref={frontRef}
            value={front}
            onChange={(e) => setFront(e.target.value)}
            onInput={(e) => autosize(e.currentTarget)}
            placeholder={t('editor.fields.frontPlaceholder')}
            style={textareaStyle({ size: 'front', serif: true, mobile: isMobile })}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>
            <span>{t('editor.fields.back')}</span>
            <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text-dim)' }}>
              {t(back.length === 1 ? 'editor.fields.backCharsSingular' : 'editor.fields.backCharsPlural', { n: back.length })}
            </span>
          </div>
          <textarea
            ref={backRef}
            value={back}
            onChange={(e) => setBack(e.target.value)}
            onInput={(e) => autosize(e.currentTarget)}
            placeholder={t('editor.fields.backPlaceholder')}
            style={textareaStyle({ size: 'back', serif: true, mobile: isMobile })}
          />
        </div>

        {variant === 'cloze' && (
          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>
              <span>{t('editor.fields.clozeText')}</span>
              <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text-dim)' }}>
                {t('editor.fields.clozeHint', { syntax: '{{c1::…}}' })}
              </span>
            </div>
            <textarea
              ref={clozeRef}
              value={clozeText}
              onChange={(e) => setClozeText(e.target.value)}
              onInput={(e) => autosize(e.currentTarget)}
              placeholder={t('editor.fields.clozePlaceholder')}
              style={textareaStyle({ size: 'cloze', mobile: isMobile })}
            />
          </div>
        )}

        {/* Tags */}
        <div style={{ marginTop: 16 }}>
          <div style={labelStyle}><span>{t('editor.tagsLinks')}</span></div>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder={t('editor.tagsPlaceholder')}
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6, padding: 10,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            minHeight: 42, alignItems: 'center',
          }}>
            {tags.length === 0 ? (
              <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{t('editor.noTags')}</span>
            ) : tags.map((tag, i) => (
              <NNTag key={`${tag}-${i}`} color={deckTone === 'neutral' ? 'sky' : deckTone}>{tag}</NNTag>
            ))}
          </div>
        </div>

        {error && (
          <div style={{
            marginTop: 14, padding: '10px 12px',
            background: 'rgba(232,120,138,0.08)', border: '1px solid rgba(232,120,138,0.28)',
            borderRadius: 10, color: 'var(--rose-400)', fontSize: 12.5,
          }}>
            {error}
          </div>
        )}

        {/* Live preview */}
        <div style={{ marginTop: 22 }}>
          <div style={labelStyle}><span>{t('editor.preview')}</span></div>
          <NNCard padding={0} style={{ overflow: 'hidden' }}>
            <div style={{
              padding: isMobile ? '18px 16px' : '28px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: isMobile ? 14 : 20,
            }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <NNBadge size="xs" tone="neutral">{variant}</NNBadge>
                {tags.map((tag, i) => (
                  <NNTag key={`pv-${tag}-${i}`} color={deckTone === 'neutral' ? 'sky' : deckTone}>{tag}</NNTag>
                ))}
              </div>
              <div style={{
                fontFamily: 'var(--font-serif)',
                fontSize: isMobile ? 28 : 40,
                lineHeight: 1.15,
                letterSpacing: -1,
                color: 'var(--text)',
                fontWeight: 400,
                wordBreak: 'break-word',
              }}>
                {front.trim() || <span style={{ color: 'var(--text-dim)' }}>{t('editor.frontPreview')}</span>}
              </div>
              <div style={{
                height: 1,
                background: 'linear-gradient(to right, transparent, var(--border-2), transparent)',
              }}/>
              <div style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 16,
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}>
                {back.trim() || <span style={{ color: 'var(--text-dim)' }}>{t('editor.backPreview')}</span>}
              </div>
              {variant === 'cloze' && clozeText.trim() && (
                <div style={{
                  fontSize: 13,
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--font-sans)',
                  padding: '10px 12px',
                  background: 'var(--surface-2)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}>
                  {clozeText}
                </div>
              )}
            </div>
          </NNCard>
        </div>
      </div>

      {/* Right: FSRS params (read-only). Hidden when showFsrsPanel is false. */}
      {showFsrsPanel && (
        <aside style={{
          borderLeft: isMobile ? 'none' : '1px solid var(--border)',
          borderTop: isMobile ? '1px solid var(--border)' : 'none',
          background: 'var(--surface)',
          overflow: isMobile ? 'visible' : 'auto',
          width: isMobile ? '100%' : undefined,
        }}>
          <div style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t('editor.fsrsParams')}</div>
              <div style={{ flex: 1 }}/>
            </div>
            {editing ? (
              (() => {
                const fsrs = editing.fsrs;
                const rows: { l: string; v: string; c: string }[] = [
                  { l: t('editor.fsrsLabels.stability'), v: t('editor.stabilityDays', { n: fsrs.stability?.toFixed?.(1) ?? '-' }), c: 'lime' },
                  { l: t('editor.fsrsLabels.difficulty'), v: `${fsrs.difficulty?.toFixed?.(1) ?? '-'}`, c: 'amber' },
                  { l: t('editor.fsrsLabels.reps'), v: `${fsrs.reps ?? 0}`, c: 'lime' },
                  { l: t('editor.fsrsLabels.lapses'), v: `${fsrs.lapses ?? 0}`, c: fsrs.lapses ? 'rose' : 'lime' },
                ];
                return rows.map((p) => (
                  <div key={p.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12.5 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{p.l}</span>
                    <span className="mono" style={{ color: `var(--${p.c}-400)` }}>{p.v}</span>
                  </div>
                ));
              })()
            ) : (
              [
                t('editor.fsrsLabels.stability'),
                t('editor.fsrsLabels.difficulty'),
                t('editor.fsrsLabels.retrievability'),
                t('editor.fsrsLabels.lastGrade'),
              ].map((l) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                  <span className="mono" style={{ color: 'var(--neutral-400)' }}>—</span>
                </div>
              ))
            )}
          </div>
        </aside>
      )}
    </div>
  );
};
