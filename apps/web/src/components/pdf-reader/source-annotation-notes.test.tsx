import { ensureTestDom, GlobalRegistrator } from '../../lib/test-dom-setup';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act, useRef } from 'react';
import type { Root } from 'react-dom/client';
import { DialogProvider } from '../dialog';
import { SourceAnnotationNotes } from './source-annotation-notes';
import { LayerParent, useTransientLayer } from '../../lib/use-transient-layer';
import { transientLayers } from '../../lib/layer-stack';
ensureTestDom(); const { createRoot } = await import('react-dom/client');
let root: Root, host: HTMLDivElement, oldFetch: typeof fetch, closed: number;
const rows = [{ id: 'mark-a', page: 1, kind: 'note', quote: 'Original passage A', note: 'Original A' }, { id: 'mark-b', page: 2, kind: 'note', quote: 'Original passage B', note: 'Original B' }];
beforeEach(() => { ensureTestDom(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  oldFetch = globalThis.fetch; closed = 0; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => init?.method === 'PATCH' ? Response.json({ error: 'offline' }, { status: 503 }) : Response.json({ items: rows })) as typeof fetch;
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); globalThis.fetch = oldFetch; delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT; });
afterAll(() => { try { GlobalRegistrator.unregister(); } catch {} });
function Panel() { const ref = useRef<HTMLDivElement>(null), layer = useTransientLayer({ root: ref, onClose: () => closed++, modal: true });
  return <div ref={ref}><LayerParent.Provider value={layer.id}><SourceAnnotationNotes sourceId="source-a" onOpen={() => {}} /></LayerParent.Provider></div>; }
const button = (text: string) => [...document.querySelectorAll('button')].find(button => button.textContent === text)!;
async function open() { await act(async () => root.render(<DialogProvider><Panel /></DialogProvider>)); await act(async () => button('actions.edit').click());
  await act(async () => { const input = host.querySelector('textarea')!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'Unsent comment'); input.dispatchEvent(new Event('input', { bubbles: true })); }); }
test('failed PDF comment save retains its text and Escape can stay in the same annotation', async () => {
  await open(); await act(async () => button('notebooks.marks.noteSave').click());
  expect(host.querySelector('textarea')!.value).toBe('Unsent comment'); expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => { void transientLayers.dismissTop('escape'); });
  expect(host.textContent).toContain('editor.draft.leaveTitle');
  await act(async () => button('editor.draft.stay').click());
  expect(closed).toBe(0); expect(host.querySelector('textarea')!.value).toBe('Unsent comment'); expect(host.textContent).toContain('Original passage A');
});
test('switching annotation cannot discard the current failed edit without a decision', async () => {
  await open(); await act(async () => button('actions.edit').click());
  expect(host.textContent).toContain('editor.draft.leaveTitle');
  await act(async () => button('editor.draft.stay').click());
  expect(host.querySelector('textarea')!.value).toBe('Unsent comment');
});
