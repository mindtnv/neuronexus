import { ensureTestDom, GlobalRegistrator } from '../../lib/test-dom-setup';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { Root } from 'react-dom/client';
import { DialogProvider } from '../dialog';
ensureTestDom();
const { createRoot } = await import('react-dom/client');
const { SourceStudioPanel } = await import('./source-studio-panel');
let root: Root, host: HTMLDivElement, oldFetch: typeof fetch;
beforeEach(() => { ensureTestDom(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; oldFetch = globalThis.fetch; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); globalThis.fetch = oldFetch; delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT; });
afterAll(() => { try { GlobalRegistrator.unregister(); } catch {} });
const artifact = { id: 'quiz', notebookId: null, ownerKind: 'source', sourceId: null, sourceOriginId: 'book', sourceOriginTitle: 'Deleted book', title: 'My saved quiz', type: 'quiz', status: 'ready', sourceIds: [], createdAt: '2026-01-01', updatedAt: '2026-01-01', contentJson: { questions: [{ id: 'question', kind: 'tf', prompt: 'A Pod groups containers', answer: true, explanation: 'Yes' }] } };
test('a retained quiz opens the existing player without reading a deleted source or creating a notebook', async () => {
  const paths: string[] = [];
  globalThis.fetch = (async (url: any) => { paths.push(String(url)); return Response.json(String(url).includes('/study/artifacts/quiz') && !String(url).includes('/attempts') ? artifact : { items: [], nextOffset: null }); }) as unknown as typeof fetch;
  await act(async () => root.render(<AppRouterContext.Provider value={{ push() {} } as any}><DialogProvider><SourceStudioPanel initialArtifactId="quiz" chatEnabled={false} /></DialogProvider></AppRouterContext.Provider>));
  await act(async () => Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'notebooks.quiz.start')!.click());
  expect(document.body.textContent).toContain('A Pod groups containers');
  expect(paths.some(path => path.includes('/study/artifacts/quiz'))).toBe(true);
  expect(paths.every(path => !path.includes('/notebooks') && !path.includes('/sources/'))).toBe(true);
});

test('retained artifact actions expose a disabled regeneration item with an unavailable-source explanation', async () => {
  globalThis.fetch = (async () => Response.json({ items: [artifact], nextOffset: null })) as unknown as typeof fetch;
  await act(async () => root.render(<AppRouterContext.Provider value={{ push() {} } as any}><DialogProvider><SourceStudioPanel chatEnabled /></DialogProvider></AppRouterContext.Provider>));
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="library.item.menu"]')!.click());
  const regenerate = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('notebooks.studio.regenerate'))!;
  expect(regenerate.disabled).toBe(true); expect(regenerate.title).toBe('assistant.sourceUnavailable');
});
test('source generation failures stay visible inside the panel and its hint names the source owner', async () => {
  globalThis.fetch = (async (_url: any, init: any) => init?.method === 'POST'
    ? Response.json({ error: 'no_sources' }, { status: 400 }) : Response.json({ items: [], nextOffset: null })) as unknown as typeof fetch;
  await act(async () => root.render(<AppRouterContext.Provider value={{ push() {} } as any}><DialogProvider><SourceStudioPanel sourceId="book" chatEnabled /></DialogProvider></AppRouterContext.Provider>));
  expect(host.textContent).toContain('assistant.sourceDocumentsHint');
  expect(host.textContent).not.toContain('notebooks.studio.docsHint');
  await act(async () => host.querySelector<HTMLButtonElement>('button[title="notebooks.studio.type_summaryDesc"]')!.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('notebooks.studio.err_no_sources');
});
