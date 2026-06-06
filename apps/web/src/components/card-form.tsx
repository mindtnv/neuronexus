'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NNBtn, NNBadge, NNTag, NNCard } from '@/components/ui';
import { useNN } from '@/lib/store';
import type { Card, NoteType } from '@/lib/types';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';
import { buildDeckTree, deckPathLabel, flattenTree } from '@/lib/decks';
import { renderCardHtml, SafeHtml } from '@/lib/render-card';
import type { FieldValues } from '@neuronexus/shared';

// ─────────────────────────────────────────────
// Note editor (Milestone 1, Phase 5a)
//
// The card editor is now a NOTE editor: pick a note-type (own or builtin), fill
// its DYNAMIC fields (one rich-text input per note-type field), see a live
// per-card preview rendered from the note-type template + the field values
// (DOMPurified via <SafeHtml>), then save → store.addNote / store.updateNote.
//
// Custom note-type AUTHORING (creating your own field/template sets) is Phase 5b
// — here we only support creating/editing notes of the existing note-types.
//
// Re-sync strategy (Critic C1 / Architect should-fix #8): an effect keyed on
// `card?.id` resets state whenever the selected card changes (browser inline
// prev/next that does NOT re-mount). Consumers may ALSO mount with
// `key={card?.id ?? 'new'}` — both paths are supported.
// ─────────────────────────────────────────────

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

// ── Rich-text field input ─────────────────────────────────────────────────────
//
// A contentEditable surface with a tiny toolbar (bold / italic / bullet list).
// The HTML it emits is sanitized at the server save edge; the live preview
// DOMPurifies it again. Uncontrolled (we read innerHTML on input + reset on
// `resetKey` change) to avoid caret jumps mid-edit.

const RichField = ({
  value,
  onChange,
  placeholder,
  serif,
  minHeight,
  autoFocus,
  resetKey,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  serif?: boolean;
  minHeight: number;
  autoFocus?: boolean;
  resetKey: string;
}) => {
  const t = useT();
  const ref = useRef<HTMLDivElement | null>(null);

  // Reset the DOM content when the edited entity changes (resetKey) — not on
  // every keystroke (that would reset the caret).
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, resetKey]);

  const exec = (command: string) => {
    ref.current?.focus();
    // execCommand is deprecated but remains the simplest cross-browser inline
    // rich-text primitive; the output HTML is sanitized at both edges.
    document.execCommand(command, false);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const btn = (cmd: string, label: string, title: string): React.ReactNode => (
    <button
      key={cmd}
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        exec(cmd);
      }}
      style={{
        minWidth: 28,
        height: 26,
        padding: '0 7px',
        borderRadius: 6,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  const isEmpty = !value || value === '<br>';

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        {btn('bold', 'B', t('editor.richText.bold'))}
        {btn('italic', 'I', t('editor.richText.italic'))}
        {btn('insertUnorderedList', '•', t('editor.richText.bulletList'))}
      </div>
      <div style={{ position: 'relative' }}>
        {isEmpty && placeholder && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 14,
              color: 'var(--text-dim)',
              fontFamily: serif ? 'var(--font-serif)' : 'var(--font-sans)',
              fontSize: serif ? 18 : 14,
              pointerEvents: 'none',
            }}
          >
            {placeholder}
          </div>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => onChange((e.currentTarget as HTMLDivElement).innerHTML)}
          style={{
            width: '100%',
            minHeight,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontFamily: serif ? 'var(--font-serif)' : 'var(--font-sans)',
            fontSize: serif ? 18 : 14,
            lineHeight: 1.5,
            outline: 'none',
            boxSizing: 'border-box',
            overflowWrap: 'anywhere',
          }}
        />
      </div>
    </div>
  );
};

export interface NNCardFormProps {
  /** The card to edit. Omit / null to create a new note. */
  card?: Card | null;
  /** Deck pre-selected when creating a new note. */
  defaultDeckId?: string;
  /** Called after a successful save (create or update) with a resulting card. */
  onSaved?: (card: Card) => void;
  /** Called after a successful delete with the deleted card id. */
  onDeleted?: (id: string) => void;
  /** Render the read-only FSRS side panel. Default true. */
  showFsrsPanel?: boolean;
  /** Auto-focus the first field when creating a new note. */
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
  const router = useRouter();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';

  const decks = useNN((s) => s.decks);
  const noteTypes = useNN((s) => s.noteTypes);
  const addNote = useNN((s) => s.addNote);
  const updateNote = useNN((s) => s.updateNote);
  const deleteNote = useNN((s) => s.deleteNote);

  const editing = card ?? null;

  // Default note-type: Basic if present, else the first available.
  const defaultNoteType = useMemo<NoteType | undefined>(() => {
    return noteTypes.find((nt) => nt.kind === 'basic') ?? noteTypes[0];
  }, [noteTypes]);

  // The note-type backing the form. When editing, prefer the card's embedded
  // noteType (it carries the templates needed to preview); fall back to the
  // store list by id.
  const editingNoteTypeId = editing?.noteType?.id ?? null;
  const editingNoteType = useMemo<NoteType | undefined>(() => {
    if (!editing) return undefined;
    const fromStore = editingNoteTypeId
      ? noteTypes.find((nt) => nt.id === editingNoteTypeId)
      : undefined;
    if (fromStore) return fromStore;
    // Synthesize from the embedded payload when the type isn't in the store.
    if (editing.noteType) {
      return {
        id: editing.noteType.id,
        name: editing.noteType.name || editing.noteType.kind,
        fields: [],
        templates: editing.noteType.templates,
        styling: editing.noteType.styling,
        kind: editing.noteType.kind,
        isBuiltin: true,
      };
    }
    return undefined;
  }, [editing, editingNoteTypeId, noteTypes]);

  const [noteTypeId, setNoteTypeId] = useState<string>(
    editingNoteTypeId ?? defaultNoteType?.id ?? '',
  );

  const resolvedDefaultDeckId = useMemo(() => {
    if (editing) return editing.deckId;
    if (defaultDeckId && decks.some((d) => d.id === defaultDeckId)) return defaultDeckId;
    return decks[0]?.id ?? '';
  }, [editing, defaultDeckId, decks]);

  const [deckId, setDeckId] = useState<string>(resolvedDefaultDeckId);
  const [fieldValues, setFieldValues] = useState<FieldValues>({});
  const [tagsText, setTagsText] = useState<string>(editing?.tags?.join(', ') ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The active note-type: the store entry for `noteTypeId`, or the editing one.
  const activeNoteType = useMemo<NoteType | undefined>(() => {
    return noteTypes.find((nt) => nt.id === noteTypeId) ?? editingNoteType;
  }, [noteTypes, noteTypeId, editingNoteType]);

  // The field set to render inputs for. When editing a synthesized type with no
  // fields, fall back to the field names present in the note's values.
  const fields = useMemo(() => {
    if (activeNoteType && activeNoteType.fields.length > 0) {
      return [...activeNoteType.fields].sort((a, b) => a.ord - b.ord);
    }
    const fv = editing?.note?.fieldValues ?? {};
    return Object.keys(fv).map((name, ord) => ({ name, ord }));
  }, [activeNoteType, editing]);

  const isCloze = activeNoteType?.kind === 'cloze';

  // Re-sync field state when the selected card / note-type changes.
  useEffect(() => {
    if (editing) {
      setDeckId(editing.deckId);
      setNoteTypeId(editing.noteType?.id ?? defaultNoteType?.id ?? '');
      setFieldValues({ ...(editing.note?.fieldValues ?? {}) });
      setTagsText(editing.tags.join(', '));
    } else {
      setDeckId(resolvedDefaultDeckId);
      setNoteTypeId(defaultNoteType?.id ?? '');
      setFieldValues({});
      setTagsText('');
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id, resolvedDefaultDeckId, defaultNoteType?.id]);

  const setField = useCallback((name: string, html: string) => {
    setFieldValues((prev) => ({ ...prev, [name]: html }));
  }, []);

  const tags = useMemo(
    () => tagsText.split(',').map((s) => s.trim()).filter(Boolean),
    [tagsText],
  );

  const currentDeck = decks.find((d) => d.id === deckId);

  // Live preview: render front + back HTML from the note-type template + the
  // current field values. The FIRST field is the "front" reference for the
  // required-field check. (Preview MUST still DOMPurify — shared only escapes.)
  const preview = useMemo(() => {
    if (!activeNoteType || activeNoteType.templates.length === 0) {
      return { front: '', back: '' };
    }
    return {
      front: renderCardHtml(activeNoteType, fieldValues, 'front'),
      back: renderCardHtml(activeNoteType, fieldValues, 'back'),
    };
  }, [activeNoteType, fieldValues]);

  const handleSave = async () => {
    setError(null);
    if (!deckId) {
      setError(t('editor.errors.pickDeck'));
      return;
    }
    if (!activeNoteType) {
      setError(t('editor.errors.pickNoteType'));
      return;
    }
    // At least the first field must be non-empty (mirrors the empty-front skip:
    // a note whose front renders empty generates no card).
    const firstField = fields[0]?.name;
    const firstValue = firstField ? (fieldValues[firstField] ?? '') : '';
    if (!stripHtml(firstValue).trim()) {
      setError(t('editor.errors.frontRequired'));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateNote(editing.noteId, { fieldValues, tags });
        const saved = useNN.getState().cards.find((c) => c.noteId === editing.noteId);
        if (saved) onSaved?.(saved);
      } else {
        const created = await addNote({
          noteTypeId: activeNoteType.id,
          deckId,
          fieldValues,
          tags,
        });
        if (created[0]) onSaved?.(created[0]);
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
      await deleteNote(editing.noteId);
      onDeleted?.(editing.id);
    } catch (err) {
      console.error('deleteNote failed', err);
      setError(err instanceof Error ? err.message : t('editor.errors.deleteFailed'));
    }
  };

  // ⌘/Ctrl+Enter triggers save.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!saving) void handleSave();
    }
  };

  const deckTone = (currentDeck?.color ?? 'neutral') as
    | 'neutral' | 'lime' | 'amber' | 'violet' | 'sky' | 'rose';

  // Stable reset key for the rich-text fields — changes when the edited entity
  // OR note-type changes (so inputs re-hydrate from `fieldValues`).
  const resetKey = `${editing?.id ?? 'new'}::${noteTypeId}`;

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

        {/* Deck + note-type selectors */}
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
            <div style={labelStyle}>
              <span>{t('editor.noteTypeLabel')}</span>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => router.push('/note-types')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--lime-400)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 11,
                  letterSpacing: 0,
                  textTransform: 'none',
                  cursor: 'pointer',
                }}
              >
                {t('editor.manageNoteTypes')}
              </button>
            </div>
            <select
              value={noteTypeId}
              onChange={(e) => setNoteTypeId(e.target.value)}
              // Changing the note-type only matters for NEW notes (an existing
              // note keeps its type; clone/convert is Phase 5b).
              disabled={!!editing || noteTypes.length === 0}
              style={{ ...inputStyle, opacity: editing ? 0.7 : 1 }}
            >
              {noteTypes.length === 0 && <option value="">{t('editor.noNoteTypes')}</option>}
              {noteTypes.map((nt) => (
                <option key={nt.id} value={nt.id}>
                  {nt.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic fields */}
        {fields.map((field, i) => {
          const isFront = i === 0;
          return (
            <div key={field.name} style={{ marginBottom: 14 }}>
              <div style={labelStyle}>
                <span>{field.name}</span>
                {isCloze && isFront && (
                  <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text-dim)' }}>
                    {t('editor.fields.clozeHint', { syntax: '{{c1::…}}' })}
                  </span>
                )}
              </div>
              <RichField
                value={fieldValues[field.name] ?? ''}
                onChange={(html) => setField(field.name, html)}
                placeholder={isFront ? t('editor.fields.frontPlaceholder') : undefined}
                serif={isFront}
                minHeight={isFront ? (isMobile ? 90 : 100) : isMobile ? 120 : 110}
                autoFocus={autoFocusFront && !editing && isFront}
                resetKey={resetKey}
              />
            </div>
          );
        })}

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

        {/* Live preview (front + back, rendered from the template, DOMPurified) */}
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
                <NNBadge size="xs" tone="neutral">{activeNoteType?.name ?? '—'}</NNBadge>
                {tags.map((tag, i) => (
                  <NNTag key={`pv-${tag}-${i}`} color={deckTone === 'neutral' ? 'sky' : deckTone}>{tag}</NNTag>
                ))}
              </div>
              {preview.front.trim() ? (
                <SafeHtml
                  html={preview.front}
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: isMobile ? 24 : 32,
                    lineHeight: 1.2,
                    letterSpacing: -0.5,
                    color: 'var(--text)',
                    fontWeight: 400,
                    wordBreak: 'break-word',
                  }}
                />
              ) : (
                <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-serif)', fontSize: isMobile ? 24 : 32 }}>
                  {t('editor.frontPreview')}
                </div>
              )}
              <div style={{
                height: 1,
                background: 'linear-gradient(to right, transparent, var(--border-2), transparent)',
              }}/>
              {preview.back.trim() ? (
                <SafeHtml
                  html={preview.back}
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 16,
                    color: 'var(--text-muted)',
                    lineHeight: 1.5,
                  }}
                />
              ) : (
                <div style={{ color: 'var(--text-dim)', fontSize: 16 }}>{t('editor.backPreview')}</div>
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

// Strip HTML tags → plaintext (for the required-field emptiness check). Pure
// string op; the actual sanitization happens at the save edge + render edge.
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
}
