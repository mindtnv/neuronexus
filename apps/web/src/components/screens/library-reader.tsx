'use client';

// LibraryReader (L2) — the full-screen reader at `/library/[id]`. The complete
// M4/M5 reading-first workflow (PDF + ink + highlights + notes + quick-card +
// «Разметка» panel + selection popover) moved here OUT of the notebook workspace
// (Р6): reading no longer requires a notebook. On top of M5 it adds:
//   • a table of contents (PDF outline / distinct text headings)
//   • server-side reading progress (PUT /library/items/:id/reading-state, 5 s
//     debounce) with a one-time migration of the nn:pdf:pos localStorage cache
//   • the «Спросить» handoff into a notebook's grounded chat (Р7) instead of a
//     local chat surface
//   • deep links ?page=&chunk=&pos=&mark=
//
// pdf.js loading is UNTOUCHED — PdfReader still dynamically imports the vendored
// native-ESM build; this screen only changes where it is mounted.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NNBadge, NNBtn, NNIcon, NNSkeleton } from '@/components/ui';
import { api, ok } from '@/lib/api';
import { useNN } from '@/lib/store';
import type { LibraryItemDetail, Source, SourceChunkRow } from '@/lib/types';
import { useT } from '@/lib/i18n';
import { useDialog } from '@/components/dialog';
import { raiseToast } from '@/components/toasts';
import { PdfReader, type PdfOutlineEntry, type PdfReaderHandle } from '@/components/pdf-reader/pdf-reader';
import { TextChunkReader, type TextChunkReaderHandle } from '@/components/screens/text-reader';
import {
  formatHandoffPrefill,
  planHandoff,
  prefillKey,
  type HandoffNotebook,
} from '@/lib/library-handoff';

type Tr = (key: string, params?: Record<string, string | number>) => string;

const READING_STATE_DEBOUNCE_MS = 5000;
const TOC_KEY = (id: string) => `nn:lib:toc:${id}`;
const POS_KEY = (id: string) => `nn:pdf:pos:${id}`;

/** A unified TOC entry (PDF outline → page; text heading → chunk position). */
interface TocEntry {
  label: string;
  depth: number;
  page?: number | null;
  pos?: number;
}

export const LibraryReader = ({ sourceId }: { sourceId: string }) => {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { confirm } = useDialog();

  const getSource = useNN((s) => s.getSource);
  const getLibraryItem = useNN((s) => s.getLibraryItem);
  const getSourceChunks = useNN((s) => s.getSourceChunks);
  const putReadingState = useNN((s) => s.putReadingState);
  const listNotebooks = useNN((s) => s.listNotebooks);
  const createNotebook = useNN((s) => s.createNotebook);
  const attachSources = useNN((s) => s.attachSources);
  const patchLibraryItem = useNN((s) => s.patchLibraryItem);
  const uploadMedia = useNN((s) => s.uploadMedia);

  const [source, setSource] = useState<Source | null>(null);
  const [detail, setDetail] = useState<LibraryItemDetail | null>(null);
  const [loaded, setLoaded] = useState(false);

  // PDF | Text reader mode. PDF sources default to 'pdf' (persisted per source);
  // non-PDF sources are always 'text'.
  const [readerMode, setReaderMode] = useState<'pdf' | 'text'>('text');
  const pdfReaderRef = useRef<PdfReaderHandle>(null);
  const textReaderRef = useRef<TextChunkReaderHandle>(null);

  // chatEnabled gates the quick-card AI formulate button (degrade silently).
  const [chatEnabled, setChatEnabled] = useState(false);

  // ── TOC state ─────────────────────────────────────────────────────────────────
  const [tocOpen, setTocOpen] = useState(false);
  const [tocEntries, setTocEntries] = useState<TocEntry[] | null>(null);

  // ── «Спросить» handoff state ────────────────────────────────────────────────────
  const [handoffQuote, setHandoffQuote] = useState<string | null>(null);

  // Deep-link params (?page=&chunk=&pos=&mark=) — consume-and-clear once.
  const pageParam = searchParams.get('page');
  const chunkParam = searchParams.get('chunk');
  const posParam = searchParams.get('pos');
  const markParam = searchParams.get('mark');
  const pendingPageRef = useRef<number | undefined>(undefined);
  const pendingMarkRef = useRef<string | undefined>(undefined);
  const pendingChunkRef = useRef<{ chunkId?: string; pos?: number } | null>(null);

  // ── Load the source + library detail ────────────────────────────────────────────
  // The initial reader mode AND the initial scroll position (deep-link > server
  // reading-state > localStorage cache) are resolved SYNCHRONOUSLY here, before
  // `setLoaded(true)` mounts the reader — PdfReader reads `initialPage` only once
  // at mount, so the refs must be set in the same tick as the mount-triggering
  // state change (an effect would run one render too late).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [src, det] = await Promise.all([
          getSource(sourceId),
          getLibraryItem(sourceId).catch(() => null),
        ]);
        if (cancelled) return;

        // Resolve the initial reader mode.
        let mode: 'pdf' | 'text' = 'text';
        if (src.kind === 'pdf') {
          let stored: string | null = null;
          try {
            stored = localStorage.getItem(`nn:nb:readermode:${src.id}`);
          } catch {
            stored = null;
          }
          mode = stored === 'text' ? 'text' : 'pdf';
        }

        // Resolve the initial scroll target — deep link wins, then the persisted
        // server reading-state, then the localStorage position cache (migrated).
        const pageNum = pageParam != null ? Number(pageParam) : undefined;
        const posNum = posParam != null ? Number(posParam) : undefined;
        if (src.kind === 'pdf' && markParam) {
          mode = 'pdf';
          pendingMarkRef.current = markParam;
        } else if (src.kind === 'pdf' && pageNum != null && Number.isFinite(pageNum) && pageNum >= 1) {
          mode = 'pdf';
          pendingPageRef.current = pageNum;
        } else if (chunkParam || (posNum != null && Number.isFinite(posNum))) {
          if (src.kind === 'pdf') mode = 'text';
          pendingChunkRef.current = { chunkId: chunkParam ?? undefined, pos: posNum };
        } else {
          // No deep link — restore the saved reading position.
          const rs = det?.readingState ?? null;
          if (src.kind === 'pdf') {
            if (rs?.page != null && rs.page >= 1) {
              pendingPageRef.current = rs.page;
            } else {
              try {
                const raw = localStorage.getItem(POS_KEY(sourceId));
                if (raw) {
                  const { page } = JSON.parse(raw) as { page?: number };
                  if (typeof page === 'number' && page >= 1) {
                    pendingPageRef.current = page;
                    void putReadingState(sourceId, { page });
                  }
                }
              } catch {
                /* ignore */
              }
            }
          } else if (rs?.chunkPos != null && rs.chunkPos >= 0) {
            pendingChunkRef.current = { pos: rs.chunkPos };
          }
        }

        setSource(src);
        setDetail(det);
        setReaderMode(mode);
        // Persist a deep-link mode override (so a citation that forced text/pdf
        // sticks); a plain restore keeps the stored preference untouched.
        if (src.kind === 'pdf' && (markParam || pageParam || chunkParam || posParam)) {
          try {
            localStorage.setItem(`nn:nb:readermode:${src.id}`, mode);
          } catch {
            /* best-effort */
          }
        }
        // Clear the deep-link params from the URL (eat-and-clear).
        if (pageParam || chunkParam || posParam || markParam) {
          router.replace(`/library/${sourceId}`, { scroll: false });
        }
      } catch {
        if (!cancelled) setSource(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, getSource, getLibraryItem]);

  // chatEnabled (degrade — hide AI formulate).
  useEffect(() => {
    void (async () => {
      try {
        const s = (await ok(await (api as any).ai.status.get())) as { chatEnabled: boolean };
        setChatEnabled(Boolean(s.chatEnabled));
      } catch {
        /* hide */
      }
    })();
  }, []);

  const setReaderModePersisted = useCallback(
    (m: 'pdf' | 'text') => {
      setReaderMode(m);
      try {
        localStorage.setItem(`nn:nb:readermode:${sourceId}`, m);
      } catch {
        /* best-effort */
      }
    },
    [sourceId],
  );

  // Debounced server progress writer (5 s).
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeProgress = useCallback(
    (state: { page?: number; chunkPos?: number; percent?: number }) => {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
      progressTimerRef.current = setTimeout(() => {
        void putReadingState(sourceId, state).catch(() => {});
      }, READING_STATE_DEBOUNCE_MS);
    },
    [putReadingState, sourceId],
  );
  useEffect(
    () => () => {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    },
    [],
  );

  const onPdfPageChange = useCallback(
    (page: number, numPages: number) => {
      const percent = numPages > 0 ? Math.min(1, Math.max(0, page / numPages)) : undefined;
      writeProgress({ page, percent });
    },
    [writeProgress],
  );

  const onTextPositionChange = useCallback(
    (pos: number, total: number) => {
      const percent = total > 0 ? Math.min(1, Math.max(0, (pos + 1) / total)) : undefined;
      writeProgress({ chunkPos: pos, percent });
    },
    [writeProgress],
  );

  // ── L3 — lazy PDF cover + pageCount/author backfill (NULL DB fields only) ──────
  // Fires once per open from PdfReader after the doc loads. We render page 1 to a
  // ~480px webp, upload it as a media object, and PATCH coverMediaId — plus
  // pageCount/author — but ONLY for fields the server still has as NULL (never
  // clobber a manual edit). One attempt, no retries.
  const docInfoDoneRef = useRef(false);
  const onDocInfo = useCallback(
    async (info: { numPages: number; author?: string; renderCover: () => Promise<Blob | null> }) => {
      if (docInfoDoneRef.current) return;
      docInfoDoneRef.current = true;
      const cur = detail ?? null;
      const patch: { pageCount?: number; author?: string; coverMediaId?: string } = {};
      if ((cur?.pageCount ?? null) == null && info.numPages > 0) {
        patch.pageCount = info.numPages;
      }
      if ((cur?.author ?? null) == null && info.author) {
        patch.author = info.author;
      }
      // Cover only when none is set yet.
      const hasCover = cur?.coverMediaId != null;
      try {
        if (!hasCover) {
          const blob = await info.renderCover();
          if (blob) {
            const file = new File([blob], 'cover.webp', { type: 'image/webp' });
            const { mediaId } = await uploadMedia(file);
            patch.coverMediaId = mediaId;
          }
        }
        if (Object.keys(patch).length > 0) {
          const updated = await patchLibraryItem(sourceId, patch);
          setDetail((prev) => (prev ? { ...prev, ...updated } : prev));
        }
      } catch {
        /* best-effort — a cover failure never affects reading */
      }
    },
    [detail, sourceId, uploadMedia, patchLibraryItem],
  );

  // ── TOC building (PDF outline via the reader handle / text headings) ──────────────
  const buildTextToc = useCallback(async () => {
    // Walk chunk pages and collect the FIRST chunk of each distinct heading.
    const entries: TocEntry[] = [];
    const seen = new Set<string>();
    let from = 0;
    for (let guard = 0; guard < 60; guard++) {
      let page: { items: SourceChunkRow[]; total: number; nextFrom: number | null };
      try {
        page = await getSourceChunks(sourceId, from, 200);
      } catch {
        break;
      }
      for (const c of page.items) {
        const h = c.heading?.trim();
        if (!h || seen.has(h)) continue;
        seen.add(h);
        entries.push({ label: h, depth: 0, pos: c.position });
      }
      if (page.nextFrom == null) break;
      from = page.nextFrom;
    }
    return entries;
  }, [getSourceChunks, sourceId]);

  const ensureToc = useCallback(async () => {
    if (tocEntries !== null) return tocEntries;
    let entries: TocEntry[] = [];
    if (source?.kind === 'pdf' && readerMode === 'pdf') {
      const outline: PdfOutlineEntry[] = (await pdfReaderRef.current?.getOutline()) ?? [];
      entries = outline.map((o) => ({ label: o.title, depth: o.depth, page: o.page }));
    } else {
      entries = await buildTextToc();
    }
    setTocEntries(entries);
    return entries;
  }, [tocEntries, source, readerMode, buildTextToc]);

  const onToggleToc = useCallback(() => {
    setTocOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(TOC_KEY(sourceId), next ? '1' : '0');
      } catch {
        /* best-effort */
      }
      if (next) void ensureToc();
      return next;
    });
  }, [ensureToc, sourceId]);

  // Probe TOC availability in the BACKGROUND so the toolbar button can hide when
  // there's no outline/headings (the toggle is gated on `tocAvailable`). For PDF
  // the outline needs the doc loaded — retry a few times until it resolves.
  useEffect(() => {
    if (!loaded || !source || tocEntries !== null) return;
    let cancelled = false;
    let attempts = 0;
    const probe = async () => {
      if (cancelled) return;
      if (source.kind === 'pdf' && readerMode === 'pdf') {
        const outline = (await pdfReaderRef.current?.getOutline()) ?? [];
        if (cancelled) return;
        if (outline.length > 0) {
          setTocEntries(outline.map((o) => ({ label: o.title, depth: o.depth, page: o.page })));
          return;
        }
        // Doc may not be ready yet (returns []) — retry, then settle on empty.
        if (attempts++ < 8) {
          window.setTimeout(() => void probe(), 700);
          return;
        }
        setTocEntries([]);
      } else {
        const entries = await buildTextToc();
        if (!cancelled) setTocEntries(entries);
      }
    };
    void probe();
    return () => {
      cancelled = true;
    };
  }, [loaded, source, readerMode, tocEntries, buildTextToc]);

  // Hydrate the persisted TOC-open preference once the source is known.
  useEffect(() => {
    if (!loaded || !source) return;
    try {
      if (localStorage.getItem(TOC_KEY(sourceId)) === '1') {
        setTocOpen(true);
        void ensureToc();
      }
    } catch {
      /* default closed */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, source]);

  // Rebuild the TOC when switching reader mode (PDF outline ↔ text headings differ).
  const lastTocModeRef = useRef<'pdf' | 'text' | null>(null);
  useEffect(() => {
    if (lastTocModeRef.current != null && lastTocModeRef.current !== readerMode) {
      setTocEntries(null);
      if (tocOpen) void ensureToc();
    }
    lastTocModeRef.current = readerMode;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readerMode]);

  const onTocJump = useCallback(
    (entry: TocEntry) => {
      if (source?.kind === 'pdf' && readerMode === 'pdf' && entry.page != null) {
        pdfReaderRef.current?.scrollToPage(entry.page, true);
      } else if (entry.pos != null) {
        textReaderRef.current?.scrollToChunk(undefined, entry.pos);
      }
    },
    [source, readerMode],
  );

  // Fulfil a pending text-chunk jump (deep link or restored position) once the
  // text reader mounts. The TextChunkReader itself pages forward + flashes; here
  // we just hand it the target. (The deep-link page/mark targets for PDF are
  // resolved synchronously in the load effect and ride PdfReader's initialPage.)
  useEffect(() => {
    if (readerMode !== 'text') return;
    const p = pendingChunkRef.current;
    if (!p) return;
    pendingChunkRef.current = null;
    textReaderRef.current?.scrollToChunk(p.chunkId, p.pos);
  }, [readerMode, loaded]);

  // ── «Спросить» handoff (Р7) ──────────────────────────────────────────────────────
  const runHandoff = useCallback(
    async (notebooks: HandoffNotebook[], quote: string) => {
      const plan = planHandoff(notebooks);
      const go = (notebookId: string) => {
        try {
          sessionStorage.setItem(
            prefillKey(notebookId),
            formatHandoffPrefill(quote, source?.title ?? null),
          );
        } catch {
          /* best-effort */
        }
        router.push(`/notebooks/${notebookId}`);
      };
      if (plan.kind === 'single') {
        go(plan.notebookId);
      } else if (plan.kind === 'pick') {
        // The picker UI is rendered from handoffQuote — surface it.
        setHandoffQuote(quote);
      } else {
        // No notebook — create one named after the source, attach, then go.
        try {
          const nb = await createNotebook(source?.title ?? t('library.reader.handoffNewNotebook'));
          await attachSources(nb.id, [sourceId]);
          go(nb.id);
        } catch {
          raiseToast({ kind: 'info', title: t('library.reader.handoffFailed') });
        }
      }
    },
    [router, source, sourceId, createNotebook, attachSources, t],
  );

  const onAskChat = useCallback(
    (quote: string) => {
      // Strip a leading "> " block marker the reader prepends — we re-format.
      const clean = quote.replace(/^>\s?/gm, '').trim();
      const nbs = (detail?.notebooks ?? []) as HandoffNotebook[];
      if (nbs.length === 1) {
        void runHandoff(nbs, clean);
      } else if (nbs.length === 0) {
        void runHandoff(nbs, clean);
      } else {
        setHandoffQuote(clean);
      }
    },
    [detail, runHandoff],
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loaded && !source) {
    return (
      <div className="nn-empty-state" style={{ flex: 1, minHeight: 0 }}>
        <span className="nn-empty-state-icon"><NNIcon name="doc" size={32} color="var(--text-dim)" /></span>
        <p className="nn-empty-state-hint">{t('library.reader.notFound')}</p>
        <NNBtn variant="soft" size="sm" icon="chevl" onClick={() => router.push('/library')}>
          {t('library.reader.back')}
        </NNBtn>
      </div>
    );
  }

  const isPdfReady = source?.kind === 'pdf' && readerMode === 'pdf' && source.status === 'ready';
  const tocAvailable = (tocEntries?.length ?? 0) > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <ReaderHeader
        source={source}
        author={detail?.author ?? null}
        coverUrl={detail?.coverUrl ?? null}
        onBack={() => router.push('/library')}
        onDetails={() => router.push(`/library?focus=${sourceId}`)}
        t={t}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {/* TOC panel (left slide-out) */}
        {tocOpen && (
          <TocPanel
            entries={tocEntries}
            onJump={(e) => onTocJump(e)}
            onClose={() => onToggleToc()}
            t={t}
          />
        )}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {!loaded || !source ? (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 680, margin: '0 auto', width: '100%' }}>
              <NNSkeleton style={{ height: 80 }} />
              <NNSkeleton style={{ height: 80 }} />
              <NNSkeleton style={{ height: 80 }} />
            </div>
          ) : isPdfReady ? (
            <PdfReader
              key={source.id}
              ref={pdfReaderRef}
              sourceId={source.id}
              sourceName={source.title}
              initialPage={pendingPageRef.current}
              initialMarkId={pendingMarkRef.current}
              onMode={setReaderModePersisted}
              onAskChat={onAskChat}
              chatEnabled={chatEnabled}
              onPageChange={onPdfPageChange}
              onDocInfo={onDocInfo}
              tocOpen={tocOpen}
              tocAvailable={tocAvailable}
              onToggleToc={onToggleToc}
              t={t}
            />
          ) : (
            <TextReaderShell
              source={source}
              getSourceChunks={getSourceChunks}
              textReaderRef={textReaderRef}
              onPositionChange={onTextPositionChange}
              tocOpen={tocOpen}
              onToggleToc={onToggleToc}
              onMode={setReaderModePersisted}
              t={t}
            />
          )}
        </div>
      </div>

      {/* «Спросить» notebook picker (>1 notebook). */}
      {handoffQuote != null && (
        <HandoffPicker
          quote={handoffQuote}
          notebooks={(detail?.notebooks ?? []) as HandoffNotebook[]}
          listNotebooks={listNotebooks}
          onPick={(notebookId) => {
            try {
              sessionStorage.setItem(prefillKey(notebookId), formatHandoffPrefill(handoffQuote, source?.title ?? null));
            } catch {
              /* best-effort */
            }
            setHandoffQuote(null);
            router.push(`/notebooks/${notebookId}`);
          }}
          onClose={() => setHandoffQuote(null)}
          t={t}
        />
      )}
    </div>
  );
};

// ── Header ────────────────────────────────────────────────────────────────────

const ReaderHeader = ({
  source,
  author,
  coverUrl,
  onBack,
  onDetails,
  t,
}: {
  source: Source | null;
  author: string | null;
  coverUrl: string | null;
  onBack: () => void;
  onDetails: () => void;
  t: Tr;
}) => (
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
    <NNBtn variant="ghost" size="sm" icon="chevl" onClick={onBack}>
      {t('library.reader.back')}
    </NNBtn>
    {coverUrl && (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={coverUrl}
        alt=""
        style={{ width: 22, height: 30, objectFit: 'cover', borderRadius: 3, flexShrink: 0, border: '1px solid var(--border)' }}
      />
    )}
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <h2
        style={{
          fontSize: 14,
          fontWeight: 700,
          fontFamily: 'var(--font-sans)',
          color: 'var(--text)',
          margin: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          letterSpacing: '-0.01em',
        }}
      >
        {source?.title ?? t('library.reader.loading')}
      </h2>
      {author && (
        <span
          style={{
            fontSize: 11.5,
            color: 'var(--text-dim)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {author}
        </span>
      )}
    </div>
    {source && source.status !== 'ready' && (
      <NNBadge tone={source.status === 'error' ? 'rose' : 'sky'} size="xs">
        {t(`library.status.${source.status}`)}
      </NNBadge>
    )}
    <NNBtn variant="ghost" size="sm" icon="dots" ariaLabel={t('library.reader.details')} title={t('library.reader.details')} onClick={onDetails} />
  </div>
);

// ── Text-mode shell (light toolbar + TextChunkReader) ─────────────────────────

const TextReaderShell = ({
  source,
  getSourceChunks,
  textReaderRef,
  onPositionChange,
  tocOpen,
  onToggleToc,
  onMode,
  t,
}: {
  source: Source;
  getSourceChunks: (
    id: string,
    from?: number,
    limit?: number,
  ) => Promise<{ items: SourceChunkRow[]; total: number; nextFrom: number | null }>;
  textReaderRef: React.RefObject<TextChunkReaderHandle | null>;
  onPositionChange: (pos: number, total: number) => void;
  tocOpen: boolean;
  onToggleToc: () => void;
  onMode: (m: 'pdf' | 'text') => void;
  t: Tr;
}) => {
  if (source.status !== 'ready') {
    return (
      <div className="nn-empty-state" style={{ flex: 1 }}>
        <span className="nn-empty-state-icon"><NNIcon name="doc" size={30} color="var(--text-dim)" /></span>
        <p className="nn-empty-state-hint">{t('notebooks.reader.notReady')}</p>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Light text-mode toolbar: TOC + (PDF|Text) for PDF sources. */}
      <div
        className="nn-chrome"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 12px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onToggleToc}
          className={`nn-tb-btn${tocOpen ? ' active' : ''}`}
          title={t('library.reader.toc')}
          aria-label={t('library.reader.toc')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 6h13M8 12h13M8 18h13" />
            <circle cx="3.5" cy="6" r="1" />
            <circle cx="3.5" cy="12" r="1" />
            <circle cx="3.5" cy="18" r="1" />
          </svg>
        </button>
        {source.kind === 'pdf' && (
          <button
            type="button"
            onClick={() => onMode('pdf')}
            style={{
              height: 26,
              padding: '0 10px',
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
        <span style={{ flex: 1 }} />
      </div>
      <TextChunkReader
        ref={textReaderRef}
        sourceId={source.id}
        getSourceChunks={getSourceChunks}
        onPositionChange={onPositionChange}
        t={t}
      />
    </div>
  );
};

// ── TOC panel ─────────────────────────────────────────────────────────────────

const TocPanel = ({
  entries,
  onJump,
  onClose,
  t,
}: {
  entries: TocEntry[] | null;
  onJump: (e: TocEntry) => void;
  onClose: () => void;
  t: Tr;
}) => (
  <div
    className="nn-scroll"
    style={{
      width: 260,
      flexShrink: 0,
      borderRight: '1px solid var(--border)',
      overflowY: 'auto',
      background: 'var(--surface)',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)', flex: 1 }}>
        {t('library.reader.toc')}
      </span>
      <NNBtn variant="ghost" size="sm" icon="x" ariaLabel={t('library.reader.tocClose')} onClick={onClose} />
    </div>
    <div style={{ padding: '6px 6px 16px', display: 'flex', flexDirection: 'column', gap: 1 }}>
      {entries === null ? (
        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <NNSkeleton style={{ height: 22 }} />
          <NNSkeleton style={{ height: 22 }} />
          <NNSkeleton style={{ height: 22 }} />
        </div>
      ) : entries.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 10px', margin: 0 }}>
          {t('library.reader.tocEmpty')}
        </p>
      ) : (
        entries.map((e, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onJump(e)}
            title={e.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 8px',
              paddingLeft: 8 + e.depth * 12,
              background: 'transparent',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
            className="nn-toc-row"
          >
            <span
              style={{
                fontSize: 12.5,
                color: e.depth === 0 ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: e.depth === 0 ? 600 : 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                flex: 1,
              }}
            >
              {e.label}
            </span>
            {e.page != null && (
              <span style={{ fontSize: 10.5, color: 'var(--text-dim)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                {e.page}
              </span>
            )}
          </button>
        ))
      )}
    </div>
  </div>
);

// ── «Спросить» handoff picker (>1 notebook) ───────────────────────────────────

const HandoffPicker = ({
  quote,
  notebooks,
  listNotebooks,
  onPick,
  onClose,
  t,
}: {
  quote: string;
  notebooks: HandoffNotebook[];
  listNotebooks: () => Promise<{ id: string; title: string }[]>;
  onPick: (notebookId: string) => void;
  onClose: () => void;
  t: Tr;
}) => {
  // Prefer the source's own attached notebooks; fall back to ALL notebooks if
  // the detail hadn't loaded (defensive — picker still works).
  const [rows, setRows] = useState<HandoffNotebook[] | null>(notebooks.length > 0 ? notebooks : null);
  useEffect(() => {
    if (rows !== null) return;
    void (async () => {
      try {
        setRows(await listNotebooks());
      } catch {
        setRows([]);
      }
    })();
  }, [rows, listNotebooks]);

  return (
    <>
      <div className="nn-dialog-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 91, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, pointerEvents: 'none' }}>
        <div
          style={{
            width: 380,
            maxWidth: '100%',
            maxHeight: '70vh',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            pointerEvents: 'auto',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            padding: 16,
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, flex: 1, fontFamily: 'var(--font-sans)' }}>
              {t('library.reader.handoffPick')}
            </h3>
            <NNBtn variant="ghost" size="sm" icon="x" ariaLabel={t('library.reader.tocClose')} onClick={onClose} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            «{quote}»
          </p>
          {rows === null ? (
            <NNSkeleton style={{ height: 80 }} />
          ) : rows.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0 }}>{t('library.reader.handoffEmpty')}</p>
          ) : (
            <div className="nn-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto' }}>
              {rows.map((nb) => (
                <button key={nb.id} type="button" onClick={() => onPick(nb.id)} className="nn-lib-nb-link">
                  <NNIcon name="doc" size={13} color="var(--text-muted)" />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{nb.title}</span>
                  <NNIcon name="chevr" size={11} color="var(--text-dim)" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
