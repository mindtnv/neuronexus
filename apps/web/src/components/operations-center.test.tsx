import { ensureTestDom, GlobalRegistrator } from '../lib/test-dom-setup';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import { PathnameContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { AppNavigationProvider } from './navigation';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { Root } from 'react-dom/client';
import type { OperationsFeed } from '@neuronexus/shared';
ensureTestDom();
const { createRoot } = await import('react-dom/client');
const { OperationsProvider } = await import('./operations-provider');
const { OperationsButton, OperationsHost } = await import('./operations-center');
const { useNN } = await import('../lib/store');
let root: Root, host: HTMLDivElement, oldFetch: typeof fetch;
const initial = useNN.getState();
function Navigation({ children, push = () => {} }: { children: React.ReactNode; push?: (path: string) => void }) {
  return <AppRouterContext.Provider value={{ push, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {} } as any}>
    <PathnameContext.Provider value="/cards"><SearchParamsContext.Provider value={new URLSearchParams()}>
      <AppNavigationProvider>{children}</AppNavigationProvider>
    </SearchParamsContext.Provider></PathnameContext.Provider>
  </AppRouterContext.Provider>;
}
beforeEach(() => {
  ensureTestDom(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  oldFetch = globalThis.fetch; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  useNN.setState({ profile: { userId: 'owner' } as any });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); globalThis.fetch = oldFetch; useNN.setState(initial); delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT; });
afterAll(() => { try { GlobalRegistrator.unregister(); } catch {} });
const feed: OperationsFeed = { serverTime: new Date().toISOString(), active: { items: [], total: 0, nextCursor: null }, attention: { items: [], total: 0, nextCursor: null },
  recent: { total: 1, nextCursor: null, items: [{ kind: 'artifact', id: 'quiz', runId: 'run', title: 'Ready quiz', artifactType: 'quiz', phase: 'ready',
    startedAt: null, finishedAt: new Date().toISOString(), canRead: false, canSearch: false, progress: null,
    retry: { allowed: false, reason: 'not_failed', needsDefaults: false }, destination: { kind: 'source-artifact', id: 'quiz', sourceId: null } }] } };

test('the shell list survives route content changes and opens an exact retained quiz without a write', async () => {
  const paths: string[] = [], methods: string[] = [];
  globalThis.fetch = (async (_url: any, init: any) => { methods.push(init?.method ?? 'GET'); return Response.json(feed); }) as unknown as typeof fetch;
  const render = (page: string) => <Navigation push={path => paths.push(path)}>
    <OperationsProvider><p>{page}</p><OperationsButton /><OperationsHost /></OperationsProvider>
  </Navigation>;
  await act(async () => root.render(render('Library')));
  await act(async () => root.render(render('Cards')));
  await act(async () => host.querySelector<HTMLButtonElement>('.nn-operations-button')!.click());
  expect(host.querySelector('dialog')?.open).toBe(true);
  expect(host.textContent).toContain('Ready quiz');
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'operations.open')!.click());
  expect(paths).toEqual(['/library/study?artifact=quiz']);
  expect(methods.every(method => method === 'GET')).toBe(true);
});

test('account change removes outgoing titles before a delayed replacement feed arrives', async () => {
  let resolve!: (response: Response) => void;
  let current = true;
  globalThis.fetch = (async () => current ? Response.json(feed) : new Promise<Response>(r => { resolve = r; })) as unknown as typeof fetch;
  await act(async () => root.render(<Navigation><OperationsProvider><OperationsHost /></OperationsProvider></Navigation>));
  expect(host.textContent).toContain('Ready quiz');
  current = false;
  await act(async () => useNN.setState({ profile: { userId: 'next-owner' } as any }));
  expect(host.textContent).not.toContain('Ready quiz');
  await act(async () => resolve(Response.json({ ...feed, recent: { items: [], total: 0, nextCursor: null } })));
});
