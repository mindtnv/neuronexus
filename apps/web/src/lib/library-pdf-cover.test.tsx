import { ensureTestDom, GlobalRegistrator } from './test-dom-setup';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act, useState } from 'react';
import type { Root } from 'react-dom/client';
import type { LibraryItem } from './types';
import { useNN } from './store';
import { useLibraryPdfCovers } from './library-pdf-cover';
import { LibraryIngestIndicator } from '../components/library-ingest-indicator';
ensureTestDom();
const { createRoot } = await import('react-dom/client');
let host: HTMLDivElement, root: Root;
const initial = useNN.getState();
const item = (id: string) => ({ id, kind: 'pdf', status: 'parsing', coverMediaId: null, pageCount: null, author: null } as LibraryItem);
const rendered = { blob: new Blob(['cover'], { type: 'image/webp' }), pageCount: 3, author: 'Author' };
beforeEach(() => { ensureTestDom(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.append(host); root = createRoot(host); useNN.setState({ profile: { userId: 'alice' } as any }); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); useNN.setState(initial); delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT; });
afterAll(() => { try { GlobalRegistrator.unregister(); } catch {} });
function Harness({ render }: { render: typeof useLibraryPdfCovers extends (...args: infer A) => any ? NonNullable<A[2]> : never }) {
  const [items, setItems] = useState([item('one'), item('two')]);
  useLibraryPdfCovers(items, updated => setItems(rows => rows.map(row => row.id === updated.id ? updated : row)), render);
  return <div>{items.map(row => <span key={row.id}>{row.coverMediaId ?? 'placeholder'}</span>)}</div>;
}
test('library creates covers serially before opening a reader, without replacing existing metadata', async () => {
  const order: string[] = [];
  useNN.setState({
    getLibraryItem: async id => ({ ...item(id), author: 'Edited author', pageCount: 10 } as any),
    uploadMedia: async () => ({ mediaId: 'cover', url: '/m/cover' } as any),
    patchLibraryItem: async (id, patch) => { order.push('patch:' + id); expect(patch).toEqual({ coverMediaId: 'cover' }); return { ...item(id), ...patch } as any; },
  });
  await act(async () => { root.render(<Harness render={async id => { order.push('render:' + id); return rendered; }} />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(order).toEqual(['render:one', 'patch:one', 'render:two', 'patch:two']);
  expect(host.textContent).toBe('covercover');
});
test('an account switch aborts a pending cover before upload or metadata writes', async () => {
  let release!: (value: typeof rendered) => void, signal: AbortSignal | undefined;
  let uploads = 0;
  useNN.setState({ getLibraryItem: async id => item(id) as any, uploadMedia: async () => { uploads++; return { mediaId: 'cover' } as any; } });
  await act(async () => root.render(<Harness render={async (_id, currentSignal) => { signal = currentSignal; return new Promise(resolve => { release = resolve; }); }} />));
  const oldSignal = signal!;
  await act(async () => useNN.setState({ profile: undefined as any }));
  expect(oldSignal.aborted).toBe(true);
  await act(async () => release(rendered));
  expect(uploads).toBe(0);
});
test('ingest animation exposes only real indexing progress and disappears when ready', async () => {
  await act(async () => root.render(<LibraryIngestIndicator item={{ status: 'parsing', indexed: 0, total: 0 }} t={key => key} />));
  expect(host.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('library.status.parsing');
  expect(host.querySelector('[role="progressbar"]')).toBeNull();
  await act(async () => root.render(<LibraryIngestIndicator item={{ status: 'indexing', indexed: 4, total: 10 }} t={key => key} />));
  expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('4');
  expect(host.textContent).toContain('4 / 10');
  await act(async () => root.render(<LibraryIngestIndicator item={{ status: 'ready', indexed: 10, total: 10 }} t={key => key} />));
  expect(host.querySelector('[role="status"]')).toBeNull();
});

test('library metadata PATCH refreshes derived cover URL instead of treating a source row as a library item', async () => {
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET'; calls.push(method);
    return Response.json(method === 'PATCH' ? { ...item('one'), coverMediaId: 'cover' } : { ...item('one'), coverMediaId: 'cover', coverUrl: '/m/cover', indexed: 4, total: 10 });
  }) as typeof fetch;
  try {
    const result = await initial.patchLibraryItem('one', { coverMediaId: 'cover' });
    expect(calls).toEqual(['PATCH', 'GET']);
    expect(result.coverUrl).toBe('/m/cover');
    expect(result.total).toBe(10);
  } finally { globalThis.fetch = previousFetch; }
});
