'use client';

// TextChunkReader (L2) — the text-mode chunk reader, extracted from the M2
// notebook workspace so it can be reused in BOTH the full-screen library reader
// (`/library/[id]`) and the notebook citation-viewer drawer. It owns its own
// chunk pagination (GET /sources/:id/chunks), an IntersectionObserver "load more"
// sentinel, scroll-to-chunk (by chunkId or position) with the lime nn-chunk-flash
// fade, and a tombstone state when the source was deleted (chunks → 404/empty).
//
// Each chunk renders through the SAME markdown pipeline chat answers use
// (renderCardHtml → SafeHtml — the sanitizer is the single security boundary,
// never edited here). Pure presentation + a thin store pass-through; no PDF, no
// ink, no marks (those live only in the library reader's PDF mode).

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { NNBtn, NNIcon, NNSkeleton } from '@/components/ui';
import { renderCardHtml, SafeHtml } from '@/lib/render-card';
import type { SourceChunkRow } from '@/lib/types';

type Tr = (key: string, params?: Record<string, string | number>) => string;

const READER_PAGE = 50;

// One synthetic single-field "basic" note-type feeds chunk text through the same
// Markdown render pipeline chat answers use.
const CHUNK_MD_NOTE_TYPE = {
  kind: 'basic' as const,
  templates: [{ name: 'chunk', ord: 0, frontTemplate: '{{Body}}', backTemplate: '{{Body}}' }],
};

export interface TextChunkReaderHandle {
  /** Scroll to a chunk (by id preferred, else position) and flash it. Pages
   *  forward as needed until the target is loaded. */
  scrollToChunk: (chunkId?: string, pos?: number) => void;
}

interface TextChunkReaderProps {
  sourceId: string;
  /** Loads a page of chunks (store.getSourceChunks). */
  getSourceChunks: (
    id: string,
    from?: number,
    limit?: number,
  ) => Promise<{ items: SourceChunkRow[]; total: number; nextFrom: number | null }>;
  /** L2 — fires when the topmost visible chunk position changes (server progress). */
  onPositionChange?: (pos: number, total: number) => void;
  t: Tr;
}

const ReaderChunk = ({ chunk, t }: { chunk: SourceChunkRow; t: Tr }) => {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, fontFamily: 'var(--font-sans)' }}>
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

export const TextChunkReader = forwardRef<TextChunkReaderHandle, TextChunkReaderProps>(
  ({ sourceId, getSourceChunks, onPositionChange, t }, ref) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);

    const [chunks, setChunks] = useState<SourceChunkRow[]>([]);
    const [total, setTotal] = useState(0);
    const [nextFrom, setNextFrom] = useState<number | null>(0);
    const [loading, setLoading] = useState(false);
    const [tombstone, setTombstone] = useState(false);
    const pendingScrollRef = useRef<{ chunkId?: string; pos?: number } | null>(null);

    const loadChunks = useCallback(
      async (from: number, append: boolean) => {
        setLoading(true);
        try {
          const page = await getSourceChunks(sourceId, from, READER_PAGE);
          setTotal(page.total);
          setNextFrom(page.nextFrom);
          setChunks((prev) => (append ? [...prev, ...page.items] : page.items));
          if (!append && from === 0 && page.total === 0 && page.items.length === 0) {
            // Empty source — not a tombstone (a parsed-but-empty source is valid);
            // the empty UI handles it.
          }
        } catch {
          if (!append) {
            // A 404 (source deleted) → tombstone.
            setTombstone(true);
            setChunks([]);
            setTotal(0);
            setNextFrom(null);
          }
        } finally {
          setLoading(false);
        }
      },
      [getSourceChunks, sourceId],
    );

    // Reset + load when the source changes.
    useEffect(() => {
      setChunks([]);
      setTotal(0);
      setNextFrom(0);
      setTombstone(false);
      void loadChunks(0, false);
    }, [sourceId, loadChunks]);

    // Auto-load next page when the sentinel scrolls into view.
    useEffect(() => {
      const el = sentinelRef.current;
      if (!el || nextFrom == null || loading) return;
      const io = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) void loadChunks(nextFrom, true);
        },
        { rootMargin: '300px' },
      );
      io.observe(el);
      return () => io.disconnect();
    }, [nextFrom, loading, loadChunks]);

    const scrollToChunk = useCallback((chunkId?: string, pos?: number) => {
      pendingScrollRef.current = { chunkId, pos };
    }, []);

    useImperativeHandle(ref, () => ({ scrollToChunk }), [scrollToChunk]);

    // After chunks load, fulfil a pending scroll-to-chunk (page forward until in
    // range), then scrollIntoView + lime highlight fade.
    useEffect(() => {
      const target = pendingScrollRef.current;
      if (!target) return;
      if (
        target.pos != null &&
        nextFrom != null &&
        !loading &&
        !chunks.some((c) => c.position === target.pos)
      ) {
        void loadChunks(nextFrom, true);
        return;
      }
      const host = hostRef.current;
      if (!host) return;
      let node: HTMLElement | null = null;
      if (target.chunkId) node = host.querySelector(`[data-chunk-id="${CSS.escape(target.chunkId)}"]`);
      if (!node && target.pos != null) node = host.querySelector(`[data-chunk-pos="${target.pos}"]`);
      if (!node) {
        if (nextFrom != null && !loading) void loadChunks(nextFrom, true);
        else pendingScrollRef.current = null;
        return;
      }
      pendingScrollRef.current = null;
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node.classList.add('nn-chunk-flash');
      window.setTimeout(() => node?.classList.remove('nn-chunk-flash'), 2200);
    }, [chunks, loading, nextFrom, loadChunks]);

    // L2 — report the topmost visible chunk position for server progress.
    useEffect(() => {
      if (!onPositionChange || total === 0) return;
      const host = hostRef.current;
      if (!host) return;
      const io = new IntersectionObserver(
        (entries) => {
          let top: { pos: number; ratio: number } | null = null;
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const pos = Number((e.target as HTMLElement).dataset.chunkPos);
            if (!Number.isFinite(pos)) continue;
            if (!top || e.intersectionRatio > top.ratio) top = { pos, ratio: e.intersectionRatio };
          }
          if (top) onPositionChange(top.pos, total);
        },
        { root: host, threshold: [0, 0.5, 1] },
      );
      for (const el of host.querySelectorAll<HTMLElement>('[data-chunk-pos]')) io.observe(el);
      return () => io.disconnect();
    }, [chunks, total, onPositionChange]);

    if (tombstone) {
      return (
        <div className="nn-empty-state" style={{ flex: 1 }}>
          <span className="nn-empty-state-icon"><NNIcon name="doc" size={30} color="var(--text-dim)" /></span>
          <p className="nn-empty-state-hint">{t('notebooks.backlinks.tombstone')}</p>
        </div>
      );
    }

    return (
      <div
        ref={hostRef}
        className="nn-scroll"
        style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 40px' }}
      >
        <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {chunks.length === 0 && loading ? (
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
              {nextFrom != null && (
                <>
                  <div ref={sentinelRef} style={{ height: 1 }} />
                  <NNBtn
                    variant="ghost"
                    size="sm"
                    onClick={() => nextFrom != null && void loadChunks(nextFrom, true)}
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
TextChunkReader.displayName = 'TextChunkReader';
