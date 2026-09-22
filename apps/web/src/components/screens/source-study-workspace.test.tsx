import { ensureTestDom, GlobalRegistrator } from '../../lib/test-dom-setup';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { AppNavigationProvider } from '../navigation';
import { DialogProvider } from '../dialog';
import { useNN } from '../../lib/store';
ensureTestDom();
const { createRoot } = await import('react-dom/client');
const { SourceStudyWorkspace } = await import('./library-reader');
let root: Root, host: HTMLDivElement, oldFetch: typeof fetch;
const originals = { getSource: useNN.getState().getSource, getLibraryItem: useNN.getState().getLibraryItem, getSourceChunks: useNN.getState().getSourceChunks };
beforeEach(() => { ensureTestDom(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ chatEnabled: false })) as unknown as typeof fetch;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); globalThis.fetch = oldFetch; useNN.setState(originals); delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT; });
afterAll(() => { try { GlobalRegistrator.unregister(); } catch {} });
test('the shared reader opens inside a notebook without replacing its route and returns to its owner', async () => {
  const source = { id: 'book', title: 'Kubernetes book', kind: 'text', status: 'ready', chunkCount: 1, charCount: 30 };
  useNN.setState({ getSource: async () => source as any, getLibraryItem: async () => ({ ...source, readingState: null }) as any,
    getSourceChunks: async () => ({ items: [{ id: 'chunk', sourceId: 'book', position: 0, text: 'A Pod groups containers.' }], nextFrom: null }) as any });
  let returned = 0; const replacements: string[] = [];
  const router = { push() {}, replace(path: string) { replacements.push(path); }, back() {}, forward() {}, refresh() {}, prefetch() {}, hmrRefresh() {}, bfcacheId: 'test' };
  await act(async () => root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/notebooks/notebook"><SearchParamsContext.Provider value={new URLSearchParams('source=book')}><AppNavigationProvider><DialogProvider>
    <SourceStudyWorkspace sourceId="book" initialLocation={{ pos: 0 }} origin={{ title: 'My notebook', onReturn: () => { returned++; } }} />
  </DialogProvider></AppNavigationProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
  expect(host.textContent).toContain('Kubernetes book'); expect(host.textContent).toContain('A Pod groups containers.');
  expect(replacements).toEqual([]);
  const back = host.querySelector('button[aria-label="My notebook"]') as HTMLButtonElement;
  await act(async () => back.click()); expect(returned).toBe(1);
  const notes = host.querySelector('button[aria-label="notebooks.notes.heading"]') as HTMLButtonElement;
  await act(async () => notes.click());
  expect(host.querySelector('dialog')!.open).toBe(true);
  await act(async () => window.dispatchEvent(new CustomEvent('nn:assistant:ask', { detail: { ref: { kind: 'source', id: 'book' } } })));
  expect(host.querySelector('dialog')!.open).toBe(false);
});
