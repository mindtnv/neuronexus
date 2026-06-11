// M4 — client API surface for the PDF reader: the binary file fetch (with byte
// progress) + the per-page ink annotation GET/PUT. The file route returns raw
// bytes (not JSON), so Eden can't carry it — we hand-fetch `NEXT_PUBLIC_API_URL`
// with `credentials:'include'` exactly like chat-stream.ts. The annotation
// JSON routes go through Eden via the loose `(api as any)` path (the store's
// established escape hatch for endpoints Eden's path inference chokes on).

import type { PageAnnotations } from '@neuronexus/shared';
import { api, ok } from '@/lib/api';

// Same origin resolution as lib/api.ts / chat-stream.ts.
const baseURL =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : 'http://localhost:3000';

export interface PageAnnotationRow {
  page: number;
  strokes: PageAnnotations;
  markedText: string | null;
  updatedAt: string;
}

/**
 * Fetch the original source bytes (`GET /sources/:id/file`) into an ArrayBuffer,
 * reporting download progress when the server sends content-length. Throws on a
 * non-2xx response (caller renders the reader error state).
 */
export async function fetchSourceFile(
  sourceId: string,
  opts?: { signal?: AbortSignal; onProgress?: (loaded: number, total: number | null) => void },
): Promise<ArrayBuffer> {
  const res = await fetch(`${baseURL}/sources/${sourceId}/file`, {
    credentials: 'include',
    signal: opts?.signal,
  });
  if (!res.ok) throw new Error(`file ${res.status}`);

  const lenHeader = res.headers.get('content-length');
  const total = lenHeader ? Number(lenHeader) : null;

  // Stream with progress when a body reader is available; otherwise fall back to
  // arrayBuffer() (still correct, just no granular progress).
  if (!res.body || typeof res.body.getReader !== 'function') {
    const buf = await res.arrayBuffer();
    opts?.onProgress?.(buf.byteLength, total);
    return buf;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      opts?.onProgress?.(loaded, total && total >= loaded ? total : null);
    }
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

/** GET /sources/:id/annotations → all page rows (ordered by page). */
export async function fetchAnnotations(sourceId: string): Promise<PageAnnotationRow[]> {
  const body = (await ok(
    await (api as any).sources({ id: sourceId }).annotations.get(),
  )) as { items: PageAnnotationRow[] };
  return body.items ?? [];
}

/**
 * PUT /sources/:id/annotations/:page. Empty `strokes.strokes` ⇒ the server
 * DELETEs the row (clear). `markedText` is the geometric extraction; omit it
 * when clearing.
 */
export async function saveAnnotation(
  sourceId: string,
  page: number,
  strokes: PageAnnotations,
  markedText?: string,
): Promise<void> {
  await ok(
    await (api as any)
      .sources({ id: sourceId })
      .annotations({ page })
      .put({ strokes, markedText }),
  );
}
