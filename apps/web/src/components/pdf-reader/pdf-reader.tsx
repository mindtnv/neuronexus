'use client';

// M4 — native PDF reader. Renders the ORIGINAL PDF client-side with pdf.js
// (dynamically imported — never SSR'd), continuous vertical pages, Intersection
// Observer virtualization (±2 pages, aspect-ratio placeholders), fit-width
// default scale, toolbar/pinch zoom (0.5–4), a page indicator + jump, reading-
// position persistence, byte-fetch progress + an error state. Each page carries
// a devicePixelRatio ink overlay (InkLayer) persisted per (source,page) via a
// debounced PUT; the under-stroke text is extracted (pdf-ink.ts) from the page's
// lazily-cached text layer and stored as markedText so the AI can read the markup.

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { InkStroke, PageAnnotations } from '@neuronexus/shared';
import { ANNOTATION_MAX_STROKES, MARKED_TEXT_MAX } from '@neuronexus/shared';
import { extractMarkedText, type PdfTextItem } from '@/lib/pdf-ink';
import {
  fetchAnnotations,
  fetchSourceFile,
  saveAnnotation,
} from '@/lib/pdf-annotations';
import { InkLayer } from './ink-layer';
import { ReaderToolbar } from './toolbar';
import {
  DEFAULT_TOOL_SETTINGS,
  loadToolSettings,
  saveToolSettings,
  type SaveState,
  type ToolSettings,
} from './types';

// The lib is dynamically imported (client-only), so we keep its proxies loosely
// typed (`any`) at the boundary — the real pdf.js render() param shape varies by
// version and isn't worth pinning structurally. Only the viewport dims we read
// are named.
interface PdfPageViewport {
  width: number;
  height: number;
}
/* eslint-disable @typescript-eslint/no-explicit-any */
type PdfPage = any;
type PdfDocument = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface PdfReaderHandle {
  scrollToPage: (page: number, flash?: boolean) => void;
}

interface PdfReaderProps {
  sourceId: string;
  /** Initial page to scroll to (1-based) — from a citation / ?page= deep link. */
  initialPage?: number;
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Switch the reader panel back to the text-chunk view. */
  onMode: (m: 'pdf' | 'text') => void;
}

interface PageState {
  strokes: InkStroke[];
  undo: InkStroke[][];
  redo: InkStroke[][];
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const SAVE_DEBOUNCE_MS = 800;
const POS_KEY = (id: string) => `nn:pdf:pos:${id}`;

export const PdfReader = forwardRef<PdfReaderHandle, PdfReaderProps>(
  ({ sourceId, initialPage, t, onMode }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const pageElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
    const pdfjsRef = useRef<any>(null);
    const docRef = useRef<PdfDocument | null>(null);
    const textCacheRef = useRef<Map<number, PdfTextItem[]>>(new Map());
    const renderedRef = useRef<Map<number, { canvas: HTMLCanvasElement; scale: number; task: any }>>(new Map());
    const saveTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

    const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number | null }>({ loaded: 0, total: null });
    const [numPages, setNumPages] = useState(0);
    // Unscaled (scale=1) page dims for aspect-ratio placeholders.
    const [pageDims, setPageDims] = useState<PdfPageViewport[]>([]);
    const [scale, setScale] = useState(1);
    const [fitScale, setFitScale] = useState(1);
    const [visible, setVisible] = useState<Set<number>>(new Set([1]));
    const [currentPage, setCurrentPage] = useState(initialPage ?? 1);
    const [tools, setTools] = useState<ToolSettings>(DEFAULT_TOOL_SETTINGS);
    const [pages, setPages] = useState<Map<number, PageState>>(new Map());
    const [saveState, setSaveState] = useState<SaveState>('idle');

    const pendingInitialPageRef = useRef<number | undefined>(initialPage);

    // ── Tool settings hydrate / persist ──────────────────────────────────────────
    useEffect(() => {
      setTools(loadToolSettings());
    }, []);
    const updateTools = useCallback((patch: Partial<ToolSettings>) => {
      setTools((prev) => {
        const next = { ...prev, ...patch };
        saveToolSettings(next);
        return next;
      });
    }, []);

    // ── Load the document (dynamic pdf.js import, client-only) ────────────────────
    useEffect(() => {
      let cancelled = false;
      const ac = new AbortController();
      setLoadState('loading');
      setLoadProgress({ loaded: 0, total: null });
      textCacheRef.current = new Map();
      renderedRef.current = new Map();
      (async () => {
        try {
          // pdf.js is loaded as NATIVE browser ESM from /public/vendor/pdfjs
          // (copied from node_modules by scripts/copy-pdfjs.mjs on dev/build),
          // deliberately BYPASSING webpack: Next 16's bundled webpack
          // mis-compiles pdfjs-dist's module init ("Object.defineProperty
          // called on non-object" — webpack#20095, fixed only in webpack
          // 5.103, which Next does not ship; pdf.js#20478; reproduced on
          // EVERY pdfjs 5.4.x here). `webpackIgnore` keeps the dynamic import
          // native; same-origin module script + worker satisfy the CSP
          // (`script-src 'self'` / `worker-src 'self'`). Identical in dev+prod.
          const PDFJS_VENDOR_URL = '/vendor/pdfjs/pdf.min.mjs';
          const pdfjs = (await import(
            /* webpackIgnore: true */ PDFJS_VENDOR_URL
          )) as typeof import('pdfjs-dist');
          if (cancelled) return;
          // The worker MUST come from the same vendored copy (version handshake).
          pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
          pdfjsRef.current = pdfjs;

          const data = await fetchSourceFile(sourceId, {
            signal: ac.signal,
            onProgress: (loaded, total) => {
              if (!cancelled) setLoadProgress({ loaded, total });
            },
          });
          if (cancelled) return;

          const doc: PdfDocument = await pdfjs.getDocument({ data }).promise;
          if (cancelled) {
            void doc.destroy();
            return;
          }
          docRef.current = doc;
          setNumPages(doc.numPages);

          // First page sizes the fit-width scale + seeds placeholder dims.
          const first = await doc.getPage(1);
          const vp1 = first.getViewport({ scale: 1 });
          const dims: PdfPageViewport[] = new Array(doc.numPages).fill({ width: vp1.width, height: vp1.height });
          dims[0] = { width: vp1.width, height: vp1.height };
          setPageDims(dims);

          const containerW = containerRef.current?.clientWidth ?? 800;
          const fit = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (containerW - 48) / vp1.width));
          setFitScale(fit);
          setScale(fit);

          // Lazily measure remaining page dims (some PDFs vary) without blocking.
          void (async () => {
            for (let n = 2; n <= doc.numPages; n++) {
              if (cancelled) return;
              try {
                const pg = await doc.getPage(n);
                const vp = pg.getViewport({ scale: 1 });
                setPageDims((prev) => {
                  const next = prev.slice();
                  next[n - 1] = { width: vp.width, height: vp.height };
                  return next;
                });
              } catch {
                /* keep the seeded dims */
              }
            }
          })();

          // Load saved annotations.
          try {
            const rows = await fetchAnnotations(sourceId);
            if (!cancelled) {
              const m = new Map<number, PageState>();
              for (const r of rows) {
                m.set(r.page, { strokes: r.strokes?.strokes ?? [], undo: [], redo: [] });
              }
              setPages(m);
            }
          } catch {
            /* annotations are best-effort; reader still works */
          }

          if (!cancelled) setLoadState('ready');
        } catch (err) {
          if (!cancelled && (err as Error)?.name !== 'AbortError') {
            // The UI error state is deliberately generic — the console carries
            // the real cause (worker setup, fetch status, parse failure).
            console.error('[pdf-reader] load failed', err);
            setLoadState('error');
          }
        }
      })();
      return () => {
        cancelled = true;
        ac.abort();
        for (const timer of saveTimersRef.current.values()) clearTimeout(timer);
        saveTimersRef.current.clear();
        const doc = docRef.current;
        docRef.current = null;
        if (doc) void doc.destroy().catch(() => {});
      };
    }, [sourceId]);

    // ── Persist + restore reading position (page + scale) ─────────────────────────
    const posSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
      if (loadState !== 'ready') return;
      if (posSaveTimer.current) clearTimeout(posSaveTimer.current);
      posSaveTimer.current = setTimeout(() => {
        try {
          localStorage.setItem(POS_KEY(sourceId), JSON.stringify({ page: currentPage, scale }));
        } catch {
          /* best-effort */
        }
      }, 500);
      return () => {
        if (posSaveTimer.current) clearTimeout(posSaveTimer.current);
      };
    }, [currentPage, scale, loadState, sourceId]);

    // Once ready: jump to the deep-link page if any, else the stored position.
    useEffect(() => {
      if (loadState !== 'ready' || numPages === 0) return;
      const wanted = pendingInitialPageRef.current;
      if (wanted && wanted >= 1 && wanted <= numPages) {
        pendingInitialPageRef.current = undefined;
        // Defer to next frame so placeholders are laid out.
        requestAnimationFrame(() => scrollToPage(wanted, true));
        return;
      }
      try {
        const raw = localStorage.getItem(POS_KEY(sourceId));
        if (raw) {
          const { page, scale: storedScale } = JSON.parse(raw) as { page?: number; scale?: number };
          if (typeof storedScale === 'number' && storedScale >= ZOOM_MIN && storedScale <= ZOOM_MAX) {
            setScale(storedScale);
          }
          if (typeof page === 'number' && page > 1 && page <= numPages) {
            requestAnimationFrame(() => scrollToPage(page, false));
          }
        }
      } catch {
        /* ignore */
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadState, numPages, sourceId]);

    // ── Virtualization: observe page wrappers (±2) + track current page ───────────
    useEffect(() => {
      if (loadState !== 'ready' || numPages === 0) return;
      const root = containerRef.current;
      if (!root) return;
      const io = new IntersectionObserver(
        (entries) => {
          setVisible((prev) => {
            const next = new Set(prev);
            let top: { page: number; ratio: number } | null = null;
            for (const e of entries) {
              const n = Number((e.target as HTMLElement).dataset.page);
              if (!n) continue;
              if (e.isIntersecting) {
                next.add(n);
                if (!top || e.intersectionRatio > top.ratio) top = { page: n, ratio: e.intersectionRatio };
              }
            }
            // Inflate by ±2 around any visible page.
            const inflated = new Set<number>();
            for (const p of next) {
              for (let d = -2; d <= 2; d++) {
                const q = p + d;
                if (q >= 1 && q <= numPages) inflated.add(q);
              }
            }
            // Drop pages now far away to free canvases.
            for (const e of entries) {
              const n = Number((e.target as HTMLElement).dataset.page);
              if (!e.isIntersecting && !inflated.has(n)) inflated.delete(n);
            }
            if (top) setCurrentPage(top.page);
            return inflated;
          });
        },
        { root, rootMargin: '600px 0px', threshold: [0, 0.25, 0.5, 1] },
      );
      for (const el of pageElsRef.current.values()) io.observe(el);
      return () => io.disconnect();
    }, [loadState, numPages]);

    // ── Render a page canvas when it becomes visible / scale changes ──────────────
    const renderPage = useCallback(
      async (n: number, host: HTMLDivElement) => {
        const doc = docRef.current;
        if (!doc) return;
        const existing = renderedRef.current.get(n);
        if (existing && existing.scale === scale && existing.canvas.isConnected) return;
        try {
          existing?.task?.cancel?.();
        } catch {
          /* ignore */
        }
        try {
          const page = await doc.getPage(n);
          const vp = page.getViewport({ scale });
          const dpr = Math.min(window.devicePixelRatio || 1, 3);
          const canvas = host.querySelector<HTMLCanvasElement>('canvas[data-pdf-canvas]') ?? document.createElement('canvas');
          canvas.dataset.pdfCanvas = '1';
          canvas.width = Math.floor(vp.width * dpr);
          canvas.height = Math.floor(vp.height * dpr);
          canvas.style.width = `${vp.width}px`;
          canvas.style.height = `${vp.height}px`;
          canvas.style.display = 'block';
          if (!canvas.isConnected) {
            const slot = host.querySelector('[data-canvas-slot]');
            slot?.prepend(canvas);
          }
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const task = page.render({ canvas, canvasContext: ctx, viewport: vp });
          renderedRef.current.set(n, { canvas, scale, task });
          await task.promise;
        } catch (err) {
          if ((err as Error)?.name !== 'RenderingCancelledException') {
            /* leave the placeholder */
          }
        }
      },
      [scale],
    );

    // Trigger renders for visible pages.
    useEffect(() => {
      if (loadState !== 'ready') return;
      for (const n of visible) {
        const host = pageElsRef.current.get(n);
        if (host) void renderPage(n, host);
      }
      // Free canvases for pages no longer in range.
      for (const [n, r] of renderedRef.current) {
        if (!visible.has(n)) {
          try {
            r.task?.cancel?.();
          } catch {
            /* ignore */
          }
          r.canvas.remove();
          renderedRef.current.delete(n);
        }
      }
    }, [visible, scale, loadState, renderPage]);

    // ── scrollToPage (exposed) ────────────────────────────────────────────────────
    const scrollToPage = useCallback((page: number, flash = false) => {
      const el = pageElsRef.current.get(page);
      const root = containerRef.current;
      if (!el || !root) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setCurrentPage(page);
      if (flash) {
        el.classList.add('nn-pdf-page-flash');
        window.setTimeout(() => el.classList.remove('nn-pdf-page-flash'), 1600);
      }
    }, []);

    useImperativeHandle(ref, () => ({ scrollToPage }), [scrollToPage]);

    // ── Zoom ──────────────────────────────────────────────────────────────────────
    const applyZoom = useCallback((delta: number) => {
      setScale((s) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((s + delta) * 100) / 100)));
    }, []);
    const resetZoom = useCallback(() => setScale(fitScale), [fitScale]);

    // ── Two-finger pinch zoom (live CSS transform → commit on settle) ─────────────
    const pinchRef = useRef<{ pointers: Map<number, { x: number; y: number }>; startDist: number; startScale: number } | null>(null);
    const onContainerPointerDown = useCallback((e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const p = pinchRef.current ?? { pointers: new Map(), startDist: 0, startScale: scale };
      p.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (p.pointers.size === 2) {
        const [a, b] = [...p.pointers.values()];
        p.startDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        p.startScale = scale;
      }
      pinchRef.current = p;
    }, [scale]);
    const onContainerPointerMove = useCallback((e: React.PointerEvent) => {
      const p = pinchRef.current;
      if (!p || !p.pointers.has(e.pointerId) || p.pointers.size < 2) return;
      p.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...p.pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (p.startDist > 0) {
        const factor = dist / p.startDist;
        const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, p.startScale * factor));
        const wrap = containerRef.current?.querySelector<HTMLElement>('[data-pages-wrap]');
        if (wrap) {
          wrap.style.transformOrigin = 'top center';
          wrap.style.transform = `scale(${next / scale})`;
        }
      }
    }, [scale]);
    const endPinch = useCallback((e: React.PointerEvent) => {
      const p = pinchRef.current;
      if (!p) return;
      const had2 = p.pointers.size === 2;
      p.pointers.delete(e.pointerId);
      if (had2 && p.pointers.size < 2) {
        const wrap = containerRef.current?.querySelector<HTMLElement>('[data-pages-wrap]');
        const m = wrap?.style.transform.match(/scale\(([\d.]+)\)/);
        if (wrap) wrap.style.transform = '';
        if (m) {
          const f = Number(m[1]);
          if (Number.isFinite(f) && f !== 1) {
            setScale((s) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(s * f * 100) / 100)));
          }
        }
      }
      if (p.pointers.size === 0) pinchRef.current = null;
    }, []);

    // ── Annotation mutation + debounced save ──────────────────────────────────────
    const getPageState = useCallback(
      (n: number): PageState => pages.get(n) ?? { strokes: [], undo: [], redo: [] },
      [pages],
    );

    const scheduleSave = useCallback(
      (n: number, strokes: InkStroke[]) => {
        const timers = saveTimersRef.current;
        const existing = timers.get(n);
        if (existing) clearTimeout(existing);
        setSaveState('saving');
        timers.set(
          n,
          setTimeout(async () => {
            timers.delete(n);
            try {
              let markedText: string | undefined;
              if (strokes.length > 0) {
                const items = await ensureTextContent(n);
                const dims = pageDims[n - 1];
                if (items && dims) {
                  const vp = { w: dims.width, h: dims.height };
                  markedText = extractMarkedText(items, vp.w, vp.h, strokes).slice(0, MARKED_TEXT_MAX);
                }
              }
              const payload: PageAnnotations = { v: 1, strokes };
              await saveAnnotation(sourceId, n, payload, strokes.length ? markedText : undefined);
              setSaveState('saved');
              window.setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1600);
            } catch {
              setSaveState('error');
            }
          }, SAVE_DEBOUNCE_MS),
        );
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [sourceId, pageDims],
    );

    const ensureTextContent = useCallback(async (n: number): Promise<PdfTextItem[] | null> => {
      const cached = textCacheRef.current.get(n);
      if (cached) return cached;
      const doc = docRef.current;
      if (!doc) return null;
      try {
        const page = await doc.getPage(n);
        const tc = await page.getTextContent();
        const items = tc.items.filter((it: any) => typeof it.str === 'string') as PdfTextItem[];
        textCacheRef.current.set(n, items);
        return items;
      } catch {
        return null;
      }
    }, []);

    const commitStrokes = useCallback(
      (n: number, next: InkStroke[]) => {
        if (next.length > ANNOTATION_MAX_STROKES) next = next.slice(0, ANNOTATION_MAX_STROKES);
        setPages((prev) => {
          const cur = prev.get(n) ?? { strokes: [], undo: [], redo: [] };
          const m = new Map(prev);
          m.set(n, { strokes: next, undo: [...cur.undo, cur.strokes], redo: [] });
          return m;
        });
        scheduleSave(n, next);
      },
      [scheduleSave],
    );

    const undoPage = useCallback(
      (n: number) => {
        setPages((prev) => {
          const cur = prev.get(n);
          if (!cur || cur.undo.length === 0) return prev;
          const last = cur.undo[cur.undo.length - 1]!;
          const m = new Map(prev);
          m.set(n, { strokes: last, undo: cur.undo.slice(0, -1), redo: [...cur.redo, cur.strokes] });
          scheduleSave(n, last);
          return m;
        });
      },
      [scheduleSave],
    );

    const redoPage = useCallback(
      (n: number) => {
        setPages((prev) => {
          const cur = prev.get(n);
          if (!cur || cur.redo.length === 0) return prev;
          const next = cur.redo[cur.redo.length - 1]!;
          const m = new Map(prev);
          m.set(n, { strokes: next, undo: [...cur.undo, cur.strokes], redo: cur.redo.slice(0, -1) });
          scheduleSave(n, next);
          return m;
        });
      },
      [scheduleSave],
    );

    const retrySave = useCallback(() => {
      const st = getPageState(currentPage);
      scheduleSave(currentPage, st.strokes);
    }, [getPageState, currentPage, scheduleSave]);

    // ── ⌘Z / ⌘⇧Z when the reader is focused ──────────────────────────────────────
    const focusRef = useRef(false);
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (!focusRef.current) return;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) redoPage(currentPage);
          else undoPage(currentPage);
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [currentPage, undoPage, redoPage]);

    const curState = getPageState(currentPage);

    // ── Render ─────────────────────────────────────────────────────────────────────
    if (loadState === 'error') {
      return (
        <div style={errorBoxStyle}>
          <p style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 12 }}>
            {t('notebooks.reader.loadError')}
          </p>
          <button type="button" onClick={() => onMode('text')} style={modeFallbackBtn}>
            {t('notebooks.reader.openText')}
          </button>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ padding: '8px 10px', flexShrink: 0 }}>
          <ReaderToolbar
            tool={tools.tool}
            color={tools.color}
            widthIdx={tools.widthIdx}
            fingerDraw={tools.fingerDraw}
            scale={scale}
            page={currentPage}
            total={numPages}
            saveState={saveState}
            canUndo={curState.undo.length > 0}
            canRedo={curState.redo.length > 0}
            mode="pdf"
            onTool={(tool) => updateTools({ tool })}
            onColor={(color) => updateTools({ color })}
            onWidth={(widthIdx) => updateTools({ widthIdx })}
            onFingerDraw={(fingerDraw) => updateTools({ fingerDraw })}
            onZoom={applyZoom}
            onZoomReset={resetZoom}
            onUndo={() => undoPage(currentPage)}
            onRedo={() => redoPage(currentPage)}
            onJumpPage={(p) => scrollToPage(Math.max(1, Math.min(numPages, p)), true)}
            onMode={onMode}
            onRetrySave={retrySave}
            t={t}
          />
        </div>

        {loadState === 'loading' ? (
          <div style={errorBoxStyle}>
            <div style={{ width: 200, height: 6, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  background: 'var(--lime-500)',
                  width:
                    loadProgress.total && loadProgress.total > 0
                      ? `${Math.min(100, Math.round((loadProgress.loaded / loadProgress.total) * 100))}%`
                      : '40%',
                  transition: 'width 120ms linear',
                }}
              />
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 10 }}>
              {loadProgress.total
                ? t('notebooks.reader.loadingBytes', {
                    loaded: Math.round(loadProgress.loaded / 1024),
                    total: Math.round(loadProgress.total / 1024),
                  })
                : t('notebooks.reader.loading')}
            </p>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="nn-scroll"
            tabIndex={0}
            onFocus={() => (focusRef.current = true)}
            onBlur={() => (focusRef.current = false)}
            onPointerDownCapture={onContainerPointerDown}
            onPointerMoveCapture={onContainerPointerMove}
            onPointerUp={endPinch}
            onPointerCancel={endPinch}
            style={{ flex: 1, overflow: 'auto', padding: '16px 0', outline: 'none', touchAction: 'pan-x pan-y pinch-zoom' }}
          >
            <div data-pages-wrap style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => {
                const dims = pageDims[n - 1] ?? { width: 612, height: 792 };
                const w = dims.width * scale;
                const h = dims.height * scale;
                const isVisible = visible.has(n);
                const pst = pages.get(n);
                return (
                  <div
                    key={n}
                    data-page={n}
                    ref={(el) => {
                      if (el) pageElsRef.current.set(n, el);
                      else pageElsRef.current.delete(n);
                    }}
                    style={{
                      position: 'relative',
                      width: w,
                      height: h,
                      background: 'var(--surface)',
                      boxShadow: 'var(--shadow-md)',
                      borderRadius: 2,
                    }}
                  >
                    <div data-canvas-slot style={{ position: 'absolute', inset: 0 }} />
                    {isVisible && (
                      <InkLayer
                        strokes={pst?.strokes ?? []}
                        cssW={w}
                        cssH={h}
                        tool={tools.tool}
                        color={tools.color}
                        widthIdx={tools.widthIdx}
                        fingerDraw={tools.fingerDraw}
                        onChange={(next) => commitStrokes(n, next)}
                      />
                    )}
                    {!isVisible && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 8,
                          left: 10,
                          fontSize: 11,
                          color: 'var(--text-dim)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {n}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  },
);
PdfReader.displayName = 'PdfReader';

const errorBoxStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  textAlign: 'center',
};

const modeFallbackBtn: React.CSSProperties = {
  height: 36,
  padding: '0 14px',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--border)',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  cursor: 'pointer',
  fontSize: 13,
};
