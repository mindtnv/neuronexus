'use client';

// NotebookWorkspace — the NotebookLM M2 three-panel workspace (T4).
//
//   ┌── sources ──┬──────── reader ────────┬──── chat ────┐
//   │ status      │ active source's parsed │ ChatPanel    │
//   │ ☑ in chat   │ chunks, lazy-paged,    │ (notebook)   │
//   │ N cards     │ scroll-to-chunk + lime │ + thread     │
//   │ + add       │ highlight fade         │ switcher     │
//   └─────────────┴────────────────────────┴──────────────┘
//
//  • Desktop (≥1100): three columns. Tablet/mobile: a tab switcher
//    (Источники | Чтение | Чат) per the project responsive shell.
//  • Left source list reuses the M1 SourceRow/AddSourceForm/status-poll logic.
//    A per-source checkbox toggles its inclusion in the chat scope (default all
//    ready sources; persisted per-notebook in localStorage nn:nb:scope:<id>).
//    «N карточек» fetches the source's generated cards lazily → jump to /cards.
//  • Center reader renders each chunk through the SAME markdown pipeline chat
//    answers use (renderCardHtml → SafeHtml — the sanitizer is untouched).
//  • Right panel is ChatPanel in 'notebook' mode (sourceIds = the checked set).
//
//  URL: `?source=<id>&chunk=<chunkId>&pos=<n>` opens the reader at that chunk;
//  `?thread=<convId>` selects a chat thread. useSearchParams is read under the
//  page-level <Suspense> (the route wraps this screen).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  MAX_SOURCE_BYTES_DEFAULT,
  SOURCE_MIME_TO_KIND,
  type IngestErrorCode,
  type SourceMime,
} from '@neuronexus/shared';
import { NNBtn, NNCard, NNIcon, NNBadge, NNSkeleton } from '@/components/ui';
import { renderCardHtml, SafeHtml } from '@/lib/render-card';
import { useNN } from '@/lib/store';
import type {
  Notebook,
  Source,
  SourceChunkRow,
  SourceLinkedCard,
} from '@/lib/types';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';
import { useDialog } from '@/components/dialog';
import { raiseToast } from '@/components/toasts';
import {
  AddSourceForm,
  NONTERMINAL,
  sourceIcon,
  statusTone,
  type AddKind,
} from '@/components/screens/notebooks';
import { ChatPanel } from '@/components/chat/chat-panel';
import { PdfReader, type PdfReaderHandle } from '@/components/pdf-reader/pdf-reader';

type WorkspaceTab = 'sources' | 'reader' | 'chat';

// One synthetic single-field "basic" note-type feeds chunk text through the same
// Markdown render pipeline chat answers use (renderCardHtml → DOMPurify via
// SafeHtml). The sanitizer stays the single security boundary — never edited.
const CHUNK_MD_NOTE_TYPE = {
  kind: 'basic' as const,
  templates: [{ name: 'chunk', ord: 0, frontTemplate: '{{Body}}', backTemplate: '{{Body}}' }],
};

const ReaderChunk = ({
  chunk,
  t,
}: {
  chunk: SourceChunkRow;
  t: (key: string, params?: Record<string, string | number>) => string;
}) => {
  const html = useMemo(
    () => renderCardHtml(CHUNK_MD_NOTE_TYPE, { Body: chunk.text }, 'front'),
    [chunk.text],
  );
  return (
    <div
      data-chunk-id={chunk.id}
      data-chunk-pos={chunk.position}
      className="nn-reader-chunk"
      style={{
        padding: '12px 14px',
        borderRadius: 'var(--r-md)',
        border: '1px solid transparent',
        transition: 'outline-color 600ms ease, background 600ms ease',
      }}
    >
      {(chunk.page != null || chunk.heading) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 6,
            fontSize: 11,
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {chunk.page != null && (
            <NNBadge tone="sky" size="xs">
              {t('notebooks.reader.page', { n: chunk.page })}
            </NNBadge>
          )}
          {chunk.heading && (
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {chunk.heading}
            </span>
          )}
        </div>
      )}
      <SafeHtml
        html={html}
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          lineHeight: 1.65,
          color: 'var(--text)',
          wordBreak: 'break-word',
        }}
      />
    </div>
  );
};

const READER_PAGE = 50;

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
  const deleteSource = useNN((s) => s.deleteSource);
  const getSourceChunks = useNN((s) => s.getSourceChunks);
  const listSourceCards = useNN((s) => s.listSourceCards);

  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);

  // Per-turn chat source scope: ids checked into the chat. Default = all ready
  // sources; persisted per-notebook in localStorage.
  const scopeKey = `nn:nb:scope:${notebookId}`;
  const [scope, setScope] = useState<Set<string>>(new Set());
  const scopeHydratedRef = useRef(false);

  // Active reader source + its loaded chunk pages.
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  // PDF|Text reader mode for the active source (M4). PDF sources default to 'pdf'
  // (persisted per source in localStorage); non-PDF sources are always 'text'.
  const [readerMode, setReaderMode] = useState<'pdf' | 'text'>('text');
  const pdfReaderRef = useRef<PdfReaderHandle>(null);
  // A pending page jump (from a citation / ?page=) fulfilled once the PDF mounts.
  const pendingPageRef = useRef<number | undefined>(undefined);
  const [chunks, setChunks] = useState<SourceChunkRow[]>([]);
  const [chunkTotal, setChunkTotal] = useState(0);
  const [nextFrom, setNextFrom] = useState<number | null>(0);
  const [chunksLoading, setChunksLoading] = useState(false);
  const readerRef = useRef<HTMLDivElement>(null);

  // Chat thread selection (notebook mode — the workspace owns the switcher).
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  // Mobile/tablet tab.
  const [tab, setTab] = useState<WorkspaceTab>('reader');

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

  // ── Deep-link params (?source=&chunk=&pos= / ?thread=) ───────────────────────
  const sourceParam = searchParams.get('source');
  const chunkParam = searchParams.get('chunk');
  const posParam = searchParams.get('pos');
  const pageParam = searchParams.get('page');
  const threadParam = searchParams.get('thread');
  // Pending scroll-to target, set from the URL or a citation; cleared once done.
  const pendingScrollRef = useRef<{ chunkId?: string; pos?: number } | null>(null);

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
        // Hydrate the chat scope: stored set ∩ ready sources, else all ready.
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
        // Default-open the first ready source in the reader.
        setActiveSourceId((prev) => prev ?? rows.find((s) => s.status === 'ready')?.id ?? null);
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

  // ── Poll non-terminal sources (M1 logic) ──────────────────────────────────────
  const hasPending = useMemo(() => sources.some((s) => NONTERMINAL.has(s.status)), [sources]);
  useEffect(() => {
    if (!hasPending) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      const pending = sources.filter((s) => NONTERMINAL.has(s.status));
      if (pending.length === 0) return;
      try {
        const updated = await Promise.all(pending.map((s) => getSource(s.id).catch(() => null)));
        if (cancelled) return;
        const byId = new Map(updated.filter(Boolean).map((s) => [s!.id, s!]));
        setSources((prev) =>
          prev.map((s) => {
            const fresh = byId.get(s.id);
            if (!fresh) return s;
            // A source that JUST became ready joins the chat scope by default.
            if (s.status !== 'ready' && fresh.status === 'ready') {
              setScopePersisted(new Set([...scope, fresh.id]));
            }
            return fresh;
          }),
        );
      } catch {
        /* transient; next tick retries */
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPending, sources, getSource]);

  // ── Reader: load chunk pages for the active source ────────────────────────────
  const loadChunks = useCallback(
    async (sourceId: string, from: number, append: boolean) => {
      setChunksLoading(true);
      try {
        const page = await getSourceChunks(sourceId, from, READER_PAGE);
        setChunkTotal(page.total);
        setNextFrom(page.nextFrom);
        setChunks((prev) => (append ? [...prev, ...page.items] : page.items));
      } catch {
        if (!append) {
          setChunks([]);
          setChunkTotal(0);
          setNextFrom(null);
        }
      } finally {
        setChunksLoading(false);
      }
    },
    [getSourceChunks],
  );

  // Reset + load when the active source changes.
  useEffect(() => {
    if (!activeSourceId) {
      setChunks([]);
      setChunkTotal(0);
      setNextFrom(0);
      return;
    }
    setChunks([]);
    setNextFrom(0);
    void loadChunks(activeSourceId, 0, false);
  }, [activeSourceId, loadChunks]);

  // ── Deep link → open reader at a chunk ────────────────────────────────────────
  const openChunk = useCallback((chunkId?: string, pos?: number) => {
    pendingScrollRef.current = { chunkId, pos };
  }, []);

  // Jump the PDF reader to a page (citation in PDF mode / ?page=). If the reader
  // is already mounted, scroll now; else stash for the PdfReader's initialPage.
  const jumpToPage = useCallback((page?: number) => {
    if (page == null || !Number.isFinite(page) || page < 1) return;
    pendingPageRef.current = page;
    pdfReaderRef.current?.scrollToPage(page, true);
  }, []);

  // Reader-mode hydrate when the active source changes: PDF sources read the
  // per-source preference (default 'pdf'); everything else is text-only.
  useEffect(() => {
    const src = sources.find((s) => s.id === activeSourceId) ?? null;
    if (src?.kind === 'pdf') {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(`nn:nb:readermode:${src.id}`);
      } catch {
        stored = null;
      }
      setReaderMode(stored === 'text' ? 'text' : 'pdf');
    } else {
      setReaderMode('text');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSourceId, sources]);

  const setReaderModePersisted = useCallback(
    (m: 'pdf' | 'text') => {
      setReaderMode(m);
      if (activeSourceId) {
        try {
          localStorage.setItem(`nn:nb:readermode:${activeSourceId}`, m);
        } catch {
          /* best-effort */
        }
      }
    },
    [activeSourceId],
  );

  // Consume ?source=&chunk=&pos=&page= once sources have loaded.
  const consumedSourceParamRef = useRef<string | null>(null);
  useEffect(() => {
    if (!sourcesLoaded || !sourceParam) return;
    const token = `${sourceParam}:${chunkParam ?? ''}:${posParam ?? ''}:${pageParam ?? ''}`;
    if (consumedSourceParamRef.current === token) return;
    consumedSourceParamRef.current = token;
    const src = sources.find((s) => s.id === sourceParam);
    if (!src) return;
    setActiveSourceId(sourceParam);
    if (!isDesktop) setTab('reader');
    // A ?page= deep link opens a PDF source in PDF mode at that page; otherwise
    // fall back to the text-chunk jump (chunk id / position).
    const pageNum = pageParam != null ? Number(pageParam) : undefined;
    if (src.kind === 'pdf' && pageNum != null && Number.isFinite(pageNum) && pageNum >= 1) {
      setReaderModePersisted('pdf');
      pendingPageRef.current = pageNum;
      jumpToPage(pageNum);
    } else {
      openChunk(chunkParam ?? undefined, posParam != null ? Number(posParam) : undefined);
    }
  }, [
    sourcesLoaded,
    sourceParam,
    chunkParam,
    posParam,
    pageParam,
    sources,
    isDesktop,
    openChunk,
    jumpToPage,
    setReaderModePersisted,
  ]);

  // Consume ?thread= once (notebook chat thread selection).
  const consumedThreadParamRef = useRef<string | null>(null);
  useEffect(() => {
    if (!threadParam) return;
    if (consumedThreadParamRef.current === threadParam) return;
    consumedThreadParamRef.current = threadParam;
    setActiveThreadId(threadParam);
    if (!isDesktop) setTab('chat');
  }, [threadParam, isDesktop]);

  // After chunks load, fulfil a pending scroll-to-chunk (load more pages until
  // the target position is in range), then scrollIntoView + lime highlight fade.
  useEffect(() => {
    const target = pendingScrollRef.current;
    if (!target || !activeSourceId) return;
    // If the target is identified by position and not yet loaded, page forward.
    if (
      target.pos != null &&
      nextFrom != null &&
      !chunksLoading &&
      !chunks.some((c) => c.position === target.pos)
    ) {
      void loadChunks(activeSourceId, nextFrom, true);
      return;
    }
    // Resolve the DOM node by chunk id (preferred) or position.
    const host = readerRef.current;
    if (!host) return;
    let node: HTMLElement | null = null;
    if (target.chunkId) node = host.querySelector(`[data-chunk-id="${CSS.escape(target.chunkId)}"]`);
    if (!node && target.pos != null) {
      node = host.querySelector(`[data-chunk-pos="${target.pos}"]`);
    }
    if (!node) {
      // Not found yet — if more pages remain, keep paging; else give up.
      if (nextFrom != null && !chunksLoading) void loadChunks(activeSourceId, nextFrom, true);
      else pendingScrollRef.current = null;
      return;
    }
    pendingScrollRef.current = null;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add('nn-chunk-flash');
    window.setTimeout(() => node?.classList.remove('nn-chunk-flash'), 2200);
  }, [chunks, chunksLoading, nextFrom, activeSourceId, loadChunks]);

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

  const onDeleteSource = useCallback(
    async (src: Source) => {
      const yes = await confirm({
        title: t('notebooks.sources.delete'),
        message: t('notebooks.sources.deleteConfirm'),
        danger: true,
        confirmLabel: t('actions.delete'),
      });
      if (!yes) return;
      await deleteSource(src.id);
      setSources((prev) => prev.filter((s) => s.id !== src.id));
      setScopePersisted(new Set([...scope].filter((id) => id !== src.id)));
      if (activeSourceId === src.id) setActiveSourceId(null);
    },
    [confirm, t, deleteSource, scope, setScopePersisted, activeSourceId],
  );

  // Notebook-mode chat thread change (the ChatPanel notifies; keep ?thread= in
  // the URL for shareable deep links).
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
  const activeSource = useMemo(
    () => sources.find((s) => s.id === activeSourceId) ?? null,
    [sources, activeSourceId],
  );

  // ── Panels ─────────────────────────────────────────────────────────────────────
  const sourcesPanel = (
    <SourcesPanel
      sources={sources}
      loaded={sourcesLoaded}
      scope={scope}
      activeSourceId={activeSourceId}
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
      onToggleScope={toggleScope}
      onSelectSource={(id) => {
        setActiveSourceId(id);
        if (!isDesktop) setTab('reader');
      }}
      onRename={onRenameSource}
      onDelete={onDeleteSource}
      listSourceCards={listSourceCards}
      onOpenCard={(cardId) => router.push(`/cards?focus=${cardId}`)}
      t={t}
    />
  );

  const readerPanel = (
    <ReaderPanel
      ref={readerRef}
      source={activeSource}
      chunks={chunks}
      total={chunkTotal}
      loading={chunksLoading}
      hasMore={nextFrom != null}
      onLoadMore={() => activeSourceId && nextFrom != null && void loadChunks(activeSourceId, nextFrom, true)}
      readerMode={readerMode}
      onReaderMode={setReaderModePersisted}
      pdfReaderRef={pdfReaderRef}
      pendingPage={pendingPageRef.current}
      t={t}
    />
  );

  const chatPanel = (
    <ChatPanel
      mode="notebook"
      notebookId={notebookId}
      sourceIds={scopeIds}
      activeThreadId={activeThreadId}
      onThreadChange={onThreadChange}
      onSourceCitation={(c) => {
        if (!c.sourceId) return;
        const src = sources.find((s) => s.id === c.sourceId);
        setActiveSourceId(c.sourceId);
        if (!isDesktop) setTab('reader');
        // PDF source + a known page → jump the PDF reader to that page; else
        // (no page, or non-PDF) fall back to the text-chunk jump.
        if (src?.kind === 'pdf' && c.page != null) {
          setReaderModePersisted('pdf');
          pendingPageRef.current = c.page;
          jumpToPage(c.page);
        } else {
          if (src?.kind === 'pdf') setReaderModePersisted('text');
          openChunk(c.sourceChunkId, c.position);
        }
      }}
    />
  );

  // ── Layout ─────────────────────────────────────────────────────────────────────
  const header = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      <NNBtn variant="ghost" size="sm" icon="chevl" onClick={() => router.push('/notebooks')}>
        {t('notebooks.sources.back')}
      </NNBtn>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          fontFamily: 'var(--font-sans)',
          color: 'var(--text)',
          margin: 0,
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {notebook?.title ?? t('notebooks.sources.heading')}
      </h2>
    </div>
  );

  if (isDesktop) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {header}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div
            style={{
              width: 260,
              flexShrink: 0,
              borderRight: '1px solid var(--border)',
              overflowY: 'auto',
            }}
            className="nn-scroll"
          >
            {sourcesPanel}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {readerPanel}
          </div>
          <div
            style={{
              width: 420,
              flexShrink: 0,
              borderLeft: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            {chatPanel}
          </div>
        </div>
      </div>
    );
  }

  // Tablet / mobile — a tab switcher between the three panels.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {header}
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {(['sources', 'reader', 'chat'] as WorkspaceTab[]).map((tk) => (
          <NNBtn
            key={tk}
            size="sm"
            variant={tab === tk ? 'soft' : 'ghost'}
            active={tab === tk}
            onClick={() => setTab(tk)}
          >
            {t(`notebooks.workspace.tab${tk === 'sources' ? 'Sources' : tk === 'reader' ? 'Reader' : 'Chat'}`)}
          </NNBtn>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {tab === 'sources' && (
          <div className="nn-scroll" style={{ flex: 1, overflowY: 'auto' }}>
            {sourcesPanel}
          </div>
        )}
        {tab === 'reader' && readerPanel}
        {tab === 'chat' && chatPanel}
      </div>
    </div>
  );
};

// ── Left: sources panel ──────────────────────────────────────────────────────

interface SourcesPanelProps {
  sources: Source[];
  loaded: boolean;
  scope: Set<string>;
  activeSourceId: string | null;
  addOpen: boolean;
  addProps: React.ComponentProps<typeof AddSourceForm>;
  onOpenAdd: () => void;
  onToggleScope: (id: string) => void;
  onSelectSource: (id: string) => void;
  onRename: (src: Source) => void;
  onDelete: (src: Source) => void;
  listSourceCards: (id: string) => Promise<SourceLinkedCard[]>;
  onOpenCard: (cardId: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const SourcesPanel = ({
  sources,
  loaded,
  scope,
  activeSourceId,
  addOpen,
  addProps,
  onOpenAdd,
  onToggleScope,
  onSelectSource,
  onRename,
  onDelete,
  listSourceCards,
  onOpenCard,
  t,
}: SourcesPanelProps) => (
  <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          color: 'var(--text-dim)',
          flex: 1,
        }}
      >
        {t('notebooks.sources.heading')}
      </span>
      <NNBtn variant="primary" size="sm" icon="plus" onClick={onOpenAdd}>
        {t('notebooks.sources.add')}
      </NNBtn>
    </div>

    {addOpen && <AddSourceForm {...addProps} />}

    {!loaded ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <NNSkeleton style={{ height: 52 }} />
        <NNSkeleton style={{ height: 52 }} />
      </div>
    ) : sources.length === 0 ? (
      <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '12px 0' }}>
        {t('notebooks.sources.empty')}
      </p>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sources.map((src) => (
          <WorkspaceSourceRow
            key={src.id}
            source={src}
            active={src.id === activeSourceId}
            inScope={scope.has(src.id)}
            onToggleScope={() => onToggleScope(src.id)}
            onSelect={() => onSelectSource(src.id)}
            onRename={() => onRename(src)}
            onDelete={() => onDelete(src)}
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
  active,
  inScope,
  onToggleScope,
  onSelect,
  onRename,
  onDelete,
  listSourceCards,
  onOpenCard,
  t,
}: {
  source: Source;
  active: boolean;
  inScope: boolean;
  onToggleScope: () => void;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
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
    <NNCard
      padding={10}
      style={{
        background: active ? 'var(--surface-3)' : 'var(--surface-2)',
        border: active ? '1px solid var(--lime-500)' : '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* In-chat scope checkbox (ready sources only). */}
        <input
          type="checkbox"
          checked={inScope}
          disabled={!ready}
          onChange={onToggleScope}
          aria-label={t('notebooks.workspace.inChat')}
          title={t('notebooks.workspace.inChat')}
          style={{ width: 15, height: 15, cursor: ready ? 'pointer' : 'default', accentColor: 'var(--lime-500)' }}
        />
        <button
          type="button"
          onClick={onSelect}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'left',
          }}
        >
          <NNIcon name={sourceIcon(source.kind)} size={15} color="var(--text-muted)" />
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
            {source.title}
          </span>
        </button>
        <NNBadge tone={statusTone(source.status)} size="xs">
          {statusLabel}
        </NNBadge>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {ready && (
          <button
            type="button"
            onClick={toggleCards}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-sans)',
              fontSize: 11.5,
              padding: '2px 0',
            }}
          >
            <NNIcon name="stack" size={12} color="var(--text-dim)" />
            {cards === null
              ? t('notebooks.workspace.cardsButton')
              : t('notebooks.workspace.cardsCount', { count: cards.length })}
          </button>
        )}
        <span style={{ flex: 1 }} />
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
          icon="x"
          ariaLabel={t('notebooks.sources.delete')}
          title={t('notebooks.sources.delete')}
          onClick={onDelete}
        />
      </div>

      {cardsOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {cardsLoading ? (
            <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
              {t('notebooks.workspace.cardsLoading')}
            </span>
          ) : (cards ?? []).length === 0 ? (
            <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
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
                  gap: 6,
                  padding: '5px 7px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-sm)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <span
                  style={{
                    fontSize: 11.5,
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
                <NNIcon name="chevr" size={11} color="var(--text-dim)" />
              </button>
            ))
          )}
        </div>
      )}
    </NNCard>
  );
};

// ── Center: reader panel ─────────────────────────────────────────────────────

interface ReaderPanelProps {
  source: Source | null;
  chunks: SourceChunkRow[];
  total: number;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  // M4 PDF mode.
  readerMode: 'pdf' | 'text';
  onReaderMode: (m: 'pdf' | 'text') => void;
  pdfReaderRef: React.RefObject<PdfReaderHandle | null>;
  pendingPage?: number;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const ReaderPanel = React.forwardRef<HTMLDivElement, ReaderPanelProps>(
  (
    {
      source,
      chunks,
      total,
      loading,
      hasMore,
      onLoadMore,
      readerMode,
      onReaderMode,
      pdfReaderRef,
      pendingPage,
      t,
    },
    ref,
  ) => {
    // Auto-load the next page when the sentinel scrolls into view.
    const sentinelRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const el = sentinelRef.current;
      if (!el || !hasMore || loading) return;
      const io = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) onLoadMore();
        },
        { rootMargin: '300px' },
      );
      io.observe(el);
      return () => io.disconnect();
    }, [hasMore, loading, onLoadMore]);

    if (!source) {
      return (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-dim)',
            fontSize: 14,
            padding: 24,
            textAlign: 'center',
          }}
        >
          {t('notebooks.reader.empty')}
        </div>
      );
    }

    // M4 — native PDF reader (pdf.js + ink). Mounts only for a ready PDF source in
    // PDF mode; pdf.js is dynamically imported INSIDE PdfReader (never SSR'd).
    if (source.kind === 'pdf' && readerMode === 'pdf' && source.status === 'ready') {
      return (
        <PdfReader
          key={source.id}
          ref={pdfReaderRef}
          sourceId={source.id}
          initialPage={pendingPage}
          onMode={onReaderMode}
          t={t}
        />
      );
    }

    return (
      <div
        ref={ref}
        className="nn-scroll"
        style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 700,
                fontFamily: 'var(--font-sans)',
                color: 'var(--text)',
                margin: 0,
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {source.title}
            </h3>
            {/* PDF sources can switch back to the native PDF reader. */}
            {source.kind === 'pdf' && (
              <button
                type="button"
                onClick={() => onReaderMode('pdf')}
                style={{
                  flexShrink: 0,
                  height: 28,
                  padding: '0 10px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {t('notebooks.reader.modePdf')}
              </button>
            )}
            {total > 0 && (
              <span style={{ fontSize: 11.5, color: 'var(--text-dim)', flexShrink: 0 }}>
                {t('notebooks.reader.chunkCount', { count: total })}
              </span>
            )}
          </div>

          {source.status !== 'ready' ? (
            <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              {t('notebooks.reader.notReady')}
            </p>
          ) : chunks.length === 0 && loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <NNSkeleton style={{ height: 80 }} />
              <NNSkeleton style={{ height: 80 }} />
            </div>
          ) : chunks.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              {t('notebooks.reader.noText')}
            </p>
          ) : (
            <>
              {chunks.map((chunk) => (
                <ReaderChunk key={chunk.id} chunk={chunk} t={t} />
              ))}
              {hasMore && (
                <>
                  <div ref={sentinelRef} style={{ height: 1 }} />
                  <NNBtn
                    variant="ghost"
                    size="sm"
                    onClick={onLoadMore}
                    disabled={loading}
                    style={{ alignSelf: 'center' }}
                  >
                    {loading ? t('notebooks.reader.loading') : t('notebooks.reader.loadMore')}
                  </NNBtn>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  },
);
ReaderPanel.displayName = 'ReaderPanel';
