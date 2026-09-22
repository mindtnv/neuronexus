'use client';
import { AssistantAskButton } from '../chat/assistant-ask-button';

// NotesPanel («Блокноты 2.0» N1, Р12 «Заметки» tab) — the right-dock notes
// surface of a notebook workspace.
//
//  • Search (debounce 300ms → server `?q=`), list (pinned-first from the server)
//    with title + excerpt + a kind badge («ответ» for kind='answer') + a pin
//    affordance.
//  • Click a row → a viewer that renders the markdown content through the SAME
//    pipeline cards use (renderCardHtml → SafeHtml). [src:] grounding tokens stay
//    as plain text in N1 (the citation chips land in N2). Actions: edit (textarea),
//    pin/unpin, delete (confirm), «В карточки» → prefill the chat composer.
//  • Create: «+ Заметка» → an inline title+content form. NOTE_CONTENT_MAX is
//    surfaced live (char counter) and over-cap submit is blocked client-side.
//
// All data is panel-local; the parent owns the store methods + the imperative
// composer-prefill handoff. Inline styles + CSS vars + ui.tsx primitives only.

import { ReadingText, TextInput, TextArea } from '@/components/design-system/primitives';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NOTE_CONTENT_MAX, NOTE_TITLE_MAX } from '@neuronexus/shared';
import { NNBtn, NNIcon, NNBadge, NNSkeleton } from '@/components/ui';
import { renderCardHtml, SafeHtml } from '@/lib/render-card';
import { useDialog } from '@/components/dialog';
import { raiseToast } from '@/components/toasts';
import type { NotebookNote } from '@/lib/types';
import type { CreateNoteInput } from '@/lib/store';

// A single-field "basic" note-type that feeds note markdown through the card
// render pipeline (markdown-it → DOMPurify via SafeHtml) — same pattern as the
// chat AssistantMarkdown. The sanitizer stays the single security boundary.
const NOTE_MD_NOTE_TYPE = {
  kind: 'basic' as const,
  templates: [{ name: 'note', ord: 0, frontTemplate: '{{Body}}', backTemplate: '{{Body}}' }],
};

type Tfn = (key: string, params?: Record<string, string | number>) => string;

export interface NotesPanelProps {
  notebookId?: string;
  studyScope?: { kind: 'source'; id: string } | { kind: 'saved' };
  allowCreate?: boolean;
  initialNoteId?: string | null;
  onInitialOpen?: () => void;
  getNote?: (scopeId: string, noteId: string) => Promise<NotebookNote>;
  listNotes: (scopeId: string, q?: string, offset?: number) => Promise<NotebookNote[] | { items: NotebookNote[]; nextOffset: number | null }>;
  createNote: (notebookId: string, input: CreateNoteInput) => Promise<NotebookNote>;
  patchNote: (
    notebookId: string,
    noteId: string,
    patch: { title?: string; content?: string; pinned?: boolean },
  ) => Promise<NotebookNote>;
  deleteNote: (notebookId: string, noteId: string) => Promise<void>;
  /** «В карточки» — prefill the chat composer with a make-flashcards prompt. */
  onPrefillChat: (text: string, noteId?: string) => void;
  /** Imperative refresh handle the parent can call after a save-from-chat. */
  refreshRef?: React.MutableRefObject<(() => void) | null>;
  t: Tfn;
}

const NoteMarkdown = ({ content }: { content: string }) => {
  const html = useMemo(
    () => renderCardHtml(NOTE_MD_NOTE_TYPE, { Body: content }, 'front'),
    [content],
  );
  return (
    <ReadingText><SafeHtml
      html={html}
      style={{
        fontFamily: 'inherit',
        fontSize: 'inherit',
        lineHeight: 'inherit',
        color: 'var(--text)',
        wordBreak: 'break-word',
      }}
    /></ReadingText>
  );
};

export const NotesPanel = ({
  notebookId: legacyNotebookId,
  studyScope,
  allowCreate = true,
  initialNoteId,
  onInitialOpen,
  listNotes,
  getNote,
  createNote,
  patchNote,
  deleteNote,
  onPrefillChat,
  refreshRef,
  t,
}: NotesPanelProps) => {
  const { confirm } = useDialog();
  const notebookId = studyScope?.kind === 'source' ? studyScope.id : studyScope?.kind === 'saved' ? '' : legacyNotebookId ?? '';
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [notes, setNotes] = useState<NotebookNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const openIntent = useRef(0);
  useEffect(() => () => { openIntent.current++; }, [notebookId]);
  const consumedInitial = useRef<string | null>(null);
  const refreshSequence = useRef(0);
  useEffect(() => () => { refreshSequence.current++; }, [notebookId]);
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  // Which note is open (viewer/editor); null = list view.
  const [openId, setOpenId] = useState<string | null>(null);
  const openNoteRef = useRef(openId);
  openNoteRef.current = openId;
  const notesOwnerRef = useRef(notebookId);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [busy, setBusy] = useState(false);

  // Create form.
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  // ── Debounce the search query (300ms) ─────────────────────────────────────────
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const refresh = useCallback(
    async (q: string) => {
      const sequence = ++refreshSequence.current;
      try {
        const rows = await listNotes(notebookId, q || undefined);
        if (sequence !== refreshSequence.current) return;
        const items = Array.isArray(rows) ? rows : rows.items;
        const sameOwner = notesOwnerRef.current === notebookId;
        notesOwnerRef.current = notebookId;
        // A first-page refresh is not evidence that a note opened by its ID was
        // deleted. Keep that viewer snapshot until the user leaves it; a newer
        // copy in the page wins. Never carry it into a different study owner.
        setNotes(previous => {
          const active = sameOwner ? previous.find(note => note.id === openNoteRef.current) : undefined;
          return active && !items.some(note => note.id === active.id) ? [...items, active] : items;
        });
        setNextOffset(Array.isArray(rows) ? null : rows.nextOffset);
        setLoadError(false);
      } catch {
        if (sequence === refreshSequence.current) setLoadError(true);
      } finally {
        if (sequence === refreshSequence.current) setLoaded(true);
      }
    },
    [listNotes, notebookId],
  );

  useEffect(() => {
    void refresh(debouncedQ);
  }, [debouncedQ, refresh]);

  const loadMore = async () => {
    if (nextOffset === null || loadingMore) return;
    const sequence = refreshSequence.current;
    setLoadingMore(true);
    try {
      const page = await listNotes(notebookId, debouncedQ || undefined, nextOffset);
      if (sequence !== refreshSequence.current) return;
      const items = Array.isArray(page) ? page : page.items;
      setNotes(previous => [...new Map([...previous, ...items].map(note => [note.id, note])).values()]);
      setNextOffset(Array.isArray(page) ? null : page.nextOffset); setLoadError(false);
    } catch { if (sequence === refreshSequence.current) setLoadError(true); }
    finally { setLoadingMore(false); }
  };

  // Expose an imperative refresh to the parent (used after «save answer from chat»).
  useEffect(() => {
    if (!refreshRef) return;
    refreshRef.current = () => void refresh(debouncedQ);
    return () => {
      refreshRef.current = null;
    };
  }, [refreshRef, refresh, debouncedQ]);

  const openNote = useMemo(
    () => (openId ? notes.find((n) => n.id === openId) ?? null : null),
    [notes, openId],
  );

  useEffect(() => {
    if (!initialNoteId) { consumedInitial.current = null; openIntent.current++; return; }
    if (!loaded || loadError || consumedInitial.current === initialNoteId) return;
    if (search || debouncedQ) { setLoaded(false); setSearch(''); setDebouncedQ(''); void refresh(''); return; }
    consumedInitial.current = initialNoteId;
    const intent = ++openIntent.current;
    if (notes.some(note => note.id === initialNoteId)) { setOpenId(initialNoteId); setEditing(false); }
    else if (getNote) {
      void getNote(notebookId,initialNoteId).then(note => {
        if (openIntent.current !== intent) return;
        setNotes(previous => [...previous.filter(item => item.id !== note.id),note]);
        setOpenId(note.id);setEditing(false);onInitialOpen?.();
      }).catch(error => {
        if (openIntent.current !== intent) return;
        if (error?.status === 404) { raiseToast({kind:'error',title:t('notebooks.notes.notFound')});onInitialOpen?.(); }
        else {consumedInitial.current=null;setLoadError(true);}
      });
      return;
    } else raiseToast({ kind: 'error', title: t('notebooks.notes.notFound') });
    onInitialOpen?.();
  }, [initialNoteId, loaded, loadError, notes, search, debouncedQ, onInitialOpen, refresh, getNote, notebookId, t]);

  // ── Create ────────────────────────────────────────────────────────────────────
  const resetCreate = useCallback(() => {
    setCreating(false);
    setNewTitle('');
    setNewContent('');
  }, []);

  const submitCreate = useCallback(async () => {
    const title = newTitle.trim();
    const content = newContent;
    if (!title || busy) return;
    if (content.length > NOTE_CONTENT_MAX) {
      raiseToast({ kind: 'info', title: t('notebooks.notes.tooLong') });
      return;
    }
    setBusy(true);
    try {
      const created = await createNote(notebookId, { title, content });
      setNotes((prev) => [created, ...prev]);
      resetCreate();
    } catch {
      raiseToast({ kind: 'info', title: t('notebooks.notes.createFailed') });
    } finally {
      setBusy(false);
    }
  }, [newTitle, newContent, busy, createNote, notebookId, resetCreate, t]);

  // ── Edit ──────────────────────────────────────────────────────────────────────
  const startEdit = useCallback((n: NotebookNote) => {
    setEditTitle(n.title);
    setEditContent(n.content);
    setEditing(true);
  }, []);

  const submitEdit = useCallback(async () => {
    if (!openNote || busy) return;
    const title = editTitle.trim();
    if (!title) return;
    if (editContent.length > NOTE_CONTENT_MAX) {
      raiseToast({ kind: 'info', title: t('notebooks.notes.tooLong') });
      return;
    }
    setBusy(true);
    try {
      const updated = await patchNote(notebookId, openNote.id, {
        title,
        content: editContent,
      });
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setEditing(false);
    } catch {
      raiseToast({ kind: 'info', title: t('notebooks.notes.createFailed') });
    } finally {
      setBusy(false);
    }
  }, [openNote, busy, editTitle, editContent, patchNote, notebookId, t]);

  // ── Pin / delete / to-cards ───────────────────────────────────────────────────
  const togglePin = useCallback(
    async (n: NotebookNote) => {
      try {
        const updated = await patchNote(notebookId, n.id, { pinned: !n.pinned });
        // Re-fetch keeps the pinned-first server ordering correct.
        setNotes((prev) => {
          const next = prev.map((x) => (x.id === updated.id ? updated : x));
          return [...next].sort((a, b) =>
            a.pinned === b.pinned
              ? Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
              : a.pinned
                ? -1
                : 1,
          );
        });
      } catch {
        raiseToast({ kind: 'info', title: t('notebooks.notes.createFailed') });
      }
    },
    [patchNote, notebookId, t],
  );

  const removeNote = useCallback(
    async (n: NotebookNote) => {
      const yes = await confirm({
        title: t('notebooks.notes.delete'),
        message: t('notebooks.notes.deleteConfirm'),
        danger: true,
        confirmLabel: t('notebooks.notes.delete'),
      });
      if (!yes) return;
      try {
        await deleteNote(notebookId, n.id);
        setNotes((prev) => prev.filter((x) => x.id !== n.id));
        if (openId === n.id) {
          setOpenId(null);
          setEditing(false);
        }
      } catch {
        raiseToast({ kind: 'info', title: t('notebooks.notes.createFailed') });
      }
    },
    [confirm, t, deleteNote, notebookId, openId],
  );

  const toCards = useCallback(
    (n: NotebookNote) => {
      onPrefillChat(t('notebooks.notes.toCardsPrompt', { content: n.content }), n.id);
    },
    [onPrefillChat, t],
  );

  // ── Render: note viewer / editor ───────────────────────────────────────────────
  if (openNote) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 10px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <NNBtn
            variant="ghost"
            size="sm"
            icon="chevl"
            onClick={() => {
              setOpenId(null);
              setEditing(false);
            }}
          >
            {t('notebooks.notes.back')}
          </NNBtn>
          <span style={{ flex: 1 }} />
          {!editing && <AssistantAskButton object={{ kind: 'written_note', id: openNote.id }} compact />}
          {openNote.ownerKind === 'source' && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{openNote.sourceOriginTitle}{!openNote.sourceId ? ` · ${t('assistant.unavailable')}` : ''}</span>}
          {!editing && (
            <>
              <NNBtn
                variant="ghost"
                size="sm"
                icon="pin"
                active={openNote.pinned}
                ariaLabel={openNote.pinned ? t('notebooks.notes.unpin') : t('notebooks.notes.pin')}
                title={openNote.pinned ? t('notebooks.notes.unpin') : t('notebooks.notes.pin')}
                onClick={() => void togglePin(openNote)}
              />
              <NNBtn
                variant="ghost"
                size="sm"
                icon="edit"
                ariaLabel={t('notebooks.notes.edit')}
                title={t('notebooks.notes.edit')}
                onClick={() => startEdit(openNote)}
              />
              <NNBtn
                variant="ghost"
                size="sm"
                icon="x"
                ariaLabel={t('notebooks.notes.delete')}
                title={t('notebooks.notes.delete')}
                onClick={() => void removeNote(openNote)}
              />
            </>
          )}
        </div>

        <div className="nn-scroll" style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <TextInput
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={NOTE_TITLE_MAX}
                aria-label={t('notebooks.notes.titlePlaceholder')}
                placeholder={t('notebooks.notes.titlePlaceholder')}
              />
              <TextArea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                aria-label={t('notebooks.notes.contentPlaceholder')}
                placeholder={t('notebooks.notes.contentPlaceholder')}
                style={{ minHeight: 220 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 11,
                    color:
                      editContent.length > NOTE_CONTENT_MAX ? 'var(--rose-400)' : 'var(--text-dim)',
                  }}
                >
                  {t('notebooks.notes.charCount', {
                    count: editContent.length,
                    max: NOTE_CONTENT_MAX,
                  })}
                </span>
                <span style={{ flex: 1 }} />
                <NNBtn variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>
                  {t('notebooks.notes.cancel')}
                </NNBtn>
                <NNBtn
                  variant="primary"
                  size="sm"
                  onClick={() => void submitEdit()}
                  disabled={busy || editTitle.trim().length === 0}
                >
                  {busy ? t('notebooks.notes.saving') : t('notebooks.notes.save')}
                </NNBtn>
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <h3
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: 'var(--text)',
                    margin: 0,
                    fontFamily: 'var(--font-sans)',
                    flex: 1,
                    minWidth: 0,
                    wordBreak: 'break-word',
                  }}
                >
                  {openNote.title}
                </h3>
                {openNote.kind === 'answer' && (
                  <NNBadge tone="violet" size="xs">
                    {t('notebooks.notes.badgeAnswer')}
                  </NNBadge>
                )}
              </div>
              <NoteMarkdown content={openNote.content} />
              <div style={{ marginTop: 16 }}>
                <NNBtn variant="soft" size="sm" icon="stack" onClick={() => toCards(openNote)}>
                  {t('notebooks.notes.toCards')}
                </NNBtn>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Render: list ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '12px 14px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            className="nn-chrome"
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color: 'var(--text-dim)',
              flex: 1,
            }}
          >
            {t('notebooks.notes.heading')}
          </span>
          {allowCreate && <NNBtn
            variant="soft"
            size="sm"
            icon="plus"
            onClick={() => { openIntent.current++; if (initialNoteId) onInitialOpen?.(); setCreating(v => !v); }}
            active={creating}
          >
            {t('notebooks.notes.add')}
          </NNBtn>}
        </div>

        <div style={{ position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              display: 'flex',
            }}
          >
            <NNIcon name="search" size={13} color="var(--text-dim)" />
          </span>
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('notebooks.notes.search')}
            placeholder={t('notebooks.notes.search')}
            style={{ paddingLeft: 30 }}
          />
        </div>

        {creating && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: 8,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
            }}
          >
            <TextInput
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={NOTE_TITLE_MAX}
              aria-label={t('notebooks.notes.titlePlaceholder')}
              placeholder={t('notebooks.notes.titlePlaceholder')}
              autoFocus
            />
            <TextArea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              aria-label={t('notebooks.notes.contentPlaceholder')}
              placeholder={t('notebooks.notes.contentPlaceholder')}
              style={{ minHeight: 110 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  fontSize: 11,
                  color:
                    newContent.length > NOTE_CONTENT_MAX ? 'var(--rose-400)' : 'var(--text-dim)',
                }}
              >
                {t('notebooks.notes.charCount', { count: newContent.length, max: NOTE_CONTENT_MAX })}
              </span>
              <span style={{ flex: 1 }} />
              <NNBtn variant="ghost" size="sm" onClick={resetCreate} disabled={busy}>
                {t('notebooks.notes.cancel')}
              </NNBtn>
              <NNBtn
                variant="primary"
                size="sm"
                onClick={() => void submitCreate()}
                disabled={busy || newTitle.trim().length === 0}
              >
                {busy ? t('notebooks.notes.saving') : t('notebooks.notes.save')}
              </NNBtn>
            </div>
          </div>
        )}
      </div>

      <div className="nn-scroll" style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 12px' }}>
        {loadError && <p role="alert">{t('assistant.notesLoadFailed')} <NNBtn size="sm" onClick={() => void refresh(debouncedQ)}>{t('review.retry')}</NNBtn></p>}
        {nextOffset !== null && <NNBtn size="sm" loading={loadingMore} onClick={() => void loadMore()}>{t('assistant.more')}</NNBtn>}
        {!loaded ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <NNSkeleton style={{ height: 52 }} />
            <NNSkeleton style={{ height: 52 }} />
          </div>
        ) : notes.length === 0 ? (
          <div className="nn-empty-state" style={{ paddingTop: 28, paddingBottom: 28 }}>
            <span className="nn-empty-state-icon">
              <NNIcon name="doc" size={26} color="var(--text-dim)" />
            </span>
            <p className="nn-empty-state-hint">
              {debouncedQ ? t('notebooks.notes.searchEmpty') : t('notebooks.notes.empty')}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {notes.map((n) => (
              <NoteRow
                key={n.id}
                note={n}
                onOpen={() => {
                  openIntent.current++;
                  if (initialNoteId) onInitialOpen?.();
                  setOpenId(n.id);
                  setEditing(false);
                }}
                onTogglePin={() => void togglePin(n)}
                t={t}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const NoteRow = ({
  note,
  onOpen,
  onTogglePin,
  t,
}: {
  note: NotebookNote;
  onOpen: () => void;
  onTogglePin: () => void;
  t: Tfn;
}) => (
  <div className="nn-source-row" style={{ cursor: 'pointer' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
      <button
        type="button"
        onClick={onOpen}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {note.pinned && <NNIcon name="pin" size={11} color="var(--lime-400)" />}
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              flex: 1,
            }}
          >
            {note.title}
          </span>
          {note.kind === 'answer' && (
            <NNBadge tone="violet" size="xs">
              {t('notebooks.notes.badgeAnswer')}
            </NNBadge>
          )}
        </span>
        {note.excerpt && (
          <span
            style={{
              fontSize: 11.5,
              color: 'var(--text-dim)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}
          >
            {note.excerpt}
          </span>
        )}
      </button>
      <div className="nn-source-row-actions" style={{ display: 'flex', flexShrink: 0 }}>
        <NNBtn
          variant="ghost"
          size="sm"
          icon="pin"
          active={note.pinned}
          ariaLabel={note.pinned ? t('notebooks.notes.unpin') : t('notebooks.notes.pin')}
          title={note.pinned ? t('notebooks.notes.unpin') : t('notebooks.notes.pin')}
          onClick={onTogglePin}
        />
      </div>
    </div>
  </div>
);
