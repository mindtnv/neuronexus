'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NNBtn, NNBadge, NNTag, NNCard, NNIcon } from '@/components/ui';
import { useNN } from '@/lib/store';
import type { Card, NoteType } from '@/lib/types';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';
import { useDialog } from '@/components/dialog';
import { NNSelect, type NNSelectOption } from '@/components/nn-select';
import { buildDeckTree, deckPathLabel, flattenTree } from '@/lib/decks';
import { renderCardHtml } from '@/lib/render-card';
import { RichCard } from '@/components/rich-card';
import {
  MAX_MEDIA_BYTES,
  MAX_MEDIA_LABEL,
  MEDIA_MIME_ALLOWLIST,
  type FieldValues,
} from '@neuronexus/shared';

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

// Client-side image pre-checks (server re-validates at presign + finalize). The
// allowlist + cap come from @neuronexus/shared (single source of truth, mirrored
// by the server) — they're a fast UX gate, not the security boundary. The label
// is derived from the byte cap so the copy can never drift from the real limit.
const ALLOWED_IMAGE_TYPES: readonly string[] = MEDIA_MIME_ALLOWLIST;
const MAX_IMAGE_BYTES = MAX_MEDIA_BYTES;
const MAX_IMAGE_LABEL = MAX_MEDIA_LABEL;

// ── Markdown-source field input ───────────────────────────────────────────────
//
// A plain <textarea> holding the field's RAW MARKDOWN source (NOT HTML). The
// value is the literal text the user typed; Enter is a newline (`\n`), never a
// `<div>`. A tiny toolbar inserts MARKDOWN syntax (bold/italic/code/list/heading)
// around the textarea selection, plus image upload (inserts `![](/m/<uuid>)`) and
// LaTeX (`\(\)`). The markdown → HTML render + sanitize happens entirely at the
// render edge (render-card.tsx); this editor produces no HTML at all.

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
  onChange: (markdown: string) => void;
  placeholder?: string;
  serif?: boolean;
  minHeight: number;
  autoFocus?: boolean;
  resetKey: string;
}) => {
  const t = useT();
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadMedia = useNN((s) => s.uploadMedia);
  const [uploading, setUploading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Auto-grow: keep the textarea height matched to its content (no scrollbar mid-
  // edit). Runs on every value change AND on entity switch (resetKey).
  const autoGrow = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [minHeight]);

  useEffect(() => {
    autoGrow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, resetKey, autoGrow]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, resetKey]);

  // Replace the current textarea selection with `next`, then restore the caret to
  // `[selStart, selEnd]` (offsets into the NEW value) and propagate via onChange.
  const applyEdit = (next: string, selStart: number, selEnd: number) => {
    onChange(next);
    // Restore selection after React commits the controlled value.
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selStart, selEnd);
      autoGrow();
    });
  };

  // Wrap the current selection in `before…after` markers. Empty selection → insert
  // the markers and place the caret between them so the user types inside.
  const wrap = (before: string, after: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    if (start === end) {
      const caret = start + before.length;
      applyEdit(next, caret, caret);
    } else {
      applyEdit(next, start + before.length, start + before.length + selected.length);
    }
  };

  // Prefix every line touched by the selection with `prefix` (markdown list /
  // heading). With an empty selection, prefix the current line.
  const prefixLines = (prefix: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    // Expand the range to whole lines.
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = value.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = value.length;
    const block = value.slice(lineStart, lineEnd);
    const prefixed = block
      .split('\n')
      .map((line) => prefix + line)
      .join('\n');
    const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
    applyEdit(next, lineStart, lineStart + prefixed.length);
  };

  // Insert raw text at the caret (replacing any selection), optionally placing the
  // caret `caretBack` chars from the end of the inserted text.
  const insertAtCaret = (text: string, caretBack = 0) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = value.slice(0, start) + text + value.slice(end);
    const caret = start + text.length - caretBack;
    applyEdit(next, caret, caret);
  };

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file again re-triggers change.
    e.target.value = '';
    if (!file) return;
    setMediaError(null);
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setMediaError(t('editor.media.badType'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setMediaError(t('editor.media.tooLarge', { size: MAX_IMAGE_LABEL }));
      return;
    }
    // Capture the caret BEFORE the await — focus may move during upload.
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    setUploading(true);
    try {
      const { token } = await uploadMedia(file);
      // Insert MARKDOWN image syntax with the RELATIVE token only — markdown-it
      // renders it to `<img src="/m/<uuid>">`, the sole img-src shape the render
      // edge's MEDIA_TOKEN_RE keeps; a Next `/m/:uuid` rewrite resolves it at
      // display time. Alt is the file name (sans extension) for accessibility.
      const alt = file.name.replace(/\.[^.]+$/, '');
      const snippet = `![${alt}](${token})`;
      const next = value.slice(0, start) + snippet + value.slice(end);
      const caret = start + snippet.length;
      applyEdit(next, caret, caret);
    } catch (err) {
      console.error('image upload failed', err);
      setMediaError(t('editor.media.failed'));
    } finally {
      setUploading(false);
    }
  };

  // Insert the inline-math delimiters and place the caret between them so the user
  // types the formula inside. The field stores raw LaTeX; KaTeX renders it.
  const onInsertMath = () => insertAtCaret('\\(\\)', 2);

  // textarea keydown: Tab navigates between sibling fields (never inserts a tab
  // char) so the multi-field flow keeps its keyboard ergonomics.
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      const container = ref.current?.closest('[data-nn-fields]');
      if (!container) return;
      const fields = Array.from(
        container.querySelectorAll<HTMLTextAreaElement>('textarea[data-nn-field]'),
      );
      const idx = fields.indexOf(ref.current as HTMLTextAreaElement);
      if (idx === -1) return;
      const nextIdx = e.shiftKey ? idx - 1 : idx + 1;
      // Inside the ring: move to the sibling and swallow Tab (no tab char).
      // At the ends (out of range): let the browser move focus out naturally.
      if (nextIdx >= 0 && nextIdx <= fields.length - 1) {
        e.preventDefault();
        fields[nextIdx]?.focus();
      }
    }
  };

  // A toolbar button wired to a custom activation handler. `onMouseDown` +
  // preventDefault keeps the textarea selection alive when the button is pressed.
  const toolBtn = (
    key: string,
    content: React.ReactNode,
    title: string,
    onActivate: () => void,
    disabled?: boolean,
  ): React.ReactNode => (
    <button
      key={key}
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        if (!disabled) onActivate();
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
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {content}
    </button>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {toolBtn('bold', 'B', t('editor.richText.bold'), () => wrap('**', '**'))}
        {toolBtn('italic', 'I', t('editor.richText.italic'), () => wrap('_', '_'))}
        {toolBtn('code', '`', t('editor.richText.inlineCode'), () => wrap('`', '`'))}
        {toolBtn('heading', 'H', t('editor.richText.heading'), () => prefixLines('# '))}
        {toolBtn('list', '•', t('editor.richText.bulletList'), () => prefixLines('- '))}
        {toolBtn(
          'image',
          <NNIcon name="image" size={14} />,
          t('editor.richText.image'),
          () => fileInputRef.current?.click(),
          uploading,
        )}
        {toolBtn('math', 'ƒₓ', t('editor.richText.math'), onInsertMath)}
        {uploading && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 2 }}>
            {t('editor.media.uploading')}
          </span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(',')}
          onChange={onPickImage}
          style={{ display: 'none' }}
        />
      </div>
      {mediaError && (
        <div style={{ fontSize: 11.5, color: 'var(--rose-400)', marginBottom: 6 }}>
          {mediaError}
        </div>
      )}
      <textarea
        ref={ref}
        data-nn-field
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onInput={autoGrow}
        onKeyDown={onKeyDown}
        rows={1}
        spellCheck
        style={{
          width: '100%',
          minHeight,
          padding: '12px 14px',
          borderRadius: 10,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          // Markdown SOURCE → monospace reads better; the front field stays serif
          // to echo its display weight while still being a plain source editor.
          fontFamily: serif ? 'var(--font-serif)' : 'var(--font-mono)',
          fontSize: serif ? 18 : 14,
          lineHeight: 1.5,
          outline: 'none',
          boxSizing: 'border-box',
          overflowWrap: 'anywhere',
          resize: 'vertical',
          display: 'block',
        }}
      />
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
  /** Render the compact read-only FSRS status line in the header (existing cards only). Default true. */
  showFsrsHeader?: boolean;
  /** Auto-focus the first field when creating a new note. */
  autoFocusFront?: boolean;
  /** Extra controls rendered in the top action bar (e.g. prev/next). */
  footerExtra?: React.ReactNode;
  /**
   * Layout hint. `'panel'` (default) is the tall side/standalone form; `'dock'`
   * lays the dynamic fields out in two columns on non-mobile to suit the
   * wide-short bottom dock in the cards browser.
   */
  layout?: 'panel' | 'dock';
}

export const NNCardForm = ({
  card,
  defaultDeckId,
  onSaved,
  onDeleted,
  showFsrsHeader = true,
  autoFocusFront = false,
  footerExtra,
  layout = 'panel',
}: NNCardFormProps) => {
  const t = useT();
  const { confirm } = useDialog();
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

  // Preview flip card (replaces the always-on dual front+back inline preview).
  const [showPreview, setShowPreview] = useState(false);
  const [flipped, setFlipped] = useState(false);

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

  const setField = useCallback((name: string, markdown: string) => {
    setFieldValues((prev) => ({ ...prev, [name]: markdown }));
  }, []);

  const tags = useMemo(
    () => tagsText.split(',').map((s) => s.trim()).filter(Boolean),
    [tagsText],
  );

  const currentDeck = decks.find((d) => d.id === deckId);

  // Deck options for NNSelect: nested rows (indented when not searching) carrying
  // the full deck path as `searchText` so filtering + the trigger show hierarchy.
  const deckOptions = useMemo<NNSelectOption<string>[]>(
    () =>
      flattenTree(buildDeckTree(decks), new Set(decks.map((d) => d.id))).map((node) => ({
        value: node.deck.id,
        label: node.deck.name,
        depth: node.depth,
        searchText: deckPathLabel(decks, node.deck.id),
      })),
    [decks],
  );

  const noteTypeOptions = useMemo<NNSelectOption<string>[]>(
    () => noteTypes.map((nt) => ({ value: nt.id, label: nt.name })),
    [noteTypes],
  );

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
    // a note whose front renders empty generates no card). The value is now raw
    // markdown source, so a plain trim is the emptiness test.
    const firstField = fields[0]?.name;
    const firstValue = firstField ? (fieldValues[firstField] ?? '') : '';
    if (!firstValue.trim()) {
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
    if (!(await confirm({ title: t('editor.deleteConfirm'), danger: true }))) return;
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
        display: 'flex',
        flexDirection: 'column',
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

        {/* Compact FSRS status line — existing cards only, when the header is on.
            New cards / browser inline editor render nothing (no em-dash rows). */}
        {editing && showFsrsHeader && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: isMobile ? 10 : 16,
            marginBottom: 18, fontSize: 12, color: 'var(--text-dim)',
          }}>
            {(() => {
              const fsrs = editing.fsrs;
              const rows: { l: string; v: string }[] = [
                { l: t('editor.fsrsLabels.stability'), v: t('editor.stabilityDays', { n: fsrs.stability?.toFixed?.(1) ?? '-' }) },
                { l: t('editor.fsrsLabels.difficulty'), v: `${fsrs.difficulty?.toFixed?.(1) ?? '-'}` },
                { l: t('editor.fsrsLabels.reps'), v: `${fsrs.reps ?? 0}` },
                { l: t('editor.fsrsLabels.lapses'), v: `${fsrs.lapses ?? 0}` },
              ];
              return rows.map((p) => (
                <span key={p.l} style={{ display: 'inline-flex', gap: 5, alignItems: 'baseline' }}>
                  <span>{p.l}</span>
                  <span className="mono" style={{ color: 'var(--text-muted)' }}>{p.v}</span>
                </span>
              ));
            })()}
          </div>
        )}

        {/* Deck + note-type selectors */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 8 : 12, marginBottom: 16 }}>
          <div>
            <div style={labelStyle}><span>{t('editor.deckLabel')}</span></div>
            <NNSelect
              value={deckId}
              onChange={setDeckId}
              options={deckOptions}
              placeholder={t('editor.noDecksYet')}
              emptyText={t('editor.noDecksYet')}
              ariaLabel={t('editor.deckLabel')}
            />
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
            <NNSelect
              value={noteTypeId}
              onChange={setNoteTypeId}
              options={noteTypeOptions}
              placeholder={t('editor.noNoteTypes')}
              emptyText={t('editor.noNoteTypes')}
              ariaLabel={t('editor.noteTypeLabel')}
              // Changing the note-type only matters for NEW notes (an existing
              // note keeps its type; clone/convert is Phase 5b).
              disabled={!!editing || noteTypes.length === 0}
            />
          </div>
        </div>

        {/* Dynamic fields. `data-nn-fields` marks the Tab-navigation ring: the
            RichField keydown handler walks the `textarea[data-nn-field]` siblings
            inside it. In the `dock` layout (wide-short bottom panel) the fields
            sit in two columns on non-mobile to use the horizontal space. */}
        <div
          data-nn-fields
          style={
            layout === 'dock' && !isMobile
              ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }
              : undefined
          }
        >
          {fields.map((field, i) => {
            const isFront = i === 0;
            return (
              <div key={field.name} style={{ marginBottom: layout === 'dock' && !isMobile ? 0 : 14 }}>
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
                  onChange={(markdown) => setField(field.name, markdown)}
                  placeholder={isFront ? t('editor.fields.frontPlaceholder') : undefined}
                  serif={isFront}
                  minHeight={isFront ? (isMobile ? 90 : 100) : isMobile ? 120 : 110}
                  autoFocus={autoFocusFront && !editing && isFront}
                  resetKey={resetKey}
                />
              </div>
            );
          })}
        </div>

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
            background: 'var(--tone-rose-bg)', border: '1px solid var(--tone-rose-border)',
            borderRadius: 10, color: 'var(--rose-400)', fontSize: 12.5,
          }}>
            {error}
          </div>
        )}

        {/* Preview: a single flip card behind a toggle (replaces the always-on
            dual front+back inline preview). Reuses the `preview` memo + SafeHtml,
            so images + KaTeX render exactly as in review. */}
        <div style={{ marginTop: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <NNBtn
              size="sm"
              variant={showPreview ? 'primary' : 'ghost'}
              icon="eye"
              onClick={() => { setShowPreview((v) => !v); setFlipped(false); }}
            >
              {t('editor.previewToggle')}
            </NNBtn>
            {showPreview && (
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('editor.flipHint')}</span>
            )}
          </div>
          {/* A6: field values accept Markdown source; the preview above renders it
              via the same SafeHtml pipeline as review. An unobtrusive hint — no
              WYSIWYG-markdown mode (plan A6: rendering is primary). */}
          <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginBottom: 8 }}>
            {t('editor.richText.markdownMode')}
          </div>
          {showPreview && (
            <NNCard padding={0} style={{ overflow: 'hidden' }}>
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  // Don't flip when clicking interactive children or an image
                  // (matches review.tsx's guard, plus <img> per Execution note #3).
                  const tgt = e.target as HTMLElement;
                  if (
                    tgt.tagName === 'INPUT' ||
                    tgt.tagName === 'BUTTON' ||
                    tgt.tagName === 'A' ||
                    tgt.tagName === 'IMG' ||
                    tgt.closest('button') ||
                    tgt.closest('a')
                  )
                    return;
                  setFlipped((v) => !v);
                }}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
                    e.preventDefault();
                    setFlipped((v) => !v);
                  }
                }}
                style={{
                  padding: isMobile ? '20px 18px' : '30px 34px',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: isMobile ? 160 : 200,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: isMobile ? 18 : 24 }}>
                  <NNBadge size="xs" tone="neutral">{activeNoteType?.name ?? '—'}</NNBadge>
                  {tags.map((tag, i) => (
                    <NNTag key={`pv-${tag}-${i}`} color={deckTone === 'neutral' ? 'sky' : deckTone}>{tag}</NNTag>
                  ))}
                </div>
                {/* Question eyebrow — mirrors review.tsx hierarchy. For cloze the
                    label flips to "Answer" once the prompt side is revealed. */}
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: 1.6,
                    textTransform: 'uppercase',
                    color: 'var(--text-dim)',
                    fontFamily: 'var(--font-sans)',
                    marginBottom: 12,
                  }}
                >
                  {activeNoteType?.kind === 'cloze' && flipped ? t('review.answerLabel') : t('review.questionLabel')}
                </div>
                {/* Front / prompt — 1:1 with review.tsx front styling. For cloze
                    the prompt side flips to the answer on reveal (mirrors review). */}
                {preview.front.trim() && activeNoteType ? (
                  <RichCard
                    noteType={activeNoteType}
                    fieldValues={fieldValues}
                    side={activeNoteType.kind === 'cloze' ? (flipped ? 'back' : 'front') : 'front'}
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: isMobile ? (activeNoteType.kind === 'cloze' ? 28 : 32) : (activeNoteType.kind === 'cloze' ? 36 : 48),
                      lineHeight: 1.15,
                      letterSpacing: -1,
                      color: 'var(--text)',
                      fontWeight: 400,
                      wordBreak: 'break-word',
                    }}
                  />
                ) : (
                  <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-serif)', fontSize: isMobile ? 32 : 48 }}>
                    {t('editor.frontPreview')}
                  </div>
                )}
                {/* Divider + revealed answer — 1:1 with review.tsx (non-cloze):
                    "Answer" eyebrow, a thin lime accent rule, calm --text serif
                    (NOT lime text). Cloze reveals by flipping the prompt side
                    above, so no separate answer block (matches review). */}
                {activeNoteType?.kind !== 'cloze' && (
                  <>
                    <div
                      style={{
                        marginTop: isMobile ? 26 : 32,
                        height: 1,
                        background: 'linear-gradient(to right, var(--border-2), transparent)',
                      }}
                    />
                    <div
                      style={{
                        opacity: flipped ? 1 : 0,
                        transform: flipped ? 'translateY(0)' : 'translateY(8px)',
                        transition: 'opacity 240ms ease, transform 240ms ease',
                        pointerEvents: flipped ? 'auto' : 'none',
                        minHeight: flipped ? 40 : 0,
                        marginTop: flipped ? (isMobile ? 22 : 28) : 0,
                      }}
                    >
                      {flipped && (
                        <>
                          <div
                            style={{
                              fontSize: 10.5,
                              fontWeight: 600,
                              letterSpacing: 1.6,
                              textTransform: 'uppercase',
                              color: 'var(--lime-400)',
                              fontFamily: 'var(--font-sans)',
                              marginBottom: 12,
                            }}
                          >
                            {t('review.answerLabel')}
                          </div>
                          {preview.back.trim() && activeNoteType ? (
                            <div style={{ borderLeft: '2px solid var(--lime-500)', paddingLeft: isMobile ? 14 : 18 }}>
                              <RichCard
                                noteType={activeNoteType}
                                fieldValues={fieldValues}
                                side="back"
                                style={{
                                  fontFamily: 'var(--font-serif)',
                                  fontSize: isMobile ? 21 : 24,
                                  fontWeight: 400,
                                  color: 'var(--text)',
                                  letterSpacing: -0.3,
                                  lineHeight: 1.45,
                                  wordBreak: 'break-word',
                                }}
                              />
                            </div>
                          ) : (
                            <div style={{ color: 'var(--text-dim)', fontSize: 16 }}>{t('editor.backPreview')}</div>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </NNCard>
          )}
        </div>
      </div>
    </div>
  );
};
