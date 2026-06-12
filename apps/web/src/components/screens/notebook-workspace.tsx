'use client';

// NotebookWorkspace (L2 — clean NotebookLM, Р6). The notebook is now pure
// research/chat: the FULL reader (PDF + ink + marks + quick-card) lives at
// `/library/[id]`; reading no longer requires a notebook.
//
//   ┌── sources ──┬──────── chat ────────┐
//   │ status      │ ChatPanel (notebook) │
//   │ ☑ in chat   │ + thread switcher    │
//   │ N cards     │                      │
//   │ + add       │  ┌─ citation viewer ─┤  ← right drawer on a [src:] click
//   │ + attach    │  │ text chunk reader │
//   └─────────────┴──┴───────────────────┘
//
//  • Desktop (≥1100): two columns (sources │ chat). Tablet/mobile: a 2-tab
//    switcher (Источники │ Чат) with the citation viewer as a fullscreen sheet.
//  • Clicking a chat citation [src:] opens a TEXT-mode chunk viewer (no PDF load)
//    keyed ALWAYS on sourceChunkId/position, with a «Открыть в библиотеке» link
//    into the full reader. Cited passages of a detached source still open (the
//    viewer is source-scoped); a deleted source → tombstone.
//  • On mount the workspace consumes sessionStorage['nn:nb:prefill:<id>'] (the
//    library reader's «Спросить» handoff) into the chat composer.
//
//  URL: `?source=<id>&chunk=<chunkId>&pos=<n>` opens the citation viewer;
//  `?thread=<convId>` selects a chat thread.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  MAX_SOURCE_BYTES_DEFAULT,
  SOURCE_MIME_TO_KIND,
  type IngestErrorCode,
  type SourceMime,
} from '@neuronexus/shared';
import { NNBtn, NNCard, NNIcon, NNBadge, NNSkeleton } from '@/components/ui';
import { useNN } from '@/lib/store';
import type {
  Notebook,
  Source,
  SourceLinkedCard,
} from '@/lib/types';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';
import { useDialog } from '@/components/dialog';
import { raiseToast } from '@/components/toasts';
import {
  AddSourceForm,
  sourceIcon,
  statusTone,
  type AddKind,
} from '@/components/screens/notebooks';
import { ChatPanel, type ComposerPrefillHandle } from '@/components/chat/chat-panel';
import { TextChunkReader, type TextChunkReaderHandle } from '@/components/screens/text-reader';
import { NotesPanel } from '@/components/notebook/notes-panel';
import { useSourceStatus } from '@/lib/use-source-status';
import { prefillKey } from '@/lib/library-handoff';
import type { LibraryItem } from '@/lib/types';

type WorkspaceTab = 'sources' | 'chat' | 'dock';

// Right-dock tabs (Р12). N1 ships a single «Заметки» tab; the array is the
// extension seam for N2's «Обзор» / «Студия».
type DockTab = 'notes';

/**
 * Derive a saved-answer note title (Р7): the first ~60 chars of the content with
 * markdown emphasis + [src:]/[card:] grounding tokens stripped, collapsed
 * whitespace, ellipsized. Falls back to a generic label for empty content.
 */
function noteTitleFromContent(content: string, fallback: string): string {
  const stripped = content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → label
    .replace(/\[(?:src|card):[^\]]+\]/g, '') // grounding tokens
    .replace(/[#*_`>~]/g, '') // markdown emphasis/heading/code marks
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length === 0) return fallback;
  return stripped.length > 60 ? `${stripped.slice(0, 60).trimEnd()}…` : stripped;
}

export const NotebookWorkspace = ({ notebookId }: { notebookId: string }) => {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const bp = useBreakpoint();
  const isDesktop = bp === 'desktop';
  const { prompt, confirm } = useDialog();

  const listNotebooks = useNN((s) => s.listNotebooks);
  const listSources = useNN((s) => s.listSources);
  const getSource = useNN((s) => s.getSource);
  const addUrlSource = useNN((s) => s.addUrlSource);
  const addTextSource = useNN((s) => s.addTextSource);
  const uploadSource = useNN((s) => s.uploadSource);
  const renameSource = useNN((s) => s.renameSource);
  const getSourceChunks = useNN((s) => s.getSourceChunks);
  const listSourceCards = useNN((s) => s.listSourceCards);
  const listLibrary = useNN((s) => s.listLibrary);
  const attachSources = useNN((s) => s.attachSources);
  const detachSource = useNN((s) => s.detachSource);
  const listNotebookNotes = useNN((s) => s.listNotebookNotes);
  const createNotebookNote = useNN((s) => s.createNotebookNote);
  const patchNotebookNote = useNN((s) => s.patchNotebookNote);
  const deleteNotebookNote = useNN((s) => s.deleteNotebookNote);

  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);

  // Per-turn chat source scope: ids checked into the chat. Default = all ready
  // sources; persisted per-notebook in localStorage.
  const scopeKey = `nn:nb:scope:${notebookId}`;
  const [scope, setScope] = useState<Set<string>>(new Set());
  const scopeHydratedRef = useRef(false);

  // Chat thread selection (notebook mode — the workspace owns the switcher).
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  // M5 — composer prefill ref (chat ← library «Спросить» handoff + viewer).
  const composerPrefillRef = useRef<ComposerPrefillHandle | null>(null);

  // ── Right dock (Р12): tabs + collapse (N1 = «Заметки» only) ────────────────────
  const dockKey = `nn:nb:dock:${notebookId}`;
  const [dockTab] = useState<DockTab>('notes');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  // Imperative refresh of the notes panel (after «save answer from chat»).
  const notesRefreshRef = useRef<(() => void) | null>(null);

  // Hydrate the dock-collapsed state from localStorage once.
  const dockHydratedRef = useRef(false);
  useEffect(() => {
    if (dockHydratedRef.current) return;
    dockHydratedRef.current = true;
    try {
      setDockCollapsed(localStorage.getItem(dockKey) === 'collapsed');
    } catch {
      /* best-effort */
    }
  }, [dockKey]);

  const toggleDock = useCallback(() => {
    setDockCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(dockKey, next ? 'collapsed' : 'open');
      } catch {
        /* best-effort */
      }
      return next;
    });
  }, [dockKey]);

  // Prefill the chat composer (notes «В карточки» + library handoff share this).
  const prefillChat = useCallback((text: string) => {
    composerPrefillRef.current?.prefill(text);
  }, []);

  // «В заметки» (Р7) — save a finished assistant answer as a note.
  const onSaveAnswer = useCallback(
    async (payload: { content: string; citations: unknown[]; messageId?: string }) => {
      try {
        await createNotebookNote(notebookId, {
          title: noteTitleFromContent(payload.content, t('notebooks.notes.addTitle')),
          content: payload.content,
          kind: 'answer',
          citations: payload.citations,
          messageId: payload.messageId,
        });
        raiseToast({ kind: 'info', title: t('notebooks.notes.savedFromChat') });
        notesRefreshRef.current?.();
        if (dockCollapsed) toggleDock();
      } catch {
        raiseToast({ kind: 'info', title: t('notebooks.notes.createFailed') });
      }
    },
    [createNotebookNote, notebookId, t, dockCollapsed, toggleDock],
  );

  // ── Citation viewer (text-mode chunk reader over a cited source) ───────────────
  const [viewer, setViewer] = useState<{
    sourceId: string;
    chunkId?: string;
    pos?: number;
    page?: number;
  } | null>(null);
  const viewerReaderRef = useRef<TextChunkReaderHandle | null>(null);

  // Mobile tab.
  const [tab, setTab] = useState<WorkspaceTab>('chat');

  // Add-source form state (M1 flow).
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<AddKind>('file');
  const [addTitle, setAddTitle] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addText, setAddText] = useState('');
  const [addFile, setAddFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const maxMb = Math.floor(MAX_SOURCE_BYTES_DEFAULT / (1024 * 1024));

  // L1 — "Add from library" attach picker.
  const [attachOpen, setAttachOpen] = useState(false);

  // ── Deep-link params (?source=&chunk=&pos= / ?thread=) ───────────────────────
  const sourceParam = searchParams.get('source');
  const chunkParam = searchParams.get('chunk');
  const posParam = searchParams.get('pos');
  const pageParam = searchParams.get('page');
  const threadParam = searchParams.get('thread');

  // ── Load notebook + sources ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const nbs = await listNotebooks();
        if (!cancelled) setNotebook(nbs.find((n) => n.id === notebookId) ?? null);
      } catch {
        /* leave null; header falls back to a generic title */
      }
      try {
        const rows = await listSources(notebookId);
        if (cancelled) return;
        setSources(rows);
        if (!scopeHydratedRef.current) {
          scopeHydratedRef.current = true;
          const readyIds = rows.filter((s) => s.status === 'ready').map((s) => s.id);
          let stored: string[] | null = null;
          try {
            const raw = localStorage.getItem(scopeKey);
            stored = raw ? (JSON.parse(raw) as string[]) : null;
          } catch {
            stored = null;
          }
          const next = stored
            ? new Set(readyIds.filter((id) => stored!.includes(id)))
            : new Set(readyIds);
          setScope(next);
        }
      } catch {
        /* keep empty */
      } finally {
        if (!cancelled) setSourcesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebookId]);

  // ── Consume the library handoff prefill on mount ───────────────────────────────
  const consumedPrefillRef = useRef(false);
  useEffect(() => {
    if (consumedPrefillRef.current) return;
    consumedPrefillRef.current = true;
    // Defer so the ChatPanel has populated composerPrefillRef.
    const id = window.setTimeout(() => {
      try {
        const key = prefillKey(notebookId);
        const text = sessionStorage.getItem(key);
        if (text) {
          sessionStorage.removeItem(key);
          composerPrefillRef.current?.prefill(text);
          if (!isDesktop) setTab('chat');
        }
      } catch {
        /* best-effort */
      }
    }, 50);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebookId]);

  // Persist the chat scope (best-effort).
  const setScopePersisted = useCallback(
    (next: Set<string>) => {
      setScope(next);
      try {
        localStorage.setItem(scopeKey, JSON.stringify([...next]));
      } catch {
        /* best-effort */
      }
    },
    [scopeKey],
  );

  const toggleScope = useCallback(
    (id: string) => {
      setScope((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          localStorage.setItem(scopeKey, JSON.stringify([...next]));
        } catch {
          /* best-effort */
        }
        return next;
      });
    },
    [scopeKey],
  );

  // ── Poll non-terminal sources (shared useSourceStatus hook) ───────────────────
  useSourceStatus({
    items: sources,
    fetchOne: (id) => getSource(id).catch(() => null),
    onUpdate: (fresh) => {
      const byId = new Map(fresh.map((s) => [s.id, s]));
      setSources((prev) =>
        prev.map((s) => {
          const updated = byId.get(s.id);
          if (!updated) return s;
          if (s.status !== 'ready' && updated.status === 'ready') {
            setScopePersisted(new Set([...scope, updated.id]));
          }
          return updated;
        }),
      );
    },
  });

  // ── Open the citation viewer (keyed on sourceChunkId/position, NOT page) ───────
  const openViewer = useCallback(
    (v: { sourceId: string; chunkId?: string; pos?: number; page?: number }) => {
      setViewer(v);
      if (!isDesktop) setTab('chat');
      // The TextChunkReader mounts fresh per sourceId (key) and scrolls once it has
      // chunks; if it's already mounted for this source, scroll imperatively.
      requestAnimationFrame(() => viewerReaderRef.current?.scrollToChunk(v.chunkId, v.pos));
    },
    [isDesktop],
  );

  // Consume ?source=&chunk=&pos=&page= once sources have loaded → citation viewer.
  const consumedSourceParamRef = useRef<string | null>(null);
  useEffect(() => {
    if (!sourcesLoaded || !sourceParam) return;
    const token = `${sourceParam}:${chunkParam ?? ''}:${posParam ?? ''}:${pageParam ?? ''}`;
    if (consumedSourceParamRef.current === token) return;
    consumedSourceParamRef.current = token;
    openViewer({
      sourceId: sourceParam,
      chunkId: chunkParam ?? undefined,
      pos: posParam != null ? Number(posParam) : undefined,
      page: pageParam != null ? Number(pageParam) : undefined,
    });
  }, [sourcesLoaded, sourceParam, chunkParam, posParam, pageParam, openViewer]);

  // Consume ?thread= once (notebook chat thread selection).
  const consumedThreadParamRef = useRef<string | null>(null);
  useEffect(() => {
    if (!threadParam) return;
    if (consumedThreadParamRef.current === threadParam) return;
    consumedThreadParamRef.current = threadParam;
    setActiveThreadId(threadParam);
    if (!isDesktop) setTab('chat');
  }, [threadParam, isDesktop]);

  // ── Add-source (M1 flow) ──────────────────────────────────────────────────────
  const resetAddForm = useCallback(() => {
    setAddOpen(false);
    setAddKind('file');
    setAddTitle('');
    setAddUrl('');
    setAddText('');
    setAddFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const onSubmitAdd = useCallback(async () => {
    if (adding) return;
    setAdding(true);
    try {
      let created: Source;
      if (addKind === 'url') {
        const url = addUrl.trim();
        if (!url) return;
        created = await addUrlSource(notebookId, addTitle.trim() || url, url);
      } else if (addKind === 'text') {
        if (!addText.trim()) return;
        created = await addTextSource(
          notebookId,
          addTitle.trim() || t('notebooks.add.textLabel'),
          addText,
        );
      } else {
        if (!addFile) return;
        const mime: SourceMime | null =
          addFile.type in SOURCE_MIME_TO_KIND
            ? (addFile.type as SourceMime)
            : addFile.name.toLowerCase().endsWith('.pdf')
              ? 'application/pdf'
              : addFile.name.toLowerCase().endsWith('.epub')
                ? 'application/epub+zip'
                : null;
        if (!mime) {
          raiseToast({ kind: 'info', title: t('notebooks.status.unsupported_mime') });
          return;
        }
        created = await uploadSource(notebookId, addFile, addTitle.trim() || addFile.name, mime);
      }
      setSources((prev) => [created, ...prev]);
      resetAddForm();
    } catch {
      raiseToast({ kind: 'info', title: t('notebooks.add.failed') });
    } finally {
      setAdding(false);
    }
  }, [
    adding,
    addKind,
    addUrl,
    addText,
    addFile,
    addTitle,
    notebookId,
    addUrlSource,
    addTextSource,
    uploadSource,
    resetAddForm,
    t,
  ]);

  const onRenameSource = useCallback(
    async (src: Source) => {
      const title = await prompt({
        title: t('notebooks.sources.renameTitle'),
        label: t('notebooks.sources.renameLabel'),
        defaultValue: src.title,
        confirmLabel: t('actions.rename'),
        validate: (v) => (v.trim().length === 0 ? ' ' : null),
      });
      if (title === null) return;
      const trimmed = title.trim();
      if (!trimmed || trimmed === src.title) return;
      const updated = await renameSource(src.id, trimmed);
      setSources((prev) => prev.map((s) => (s.id === src.id ? updated : s)));
    },
    [prompt, t, renameSource],
  );

  // L1 — detach (NOT delete): the material stays in the library; only its link to
  // this notebook is removed. MUST prune the source id from the chat scope —
  // else a detach→re-attach silently restores a stale checkbox.
  const onDetachSource = useCallback(
    async (src: Source) => {
      const yes = await confirm({
        title: t('library.detach.title'),
        message: t('library.detach.message'),
        confirmLabel: t('library.detach.confirm'),
      });
      if (!yes) return;
      try {
        await detachSource(notebookId, src.id);
      } catch {
        raiseToast({ kind: 'info', title: t('library.workspace.detachFailed') });
        return;
      }
      setSources((prev) => prev.filter((s) => s.id !== src.id));
      setScopePersisted(new Set([...scope].filter((id) => id !== src.id)));
      if (viewer?.sourceId === src.id) setViewer(null);
      raiseToast({ kind: 'info', title: t('library.toast.detached') });
    },
    [confirm, t, detachSource, notebookId, scope, setScopePersisted, viewer],
  );

  // L1 — attach existing library sources to this notebook, then refetch the list.
  const onAttachSources = useCallback(
    async (sourceIds: string[]) => {
      if (sourceIds.length === 0) return;
      try {
        await attachSources(notebookId, sourceIds);
      } catch {
        raiseToast({ kind: 'info', title: t('library.workspace.detachFailed') });
        return;
      }
      setAttachOpen(false);
      try {
        const rows = await listSources(notebookId);
        setSources(rows);
      } catch {
        /* keep current on transient error */
      }
    },
    [attachSources, notebookId, listSources, t],
  );

  // «Читать в библиотеке» → the full-screen library reader (NOT ?focus=).
  const onReadInLibrary = useCallback(
    (src: Source) => {
      router.push(`/library/${src.id}`);
    },
    [router],
  );

  // Notebook-mode chat thread change.
  const onThreadChange = useCallback(
    (id: string | null) => {
      setActiveThreadId(id);
      const base = `/notebooks/${notebookId}`;
      router.replace(id ? `${base}?thread=${id}` : base, { scroll: false });
    },
    [router, notebookId],
  );

  // The checked source ids (stable array) passed to the chat panel.
  const scopeIds = useMemo(() => [...scope], [scope]);
  const viewerSource = useMemo(
    () => (viewer ? sources.find((s) => s.id === viewer.sourceId) ?? null : null),
    [sources, viewer],
  );

  // ── Panels ─────────────────────────────────────────────────────────────────────
  const sourcesPanel = (
    <SourcesPanel
      sources={sources}
      loaded={sourcesLoaded}
      scope={scope}
      addOpen={addOpen}
      addProps={{
        kind: addKind,
        setKind: setAddKind,
        title: addTitle,
        setTitle: setAddTitle,
        url: addUrl,
        setUrl: setAddUrl,
        text: addText,
        setText: setAddText,
        file: addFile,
        setFile: setAddFile,
        fileInputRef,
        adding,
        maxMb,
        onSubmit: onSubmitAdd,
        onCancel: resetAddForm,
      }}
      onOpenAdd={() => setAddOpen(true)}
      onAttachFromLibrary={() => setAttachOpen(true)}
      onToggleScope={toggleScope}
      onRename={onRenameSource}
      onDetach={onDetachSource}
      onReadInLibrary={onReadInLibrary}
      listSourceCards={listSourceCards}
      onOpenCard={(cardId) => router.push(`/cards?focus=${cardId}`)}
      t={t}
    />
  );

  const chatPanel = (
    <ChatPanel
      mode="notebook"
      notebookId={notebookId}
      sourceIds={scopeIds}
      activeThreadId={activeThreadId}
      composerPrefillRef={composerPrefillRef}
      onThreadChange={onThreadChange}
      onSaveAnswer={onSaveAnswer}
      onSourceCitation={(c) => {
        if (!c.sourceId) return;
        openViewer({
          sourceId: c.sourceId,
          chunkId: c.sourceChunkId,
          pos: c.position,
          page: c.page,
        });
      }}
    />
  );

  // ── Right dock (Р12): «Заметки» tab (N1) ───────────────────────────────────────
  const notesPanel = (
    <NotesPanel
      notebookId={notebookId}
      listNotes={listNotebookNotes}
      createNote={createNotebookNote}
      patchNote={patchNotebookNote}
      deleteNote={deleteNotebookNote}
      onPrefillChat={(text) => {
        prefillChat(text);
        if (!isDesktop) setTab('chat');
      }}
      refreshRef={notesRefreshRef}
      t={t}
    />
  );

  // Dock header: tab pills (N1 = one) + a collapse toggle (desktop). The collapse
  // toggle lives in the dock header so the chat column reclaims the width.
  const dockHeader = (
    <div
      className="nn-chrome"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 8px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        minHeight: 40,
      }}
    >
      {([{ key: 'notes' as DockTab, labelKey: 'notebooks.notes.tab' }]).map(({ key, labelKey }) => (
        <button
          key={key}
          type="button"
          className={`nn-ws-tab${dockTab === key ? ' active' : ''}`}
          onClick={() => undefined}
        >
          {t(labelKey)}
        </button>
      ))}
      <span style={{ flex: 1 }} />
      <NNBtn
        variant="ghost"
        size="sm"
        icon="chevr"
        ariaLabel={t('notebooks.notes.dockCollapse')}
        title={t('notebooks.notes.dockCollapse')}
        onClick={toggleDock}
      />
    </div>
  );

  const dockColumn = (
    <div
      style={{
        width: 340,
        flexShrink: 0,
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--surface)',
      }}
    >
      {dockHeader}
      <div style={{ flex: 1, minHeight: 0 }}>{notesPanel}</div>
    </div>
  );

  // Citation viewer — right drawer (desktop) / fullscreen sheet (mobile).
  const citationViewer = viewer ? (
    <CitationViewer
      key={viewer.sourceId}
      source={viewerSource}
      sourceId={viewer.sourceId}
      chunkId={viewer.chunkId}
      pos={viewer.pos}
      page={viewer.page}
      isDesktop={isDesktop}
      getSourceChunks={getSourceChunks}
      readerRef={viewerReaderRef}
      onOpenInLibrary={() => {
        const params = new URLSearchParams();
        // PDF source + a known page → ?page=; otherwise ?chunk=/?pos=.
        if (viewerSource?.kind === 'pdf' && viewer.page != null) {
          params.set('page', String(viewer.page));
        } else {
          if (viewer.chunkId) params.set('chunk', viewer.chunkId);
          if (viewer.pos != null) params.set('pos', String(viewer.pos));
        }
        const qs = params.toString();
        router.push(`/library/${viewer.sourceId}${qs ? `?${qs}` : ''}`);
      }}
      onClose={() => setViewer(null)}
      t={t}
    />
  ) : null;

  // L1 — "Add from library" picker.
  const attachPicker = attachOpen ? (
    <LibraryAttachPicker
      attachedIds={new Set(sources.map((s) => s.id))}
      listLibrary={listLibrary}
      onConfirm={onAttachSources}
      onClose={() => setAttachOpen(false)}
      t={t}
    />
  ) : null;

  // ── Layout ─────────────────────────────────────────────────────────────────────
  const header = (
    <div
      className="nn-chrome"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 12px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        minHeight: 44,
      }}
    >
      <NNBtn variant="ghost" size="sm" icon="chevl" onClick={() => router.push('/notebooks')}>
        {t('notebooks.sources.back')}
      </NNBtn>
      <h2
        style={{
          fontSize: 14,
          fontWeight: 700,
          fontFamily: 'var(--font-sans)',
          color: 'var(--text)',
          margin: 0,
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          letterSpacing: '-0.01em',
        }}
      >
        {notebook?.title ?? t('notebooks.sources.heading')}
      </h2>
    </div>
  );

  if (isDesktop) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {attachPicker}
        {header}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div
            style={{
              width: 280,
              flexShrink: 0,
              borderRight: '1px solid var(--border)',
              overflowY: 'auto',
            }}
            className="nn-scroll"
          >
            {sourcesPanel}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {chatPanel}
          </div>
          {/* Right side: the citation viewer (transient) takes precedence over the
              dock; otherwise the dock column (or a thin expand rail when collapsed). */}
          {citationViewer ??
            (dockCollapsed ? (
              <DockExpandRail label={t('notebooks.notes.dockExpand')} onExpand={toggleDock} />
            ) : (
              dockColumn
            ))}
        </div>
      </div>
    );
  }

  // Tablet / mobile — a 2-tab switcher (sources │ chat); viewer is a fullscreen sheet.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {attachPicker}
      {header}
      <div
        className="nn-chrome"
        style={{
          display: 'flex',
          gap: 4,
          padding: '6px 10px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          overflowX: 'auto',
        }}
      >
        {([
          { key: 'sources', labelKey: 'notebooks.workspace.tabSources' },
          { key: 'chat', labelKey: 'notebooks.workspace.tabChat' },
          { key: 'dock', labelKey: 'notebooks.notes.tab' },
        ] as { key: WorkspaceTab; labelKey: string }[]).map(({ key: tk, labelKey }) => (
          <button
            key={tk}
            type="button"
            className={`nn-ws-tab${tab === tk ? ' active' : ''}`}
            onClick={() => setTab(tk)}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {tab === 'sources' && (
          <div className="nn-scroll" style={{ flex: 1, overflowY: 'auto' }}>
            {sourcesPanel}
          </div>
        )}
        {tab === 'chat' && chatPanel}
        {tab === 'dock' && <div style={{ flex: 1, minHeight: 0 }}>{notesPanel}</div>}
      </div>
      {/* Citation viewer — fullscreen sheet (mobile). */}
      {citationViewer}
    </div>
  );
};

// ── Right-dock collapsed rail (desktop) ────────────────────────────────────────
// A thin vertical strip with a single «expand» affordance — clicking re-opens the
// dock. Cheap to render; keeps the chat column wide while collapsed.

const DockExpandRail = ({ label, onExpand }: { label: string; onExpand: () => void }) => (
  <div
    style={{
      width: 40,
      flexShrink: 0,
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 8,
      background: 'var(--surface)',
    }}
  >
    <NNBtn variant="ghost" size="sm" icon="doc" ariaLabel={label} title={label} onClick={onExpand} />
  </div>
);

// ── Citation viewer ───────────────────────────────────────────────────────────

const CitationViewer = ({
  source,
  sourceId,
  isDesktop,
  getSourceChunks,
  readerRef,
  onOpenInLibrary,
  onClose,
  t,
}: {
  source: Source | null;
  sourceId: string;
  chunkId?: string;
  pos?: number;
  page?: number;
  isDesktop: boolean;
  getSourceChunks: React.ComponentProps<typeof TextChunkReader>['getSourceChunks'];
  readerRef: React.RefObject<TextChunkReaderHandle | null>;
  onOpenInLibrary: () => void;
  onClose: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) => {
  const panel = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        height: '100%',
        background: 'var(--surface)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <NNIcon name="doc" size={14} color="var(--sky-400)" />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-sans)',
          }}
          title={source?.title}
        >
          {source?.title ?? t('notebooks.backlinks.untitled')}
        </span>
        <NNBtn variant="soft" size="sm" icon="book" onClick={onOpenInLibrary}>
          {t('library.viewer.openInLibrary')}
        </NNBtn>
        <NNBtn variant="ghost" size="sm" icon="x" ariaLabel={t('library.viewer.close')} title={t('library.viewer.close')} onClick={onClose} />
      </div>
      {/* Text chunk reader */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <TextChunkReader
          ref={readerRef}
          sourceId={sourceId}
          getSourceChunks={getSourceChunks}
          t={t}
        />
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <div
        style={{
          width: 440,
          flexShrink: 0,
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        {panel}
      </div>
    );
  }

  // Mobile — fullscreen sheet.
  return (
    <>
      <div className="nn-dialog-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 81, display: 'flex', flexDirection: 'column' }}>
        {panel}
      </div>
    </>
  );
};

// ── Left: sources panel ──────────────────────────────────────────────────────

interface SourcesPanelProps {
  sources: Source[];
  loaded: boolean;
  scope: Set<string>;
  addOpen: boolean;
  addProps: React.ComponentProps<typeof AddSourceForm>;
  onOpenAdd: () => void;
  onAttachFromLibrary: () => void;
  onToggleScope: (id: string) => void;
  onRename: (src: Source) => void;
  onDetach: (src: Source) => void;
  onReadInLibrary: (src: Source) => void;
  listSourceCards: (id: string) => Promise<SourceLinkedCard[]>;
  onOpenCard: (cardId: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const SourcesPanel = ({
  sources,
  loaded,
  scope,
  addOpen,
  addProps,
  onOpenAdd,
  onAttachFromLibrary,
  onToggleScope,
  onRename,
  onDetach,
  onReadInLibrary,
  listSourceCards,
  onOpenCard,
  t,
}: SourcesPanelProps) => (
  <div style={{ padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px', marginBottom: 2 }}>
      <span
        className="nn-chrome"
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: 'var(--text-dim)',
          flex: 1,
          userSelect: 'none',
        }}
      >
        {t('notebooks.sources.heading')}
      </span>
      <NNBtn variant="ghost" size="sm" icon="plus" onClick={onOpenAdd}>
        {t('notebooks.sources.add')}
      </NNBtn>
    </div>

    {/* Add from the library (attach an existing material). */}
    <div style={{ padding: '0 4px' }}>
      <NNBtn variant="soft" size="sm" icon="book" block onClick={onAttachFromLibrary}>
        {t('library.workspace.attachFromLibrary')}
      </NNBtn>
    </div>

    {addOpen && <AddSourceForm {...addProps} />}

    {!loaded ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <NNSkeleton style={{ height: 44 }} />
        <NNSkeleton style={{ height: 44 }} />
        <NNSkeleton style={{ height: 44 }} />
      </div>
    ) : sources.length === 0 ? (
      <div className="nn-empty-state" style={{ paddingTop: 24, paddingBottom: 24 }}>
        <span className="nn-empty-state-icon"><NNIcon name="stack" size={28} color="var(--text-dim)" /></span>
        <p className="nn-empty-state-hint">{t('notebooks.sources.empty')}</p>
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sources.map((src) => (
          <WorkspaceSourceRow
            key={src.id}
            source={src}
            inScope={scope.has(src.id)}
            onToggleScope={() => onToggleScope(src.id)}
            onRename={() => onRename(src)}
            onDetach={() => onDetach(src)}
            onReadInLibrary={() => onReadInLibrary(src)}
            listSourceCards={listSourceCards}
            onOpenCard={onOpenCard}
            t={t}
          />
        ))}
      </div>
    )}
  </div>
);

const WorkspaceSourceRow = ({
  source,
  inScope,
  onToggleScope,
  onRename,
  onDetach,
  onReadInLibrary,
  listSourceCards,
  onOpenCard,
  t,
}: {
  source: Source;
  inScope: boolean;
  onToggleScope: () => void;
  onRename: () => void;
  onDetach: () => void;
  onReadInLibrary: () => void;
  listSourceCards: (id: string) => Promise<SourceLinkedCard[]>;
  onOpenCard: (cardId: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) => {
  const isError = source.status === 'error';
  const ready = source.status === 'ready';
  const statusLabel =
    isError && source.errorCode
      ? t(`notebooks.status.${source.errorCode as IngestErrorCode}`)
      : t(`notebooks.status.${source.status}`);

  const [cardsOpen, setCardsOpen] = useState(false);
  const [cards, setCards] = useState<SourceLinkedCard[] | null>(null);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleCards = useCallback(async () => {
    const next = !cardsOpen;
    setCardsOpen(next);
    if (next && cards === null && !cardsLoading) {
      setCardsLoading(true);
      try {
        setCards(await listSourceCards(source.id));
      } catch {
        setCards([]);
      } finally {
        setCardsLoading(false);
      }
    }
  }, [cardsOpen, cards, cardsLoading, listSourceCards, source.id]);

  return (
    <div className="nn-source-row">
      {/* Main row: checkbox + icon + title (→ read in library) + status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={inScope}
          disabled={!ready}
          onChange={onToggleScope}
          aria-label={t('notebooks.workspace.inChat')}
          title={t('notebooks.workspace.inChat')}
          style={{ width: 14, height: 14, cursor: ready ? 'pointer' : 'default', accentColor: 'var(--lime-500)', flexShrink: 0 }}
        />
        <button
          type="button"
          onClick={onReadInLibrary}
          title={t('library.workspace.openInLibrary')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'left',
          }}
        >
          <NNIcon name={sourceIcon(source.kind)} size={13} color="var(--text-muted)" />
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              flex: 1,
              transition: 'color 100ms',
            }}
          >
            {source.title}
          </span>
        </button>
        {source.status !== 'ready' && (
          <NNBadge tone={statusTone(source.status)} size="xs">
            {statusLabel}
          </NNBadge>
        )}
        <div className="nn-source-row-actions" style={{ display: 'flex', gap: 0, flexShrink: 0, position: 'relative' }}>
          <NNBtn
            variant="ghost"
            size="sm"
            icon="edit"
            ariaLabel={t('notebooks.sources.rename')}
            title={t('notebooks.sources.rename')}
            onClick={onRename}
          />
          <NNBtn
            variant="ghost"
            size="sm"
            icon="dots"
            ariaLabel={t('library.item.menu')}
            title={t('library.item.menu')}
            onClick={() => setMenuOpen((v) => !v)}
          />
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div className="nn-lib-menu" style={{ right: 0, top: 'calc(100% + 4px)', minWidth: 180 }}>
                <button
                  type="button"
                  className="nn-lib-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onReadInLibrary();
                  }}
                >
                  <NNIcon name="book" size={14} color="var(--text-muted)" />
                  {t('library.workspace.openInLibrary')}
                </button>
                <button
                  type="button"
                  className="nn-lib-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onDetach();
                  }}
                >
                  <NNIcon name="x" size={14} color="var(--text-muted)" />
                  {t('library.workspace.detach')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cards counter row (ready sources only) */}
      {ready && (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 4, paddingLeft: 20 }}>
          <button
            type="button"
            onClick={toggleCards}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-sans)',
              fontSize: 11,
              padding: '1px 4px',
              borderRadius: 'var(--r-xs)',
            }}
          >
            <NNIcon name="stack" size={11} color="var(--text-dim)" />
            {cards === null
              ? t('notebooks.workspace.cardsButton')
              : t('notebooks.workspace.cardsCount', { count: cards.length })}
          </button>
        </div>
      )}

      {cardsOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4, paddingLeft: 20 }}>
          {cardsLoading ? (
            <NNSkeleton style={{ height: 28 }} />
          ) : (cards ?? []).length === 0 ? (
            <span style={{ fontSize: 11, color: 'var(--text-dim)', padding: '2px 0' }}>
              {t('notebooks.workspace.cardsEmpty')}
            </span>
          ) : (
            (cards ?? []).map((c) => (
              <button
                key={c.cardId}
                type="button"
                onClick={() => onOpenCard(c.cardId)}
                title={c.front}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 6px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-xs)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  {c.front}
                </span>
                <NNIcon name="chevr" size={10} color="var(--text-dim)" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ── L1 — "Add from library" attach picker (modal) ──────────────────────────────

const LibraryAttachPicker = ({
  attachedIds,
  listLibrary,
  onConfirm,
  onClose,
  t,
}: {
  attachedIds: Set<string>;
  listLibrary: (params?: { q?: string; limit?: number }) => Promise<{ items: LibraryItem[]; nextCursor: string | null }>;
  onConfirm: (sourceIds: string[]) => Promise<void> | void;
  onClose: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) => {
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await listLibrary({ q: debouncedQ || undefined, limit: 60 });
        if (!cancelled) setItems(res.items);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listLibrary, debouncedQ]);

  const toggle = useCallback((id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const confirm = useCallback(async () => {
    if (picked.size === 0 || busy) return;
    setBusy(true);
    await onConfirm([...picked]);
    setBusy(false);
  }, [picked, busy, onConfirm]);

  return (
    <>
      <div className="nn-dialog-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 91, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, pointerEvents: 'none' }}>
        <NNCard padding={16} style={{ width: 460, maxWidth: '100%', maxHeight: '76vh', display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'auto', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, flex: 1, fontFamily: 'var(--font-sans)' }}>
              {t('library.workspace.attachTitle')}
            </h3>
            <NNBtn variant="ghost" size="sm" icon="x" ariaLabel={t('library.details.close')} onClick={onClose} />
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('library.workspace.attachSearch')}
            style={{
              width: '100%',
              height: 32,
              padding: '0 10px',
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              color: 'var(--text)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          <div className="nn-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, minHeight: 80 }}>
            {items === null ? (
              <NNSkeleton style={{ height: 100 }} />
            ) : items.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--text-dim)', textAlign: 'center', padding: '24px 0', margin: 0 }}>
                {debouncedQ ? t('library.workspace.attachNoResults') : t('library.workspace.attachEmpty')}
              </p>
            ) : (
              items.map((it) => {
                const already = attachedIds.has(it.id);
                const checked = picked.has(it.id);
                return (
                  <label
                    key={it.id}
                    className="nn-lib-nb-link"
                    style={{
                      cursor: already ? 'default' : 'pointer',
                      opacity: already ? 0.5 : 1,
                      background: checked ? 'var(--surface-3)' : 'var(--surface-2)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked || already}
                      disabled={already}
                      onChange={() => !already && toggle(it.id)}
                      style={{ width: 14, height: 14, accentColor: 'var(--lime-500)', flexShrink: 0, cursor: already ? 'default' : 'pointer' }}
                    />
                    <NNIcon name={it.kind === 'url' ? 'link' : it.kind === 'text' ? 'edit' : 'book'} size={13} color="var(--text-muted)" />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                      {it.title}
                    </span>
                    {already && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t('library.details.alreadyIn')}</span>}
                  </label>
                );
              })
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <NNBtn variant="ghost" size="sm" onClick={onClose} disabled={busy}>{t('actions.cancel')}</NNBtn>
            <NNBtn variant="primary" size="sm" onClick={confirm} disabled={picked.size === 0 || busy}>
              {t('library.workspace.attachConfirm', { count: picked.size })}
            </NNBtn>
          </div>
        </NNCard>
      </div>
    </>
  );
};
