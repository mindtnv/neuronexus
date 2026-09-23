import { ensureTestDom, GlobalRegistrator } from '../lib/test-dom-setup';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { AppNavigationProvider, useAppNavigation, useNavigationGuard } from './navigation';
import { useNN } from '../lib/store';
ensureTestDom(); const { createRoot } = await import('react-dom/client');
let root: Root, host: HTMLDivElement;
beforeEach(() => { ensureTestDom(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; useNN.setState({ profile: { userId: 'guard-owner' } as any });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); useNN.getState().reset(); delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT; });
afterAll(() => { try { GlobalRegistrator.unregister(); } catch {} });
test('a temporary form cannot replace or remove the underlying editor guard', async () => {
  const calls: string[] = []; let navigation!: ReturnType<typeof useAppNavigation>;
  function Base() { navigation = useAppNavigation(); useNavigationGuard(async () => { calls.push('base'); return false; }); return null; }
  function Dialog() { useNavigationGuard(async () => { calls.push('dialog'); return true; }); return null; }
  const render = (dialog: boolean) => <AppRouterContext.Provider value={{ push() {}, replace() {}, back() {} } as any}>
    <PathnameContext.Provider value="/cards"><AppNavigationProvider><Base />{dialog && <Dialog />}</AppNavigationProvider></PathnameContext.Provider>
  </AppRouterContext.Provider>;
  await act(async () => root.render(render(false)));
  await act(async () => root.render(render(true)));
  expect(await navigation.confirmLeave('/library')).toBe(false); expect(calls).toEqual(['dialog', 'base']);
  calls.length = 0;
  await act(async () => root.render(render(false)));
  expect(await navigation.confirmLeave('/library')).toBe(false); expect(calls).toEqual(['base']);
});
