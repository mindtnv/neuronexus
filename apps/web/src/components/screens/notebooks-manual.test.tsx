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
const { NotebooksScreen } = await import('./notebooks');
let root: Root, host: HTMLDivElement, originalFetch: typeof fetch;
const router = { bfcacheId: 'test', push() {}, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {}, hmrRefresh() {} };
beforeEach(() => { ensureTestDom(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; originalFetch = globalThis.fetch;
  useNN.setState({ profile: { userId: 'manual-notebook-owner' } as any });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch; useNN.getState().reset(); delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT; });
afterAll(() => { try { GlobalRegistrator.unregister(); } catch {} });
for (const unavailable of [false, true]) test(`notebook browsing and creation remain available when AI is ${unavailable ? 'unreachable' : 'disabled'}`, async () => {
  globalThis.fetch = (async (url: any) => String(url).includes('/ai/status')
    ? Response.json(unavailable ? { error: 'unavailable' } : { notebooksEnabled: false, chatEnabled: false }, { status: unavailable ? 503 : 200 })
    : Response.json({ items: [{ id: '01900000-0000-7000-8000-000000000001', title: 'Manual collection', color: 'lime', icon: 'book', sourceCount: 1, noteCount: 1, cardCount: 0, updatedAt: '2026-09-21T00:00:00Z' }] })) as unknown as typeof fetch;
  await act(async () => root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/notebooks"><SearchParamsContext.Provider value={new URLSearchParams()}><AppNavigationProvider><DialogProvider><NotebooksScreen /></DialogProvider></AppNavigationProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
  expect(host.textContent).toContain('Manual collection');
  expect(host.textContent).not.toContain('notebooks.setup.title');
  const create = host.querySelector<HTMLButtonElement>('button[aria-label="notebooks.list.create"]');
  expect(create).not.toBeNull(); expect(create!.disabled).toBe(false);
  await act(async () => create!.click());
  expect(host.querySelector('input[placeholder="notebooks.list.createPlaceholder"]')).not.toBeNull();
});
