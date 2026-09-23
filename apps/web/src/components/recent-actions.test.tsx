import { ensureTestDom, GlobalRegistrator } from '../lib/test-dom-setup';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { newUuidV7, type UiActionReceipt } from '@neuronexus/shared';
import { useNN } from '../lib/store';
ensureTestDom();
const { createRoot } = await import('react-dom/client');
const { RecentActionsProvider, RecentActions } = await import('./recent-actions');
let root: Root, host: HTMLDivElement, oldFetch: typeof fetch;
beforeEach(() => {
  ensureTestDom(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; oldFetch = globalThis.fetch;
  useNN.setState({ profile: { userId: newUuidV7() } as any });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); globalThis.fetch = oldFetch; useNN.getState().reset(); sessionStorage.clear(); delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT; });
afterAll(() => { try { GlobalRegistrator.unregister(); } catch {} });
const receipt = (n: number): UiActionReceipt => ({ id: `receipt-${n}`, requestId: `request-${n}`, kind: 'source-metadata',
  target: { kind: 'source', id: `book-${n}`, revision: '1' }, label: `Book ${n}`, createdAt: new Date().toISOString(),
  undoUntil: new Date(Date.now() + 600_000).toISOString(), consumedAt: null });

test('more than four unexpired actions remain reachable after toast lifetime and owner change clears them', async () => {
  let accountChanged = false;
  globalThis.fetch = (async (url: unknown) => Response.json(String(url).endsWith('/session') ? { sessionId: newUuidV7() }
    : { items: accountChanged ? [] : Array.from({ length: 6 }, (_, i) => receipt(i)), nextCursor: null, serverTime: new Date().toISOString() })) as unknown as typeof fetch;
  await act(async () => root.render(<RecentActionsProvider><RecentActions /></RecentActionsProvider>));
  expect(host.querySelectorAll('li')).toHaveLength(6);
  expect([...host.querySelectorAll('button')].filter(button => button.textContent === 'actionsRecovery.undo')).toHaveLength(6);
  accountChanged = true;
  await act(async () => useNN.setState({ profile: { userId: newUuidV7() } as any }));
  expect(host.textContent).not.toContain('Book 0');
});

test('lost undo response stays visible and focus reconciliation reads its receipt without replaying', async () => {
  const initial = receipt(0);
  let committed = false, writes = 0;
  globalThis.fetch = (async (url: unknown) => {
    const path = String(url);
    if (path.endsWith('/session')) return Response.json({ sessionId: newUuidV7() });
    if (path.endsWith('/undo')) { committed = true; writes++; throw new Error('lost response'); }
    if (path.includes('/receipts/')) return Response.json({ receipt: { ...initial, consumedAt: new Date().toISOString() }, result: {}, outcome: 'undone', replayed: true, serverTime: new Date().toISOString() });
    return Response.json({ items: committed ? [] : [initial], nextCursor: null, serverTime: new Date().toISOString() });
  }) as unknown as typeof fetch;
  await act(async () => root.render(<RecentActionsProvider><RecentActions /></RecentActionsProvider>));
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'actionsRecovery.undo')!.click());
  expect(host.textContent).toContain('actionsRecovery.uncertain');
  expect(host.textContent).toContain('Book 0');
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(writes).toBe(1);
  expect(host.textContent).not.toContain('Book 0');
});
