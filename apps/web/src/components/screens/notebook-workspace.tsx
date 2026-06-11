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
import { ChatPanel, type ComposerPrefillHandle } from '@/components/chat/chat-panel';
import { PdfReader, type PdfReaderHandle } from '@/components/pdf-reader/pdf-reader';
import { api, ok } from '@/lib/api';

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
        padding: '10px 12px',
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
            gap: 6,
            marginBottom: 5,
            fontFamily: 'var(--font-sans)',
          }}
        >
          {chunk.page != null && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.04em',
                color: 'var(--text-dim)',
                background: 'var(--surface-3)',
                padding: '1px 5px',
                borderRadius: 'var(--r-xs)',
                flexShrink: 0,
              }}
            >
              {t('notebooks.reader.page', { n: chunk.page })}
            </span>
          )}
          {chunk.heading && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-dim)',
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
          lineHeight: 1.7,
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
  // A pending mark to scroll+flash (from ?mark=), fulfilled once the PDF mounts
  // (PdfReader consumes initialMarkId after the marks load).
  const pendingMarkRef = useRef<string | undefined>(undefined);
  const [chunks, setChunks] = useState<SourceChunkRow[]>([]);
  const [chunkTotal, setChunkTotal] = useState(0);
  const [nextFrom, setNextFrom] = useState<number | null>(0);
  const [chunksLoading, setChunksLoading] = useState(false);
  const readerRef = useRef<HTMLDivElement>(null);

  // Chat thread selection (notebook mode — the workspace owns the switcher).
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  // M5 — composer prefill ref (chat ← reader «Спросить» action).
  const composerPrefillRef = useRef<ComposerPrefillHandle | null>(null);

  // M5 — chatEnabled for the quick-card AI formulate button.
  const [chatEnabled, setChatEnabled] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        const s = (await ok(await (api as any).ai.status.get())) as { chatEnabled: boolean };
        setChatEnabled(Boolean(s.chatEnabled));
      } catch {
        /* degrade — hide AI formulate */
      }
    })();
  }, []);

  // W5(a) — collapsible chat column (desktop only). Default: open on desktop, collapsed on tablet.
  const chatCollapseKey = `nn:nb:chat:${notebookId}`;
  const [chatCollapsed, setChatCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = localStorage.getItem(chatCollapseKey);
      if (stored !== null) return stored === 'true';
    } catch { /* ignore */ }
    // Default: collapsed on tablet, open on desktop (resolved at runtime).
    return false;
  });
  const toggleChatCollapsed = useCallback(() => {
    setChatCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(chatCollapseKey, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, [chatCollapseKey]);
  // On first mount (client), set default by breakpoint if no stored value.
  useEffect(() => {
    try {
      if (localStorage.getItem(chatCollapseKey) === null) {
        const defaultCollapsed = window.innerWidth < 1100;
        setChatCollapsed(defaultCollapsed);
      }
    } catch { /* ignore */ }
  // Run once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const markParam = searchParams.get('mark');
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

  // Consume ?source=&chunk=&pos=&page=&mark= once sources have loaded.
  const consumedSourceParamRef = useRef<string | null>(null);
  useEffect(() => {
    if (!sourcesLoaded || !sourceParam) return;
    const token = `${sourceParam}:${chunkParam ?? ''}:${posParam ?? ''}:${pageParam ?? ''}:${markParam ?? ''}`;
    if (consumedSourceParamRef.current === token) return;
    consumedSourceParamRef.current = token;
    const src = sources.find((s) => s.id === sourceParam);
    if (!src) return;
    setActiveSourceId(sourceParam);
    if (!isDesktop) setTab('reader');
    // A ?mark= deep link opens a PDF source in PDF mode and stashes the mark id
    // for PdfReader to scroll+flash once its marks load. A ?page= deep link
    // opens a PDF source in PDF mode at that page; otherwise fall back to the
    // text-chunk jump (chunk id / position).
    const pageNum = pageParam != null ? Number(pageParam) : undefined;
    if (src.kind === 'pdf' && markParam) {
      setReaderModePersisted('pdf');
      pendingMarkRef.current = markParam;
    } else if (src.kind === 'pdf' && pageNum != null && Number.isFinite(pageNum) && pageNum >= 1) {
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
    markParam,
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
      pendingMark={pendingMarkRef.current}
      onAskChat={(quote) => {
        composerPrefillRef.current?.prefill(`> ${quote}`);
        if (!isDesktop) setTab('chat');
      }}
      chatEnabled={chatEnabled}
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
          {/* W5(a) — collapsible chat column. Collapsed = 44px vertical rail. */}
          <div
            style={{
              width: chatCollapsed ? 44 : 420,
              flexShrink: 0,
              borderLeft: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              transition: 'width 200ms ease',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {chatCollapsed ? (
              /* Slim 44px rail: only the toggle button visible. */
              <button
                type="button"
                onClick={toggleChatCollapsed}
                title={t('notebooks.workspace.chatExpand')}
                aria-label={t('notebooks.workspace.chatExpand')}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {/* Chat icon */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                {/* Expand chevron */}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            ) : (
              /* Full chat panel with collapse toggle in header. */
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                {/* Chat panel header with collapse toggle */}
                <div
                  className="nn-chrome"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    padding: '0 8px',
                    borderBottom: '1px solid var(--border)',
                    height: 36,
                    flexShrink: 0,
                  }}
                >
                  <button
                    type="button"
                    onClick={toggleChatCollapsed}
                    title={t('notebooks.workspace.chatCollapse')}
                    aria-label={t('notebooks.workspace.chatCollapse')}
                    style={{
                      width: 28,
                      height: 28,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 'var(--r-sm)',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  {chatPanel}
                </div>
              </div>
            )}
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
          { key: 'sources', icon: '📚', labelKey: 'notebooks.workspace.tabSources' },
          { key: 'reader', icon: '📄', labelKey: 'notebooks.workspace.tabReader' },
          { key: 'chat', icon: '💬', labelKey: 'notebooks.workspace.tabChat' },
        ] as { key: WorkspaceTab; icon: string; labelKey: string }[]).map(({ key: tk, labelKey }) => (
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
  <div style={{ padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
    {/* Panel header — matches sidebar section style */}
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
    <div className={`nn-source-row${active ? ' active' : ''}`}>
      {/* Main row: checkbox + icon + title + status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* In-chat scope checkbox (ready sources only). */}
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
          onClick={onSelect}
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
              fontWeight: active ? 600 : 500,
              color: active ? 'var(--text)' : 'var(--text-muted)',
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
        {/* Status badge — only for non-ready */}
        {source.status !== 'ready' && (
          <NNBadge tone={statusTone(source.status)} size="xs">
            {statusLabel}
          </NNBadge>
        )}
        {/* Hover-revealed actions */}
        <div className="nn-source-row-actions" style={{ display: 'flex', gap: 0, flexShrink: 0 }}>
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
  pendingMark?: string;
  // M5 marks / quick-card.
  onAskChat?: (quote: string) => void;
  chatEnabled?: boolean;
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
      pendingMark,
      onAskChat,
      chatEnabled = false,
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
        <div className="nn-empty-state" style={{ flex: 1 }}>
          <span className="nn-empty-state-icon"><NNIcon name="doc" size={32} color="var(--text-dim)" /></span>
          <p className="nn-empty-state-hint">{t('notebooks.reader.empty')}</p>
        </div>
      );
    }

    // M4+M5 — native PDF reader (pdf.js + ink + marks). Mounts only for a ready
    // PDF source in PDF mode; pdf.js is dynamically imported INSIDE PdfReader.
    if (source.kind === 'pdf' && readerMode === 'pdf' && source.status === 'ready') {
      return (
        <PdfReader
          key={source.id}
          ref={pdfReaderRef}
          sourceId={source.id}
          sourceName={source.title}
          initialPage={pendingPage}
          initialMarkId={pendingMark}
          onMode={onReaderMode}
          onAskChat={onAskChat}
          chatEnabled={chatEnabled}
          t={t}
        />
      );
    }

    return (
      <div
        ref={ref}
        className="nn-scroll"
        style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 40px' }}
      >
        <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
            <h3
              style={{
                fontSize: 15,
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
              {source.title}
            </h3>
            {/* PDF sources can switch back to the native PDF reader. */}
            {source.kind === 'pdf' && (
              <button
                type="button"
                onClick={() => onReaderMode('pdf')}
                style={{
                  flexShrink: 0,
                  height: 26,
                  padding: '0 9px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 11.5,
                  fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {t('notebooks.reader.modePdf')}
              </button>
            )}
            {total > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
                {t('notebooks.reader.chunkCount', { count: total })}
              </span>
            )}
          </div>

          {source.status !== 'ready' ? (
            <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              {t('notebooks.reader.notReady')}
            </p>
          ) : chunks.length === 0 && loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <NNSkeleton style={{ height: 72 }} />
              <NNSkeleton style={{ height: 72 }} />
              <NNSkeleton style={{ height: 72 }} />
            </div>
          ) : chunks.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
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
