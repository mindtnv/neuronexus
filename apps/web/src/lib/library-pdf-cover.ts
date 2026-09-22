'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchSourceFile } from './pdf-annotations';
import { useNN } from './store';
import type { LibraryItem } from './types';

export async function renderLibraryPdfCover(sourceId: string, signal: AbortSignal) {
  const vendor = '/vendor/pdfjs/pdf.min.mjs';
  const pdfjs = await import(/* webpackIgnore: true */ vendor) as typeof import('pdfjs-dist');
  signal.throwIfAborted();
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  const data = await fetchSourceFile(sourceId, { signal });
  signal.throwIfAborted();
  const task = pdfjs.getDocument({ data });
  const abort = () => { void task.destroy().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const natural = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(480 / natural.width, 720 / natural.height) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) throw new Error('cover_canvas_unavailable');
    await page.render({ canvas, canvasContext, viewport }).promise;
    signal.throwIfAborted();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.8));
    if (!blob) throw new Error('cover_render_failed');
    let author: string | undefined;
    try { const metadata = await doc.getMetadata(); const value = (metadata.info as { Author?: unknown })?.Author; if (typeof value === 'string' && value.trim()) author = value.trim().slice(0, 500); } catch {}
    return { blob, pageCount: doc.numPages, author };
  } finally {
    signal.removeEventListener('abort', abort);
    await task.destroy().catch(() => {});
  }
}

/** One PDF at a time; source/account changes cancel work before any further writes. */
export function useLibraryPdfCovers(items: LibraryItem[], onUpdated: (item: LibraryItem) => void,
  render = renderLibraryPdfCover) {
  const ownerId = useNN(state => state.profile?.userId);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const update = useRef(onUpdated); update.current = onUpdated;
  const candidate = items.find(item => item.kind === 'pdf' && !item.coverMediaId && item.status !== 'deleting' && !failed.has(`${ownerId}:${item.id}`));
  const id = candidate?.id;
  useEffect(() => {
    if (!ownerId || !id) return;
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && useNN.getState().profile?.userId === ownerId;
    void (async () => {
      try {
        const existing = await useNN.getState().getLibraryItem(id);
        if (!current()) return;
        if (existing.coverMediaId) { update.current(existing); return; }
        const cover = await render(id, controller.signal);
        if (!current()) return;
        const { mediaId } = await useNN.getState().uploadMedia(new File([cover.blob], 'cover.webp', { type: 'image/webp' }));
        if (!current()) return;
        // Re-read after rendering/upload so reader-generated or manually selected covers win.
        const latest = await useNN.getState().getLibraryItem(id);
        if (!current()) return;
        if (latest.coverMediaId) { update.current(latest); return; }
        const patched = await useNN.getState().patchLibraryItem(id, {
          coverMediaId: mediaId,
          ...(latest.pageCount == null ? { pageCount: cover.pageCount } : {}),
          ...(latest.author == null && cover.author ? { author: cover.author } : {}),
        });
        if (current()) update.current(patched);
      } catch {
        if (current()) setFailed(previous => new Set([...previous, `${ownerId}:${id}`]));
      }
    })();
    return () => controller.abort();
  }, [ownerId, id, render]);
}
