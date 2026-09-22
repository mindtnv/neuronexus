import { ensureTestDom, GlobalRegistrator } from '../../lib/test-dom-setup';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { NavigationJournal, NAVIGATION_HISTORY_KEY } from '../../lib/navigation-context';
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

test('same-tab reader reload reopens its saved study tab and retains its origin', async () => {
  const source = { id: 'book', title: 'Book', kind: 'text', status: 'ready', chunkCount: 1, charCount: 30 };
  useNN.setState({profile:{userId:'reader-owner'} as any,getSource:async()=>source as any,getLibraryItem:async()=>({...source,readingState:{chunkPos:0}}) as any,getSourceChunks:async()=>({items:[{id:'chunk',sourceId:'book',position:0,text:'Some text.'}],total:1,nextFrom:null}) as any});
  const journal=new NavigationJournal('reader-owner','/library',null,sessionStorage);
  journal.commit(journal.plan('/library/book'));
  journal.field('source:book','notesOpen',true);journal.field('source:book','studyTab','annotations');journal.flush();
  history.replaceState({[NAVIGATION_HISTORY_KEY]:journal.marker()},'');
  const router={push(){},replace(){},back(){},forward(){},refresh(){},prefetch(){},hmrRefresh(){},bfcacheId:'test'};
  await act(async()=>root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/library/book"><SearchParamsContext.Provider value={new URLSearchParams()}><AppNavigationProvider><DialogProvider><SourceStudyWorkspace sourceId="book"/></DialogProvider></AppNavigationProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
  expect(host.querySelector('dialog')?.open).toBe(true);
  const annotations=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('notebooks.marks.annotationNotes'));
  expect(annotations?.getAttribute('aria-pressed')).toBe('true');
});

test('reader reload resolves a saved note beyond the loaded list without writing', async () => {
  const source={id:'book',title:'Book',kind:'text',status:'ready',chunkCount:1,charCount:10};
  useNN.setState({profile:{userId:'note-owner'} as any,getSource:async()=>source as any,getLibraryItem:async()=>({...source,readingState:null}) as any,getSourceChunks:async()=>({items:[],total:0,nextFrom:null}) as any});
  const methods:string[]=[];
  globalThis.fetch=(async(url:any,init:any)=>{methods.push(init?.method??'GET');return Response.json(String(url).includes('/study/notes/saved-note')?{id:'saved-note',ownerKind:'source',sourceId:'book',sourceOriginTitle:'Book',title:'Recovered note',content:'The retained note contents',kind:'manual',pinned:false,createdAt:'2026-01-01',updatedAt:'2026-01-01'}:{items:[],nextOffset:null,chatEnabled:false});}) as unknown as typeof fetch;
  const journal=new NavigationJournal('note-owner','/library/book',null,sessionStorage);
  journal.field('source:book','notesOpen',true);journal.field('source:book','noteId','saved-note');journal.flush();
  history.replaceState({[NAVIGATION_HISTORY_KEY]:journal.marker()},'');
  const router={push(){},replace(){},back(){},forward(){},refresh(){},prefetch(){},hmrRefresh(){},bfcacheId:'test'};
  await act(async()=>root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/library/book"><SearchParamsContext.Provider value={new URLSearchParams()}><AppNavigationProvider><DialogProvider><SourceStudyWorkspace sourceId="book"/></DialogProvider></AppNavigationProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
  expect(host.textContent).toContain('The retained note contents');
  expect(methods.every(method=>method==='GET')).toBe(true);
});
