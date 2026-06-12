'use client';

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
  notebookId: string;
  listNotes: (notebookId: string, q?: string) => Promise<NotebookNote[]>;
  createNote: (notebookId: string, input: CreateNoteInput) => Promise<NotebookNote>;
  patchNote: (
    notebookId: string,
    noteId: string,
    patch: { title?: string; content?: string; pinned?: boolean },
  ) => Promise<NotebookNote>;
  deleteNote: (notebookId: string, noteId: string) => Promise<void>;
  /** «В карточки» — prefill the chat composer with a make-flashcards prompt. */
  onPrefillChat: (text: string) => void;
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
    <SafeHtml
      html={html}
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 13.5,
        lineHeight: 1.6,
        color: 'var(--text)',
        wordBreak: 'break-word',
      }}
    />
  );
};

export const NotesPanel = ({
  notebookId,
  listNotes,
  createNote,
  patchNote,
  deleteNote,
  onPrefillChat,
  refreshRef,
  t,
}: NotesPanelProps) => {
  const { confirm } = useDialog();

  const [notes, setNotes] = useState<NotebookNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  // Which note is open (viewer/editor); null = list view.
  const [openId, setOpenId] = useState<string | null>(null);
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
      try {
        const rows = await listNotes(notebookId, q || undefined);
        setNotes(rows);
      } catch {
        /* keep current on a transient error */
      } finally {
        setLoaded(true);
      }
    },
    [listNotes, notebookId],
  );

  useEffect(() => {
    void refresh(debouncedQ);
  }, [debouncedQ, refresh]);

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
      onPrefillChat(t('notebooks.notes.toCardsPrompt', { content: n.content }));
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

        <div className="nn-scroll" style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={NOTE_TITLE_MAX}
                placeholder={t('notebooks.notes.titlePlaceholder')}
                style={inputStyle}
              />
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder={t('notebooks.notes.contentPlaceholder')}
                style={{ ...inputStyle, minHeight: 220, resize: 'vertical', lineHeight: 1.55 }}
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
          padding: '10px 10px 8px',
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
          <NNBtn
            variant="soft"
            size="sm"
            icon="plus"
            onClick={() => setCreating((v) => !v)}
            active={creating}
          >
            {t('notebooks.notes.add')}
          </NNBtn>
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
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('notebooks.notes.search')}
            style={{ ...inputStyle, height: 30, paddingLeft: 27 }}
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
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={NOTE_TITLE_MAX}
              placeholder={t('notebooks.notes.titlePlaceholder')}
              style={inputStyle}
              autoFocus
            />
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder={t('notebooks.notes.contentPlaceholder')}
              style={{ ...inputStyle, minHeight: 90, resize: 'vertical', lineHeight: 1.5 }}
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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 9px',
  fontSize: 13,
  fontFamily: 'var(--font-sans)',
  color: 'var(--text)',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  outline: 'none',
  boxSizing: 'border-box',
};
