import { ensureTestDom, GlobalRegistrator } from '../../lib/test-dom-setup';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { Root } from 'react-dom/client';
import { AppNavigationProvider } from '../navigation';
import { Modal } from '../design-system/modal';
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
  await act(async () => root.render(<AppRouterContext.Provider value={{ push() {} } as any}><AppNavigationProvider><DialogProvider><SourceStudioPanel initialArtifactId="quiz" chatEnabled={false} /></DialogProvider></AppNavigationProvider></AppRouterContext.Provider>));
  await act(async () => Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'notebooks.quiz.start')!.click());
  expect(document.body.textContent).toContain('A Pod groups containers');
  expect(paths.some(path => path.includes('/study/artifacts/quiz'))).toBe(true);
  expect(paths.every(path => !path.includes('/notebooks') && !path.includes('/sources/'))).toBe(true);
});

test('retained artifact actions expose a disabled regeneration item with an unavailable-source explanation', async () => {
  globalThis.fetch = (async () => Response.json({ items: [artifact], nextOffset: null })) as unknown as typeof fetch;
  await act(async () => root.render(<AppRouterContext.Provider value={{ push() {} } as any}><AppNavigationProvider><DialogProvider><SourceStudioPanel chatEnabled /></DialogProvider></AppNavigationProvider></AppRouterContext.Provider>));
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="library.item.menu"]')!.click());
  const regenerate = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('notebooks.studio.regenerate'))!;
  expect(regenerate.disabled).toBe(true); expect(regenerate.title).toBe('assistant.sourceUnavailable');
});
test('source generation failures stay visible inside the panel and its hint names the source owner', async () => {
  globalThis.fetch = (async (_url: any, init: any) => init?.method === 'POST'
    ? Response.json({ error: 'no_sources' }, { status: 400 }) : Response.json({ items: [], nextOffset: null })) as unknown as typeof fetch;
  await act(async () => root.render(<AppRouterContext.Provider value={{ push() {} } as any}><AppNavigationProvider><DialogProvider><SourceStudioPanel sourceId="book" chatEnabled /></DialogProvider></AppNavigationProvider></AppRouterContext.Provider>));
  expect(host.textContent).toContain('assistant.sourceDocumentsHint');
  expect(host.textContent).not.toContain('notebooks.studio.docsHint');
  await act(async () => host.querySelector<HTMLButtonElement>('button[title="notebooks.studio.type_summaryDesc"]')!.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('notebooks.studio.err_no_sources');
});

test('an artifact read failure retains a retryable viewer and never starts generation', async () => {
  let unavailable=true;const methods:string[]=[];
  globalThis.fetch=(async(url:any,init:any)=>{methods.push(init?.method??'GET');return Response.json(String(url).includes('/study/artifacts/quiz')?(unavailable?{error:'unavailable'}:artifact):{items:[artifact],nextOffset:null},{status:String(url).includes('/study/artifacts/quiz')&&unavailable?503:200});}) as unknown as typeof fetch;
  await act(async()=>root.render(<AppRouterContext.Provider value={{push(){}} as any}><AppNavigationProvider><DialogProvider><SourceStudioPanel initialArtifactId="quiz" chatEnabled/></DialogProvider></AppNavigationProvider></AppRouterContext.Provider>));
  expect(document.body.querySelector('[role="alert"]')).not.toBeNull();
  unavailable=false;
  const retry=[...document.body.querySelectorAll('button')].find(button=>button.textContent==='review.retry');
  expect(retry).not.toBeUndefined();await act(async()=>retry!.click());
  expect(document.body.textContent).toContain('notebooks.quiz.start');expect(methods.every(method=>method==='GET')).toBe(true);
});

test('Escape closes quiz settings before the saved-work panel and does not generate anything', async () => {
  let writes = 0;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => { if (init?.method === 'POST') writes++; return Response.json({ items: [], nextOffset: null }); }) as typeof fetch;
  await act(async () => root.render(<AppRouterContext.Provider value={{ push() {} } as any}><AppNavigationProvider><DialogProvider>
    <Modal open title="Saved work" closeLabel="Close work" onClose={() => { throw new Error('parent closed'); }}><SourceStudioPanel sourceId="book" chatEnabled /></Modal>
  </DialogProvider></AppNavigationProvider></AppRouterContext.Provider>));
  await act(async () => host.querySelector<HTMLButtonElement>('button[title="notebooks.studio.type_quizDesc"]')!.click());
  expect(host.querySelectorAll('dialog[open]')).toHaveLength(2);
  await act(async () => host.querySelector('input[type="range"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(host.querySelectorAll('dialog[open]')).toHaveLength(1); expect(writes).toBe(0);
});
