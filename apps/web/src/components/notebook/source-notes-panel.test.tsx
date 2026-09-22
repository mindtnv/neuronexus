import { ensureTestDom, GlobalRegistrator } from '../../lib/test-dom-setup';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { DialogProvider } from '../dialog';
ensureTestDom();
const { createRoot } = await import('react-dom/client');
const { SourceNotesPanel } = await import('./source-notes-panel');
let root: Root, host: HTMLDivElement, oldFetch: typeof fetch;
beforeEach(() => { ensureTestDom(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; oldFetch = globalThis.fetch; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); globalThis.fetch = oldFetch; delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT; });
afterAll(() => { try { GlobalRegistrator.unregister(); } catch {} });
const note = { id: 'note', notebookId: null, ownerKind: 'source', sourceId: null, sourceOriginId: 'book', sourceOriginTitle: 'Deleted book', title: 'My saved note', content: 'Preserved conclusions', kind: 'manual', pinned: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
test('a retained note opens without a live source or notebook and reports its unavailable origin', async () => {
  const paths: string[] = [];
  globalThis.fetch = (async (url: any) => { paths.push(String(url)); return Response.json(String(url).includes('/study/notes/note') ? note : { items: [], nextOffset: null }); }) as typeof fetch;
  await act(async () => root.render(<DialogProvider><SourceNotesPanel initialNoteId="note" /></DialogProvider>));
  expect(host.textContent).toContain('Preserved conclusions'); expect(host.textContent).toContain('Deleted book');
  expect(paths.some(path => path.includes('/study/notes/note'))).toBe(true);
  expect(paths.every(path => !path.includes('/notebooks') && !path.includes('/sources/'))).toBe(true);
});
test('a live source uses its own notes endpoint and never creates a notebook', async () => {
  const paths: string[] = [];
  globalThis.fetch = (async (url: any) => { paths.push(String(url)); return Response.json({ items: [{ ...note, sourceId: 'book' }], nextOffset: null }); }) as typeof fetch;
  await act(async () => root.render(<DialogProvider><SourceNotesPanel sourceId="book" /></DialogProvider>));
  expect(host.textContent).toContain('My saved note');
  expect(paths.some(path => path.includes('/sources/book/notes'))).toBe(true);
  expect(paths.every(path => !path.includes('/notebooks'))).toBe(true);
});
