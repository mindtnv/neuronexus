import { ensureTestDom, GlobalRegistrator } from '../../lib/test-dom-setup';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { AppNavigationProvider } from '../navigation';
import { NavigationJournal, NAVIGATION_HISTORY_KEY } from '../../lib/navigation-context';
import { DialogProvider } from '../dialog';
import { useNN } from '../../lib/store';
import { ApiError } from '../../lib/api';
import { clearSessionResourceCache } from '../../lib/session-resource';
ensureTestDom();
const { createRoot } = await import('react-dom/client');
const { LibraryScreen } = await import('./library');
const { NNDecks } = await import('./decks');
const { NotebooksScreen } = await import('./notebooks');
let root: Root, host: HTMLDivElement, oldFetch: typeof fetch;
const originalList = useNN.getState().listLibrary;
const originalDetail = useNN.getState().getLibraryItem;
const originalNotebooks = useNN.getState().listNotebooks;
let queries: any[];
const router = { push() {}, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {}, hmrRefresh() {}, bfcacheId: 'navigation-test' };
beforeEach(() => {
  ensureTestDom(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  oldFetch = globalThis.fetch; globalThis.fetch = (async(url:unknown)=>(/stats|study-summary/.test(String(url)))?Response.json({error:'test_unavailable'},{status:503}):Response.json({chatEnabled:false})) as unknown as typeof fetch;
  window.sessionStorage.clear(); clearSessionResourceCache(); queries=[];
  useNN.setState({profile:{userId:'library-owner'} as any,bootstrapped:true,listLibrary:async(q)=>{queries.push(q);return {items:[],nextCursor:null};}});
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();globalThis.fetch=oldFetch;useNN.setState({listLibrary:originalList,listNotebooks:originalNotebooks,getLibraryItem:originalDetail});useNN.getState().reset();clearSessionResourceCache();delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;});
afterAll(()=>{try{GlobalRegistrator.unregister();}catch{}});
async function render(path='/library', screen:React.ReactNode=<LibraryScreen/>) {
  await act(async()=>root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value={path}><SearchParamsContext.Provider value={new URLSearchParams()}><AppNavigationProvider><DialogProvider>{screen}</DialogProvider></AppNavigationProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
}
function savedView() {
  const journal=new NavigationJournal('library-owner','/library',null,window.sessionStorage);
  journal.field('library','search','saved topic');journal.field('library','kind','text');journal.field('library','sort','title');journal.field('library','reading','finished');journal.flush();
  window.history.replaceState({[NAVIGATION_HISTORY_KEY]:journal.marker()},'');
}
test('reload initializes the remembered library view before requesting its collection',async()=>{
  savedView();await render();
  const input=host.querySelector('input[aria-label="library.header.searchPlaceholder"]') as HTMLInputElement;
  expect(input.value).toBe('saved topic');
  const collectionQueries=queries.filter(q=>q?.limit!==6);
  expect(collectionQueries.some(q=>q?.q==='saved topic'&&q.kind==='text'&&q.sort==='title'&&q.reading==='finished')).toBe(true);
  expect(collectionQueries.some(q=>q?.sort==='added'&&!q.q)).toBe(false);
});
test('reset clears remembered browsing state and keeps appearance preferences',async()=>{
  localStorage.setItem('nn:lib:view','list');savedView();await render();
  const reset=host.querySelector('button[aria-label="navigation.reset"]') as HTMLButtonElement;
  expect(reset).not.toBeNull();
  await act(async()=>reset.click());
  expect((host.querySelector('input[aria-label="library.header.searchPlaceholder"]') as HTMLInputElement).value).toBe('');
  expect(localStorage.getItem('nn:lib:view')).toBe('list');
});

test('deck search and notebook archive scope restore through the same entry protocol',async()=>{
  useNN.setState({decks:[{id:'deck-a',name:'Anatomy',parentId:null,position:0,color:'lime'} as any]});
  const deck=new NavigationJournal('library-owner','/decks',null,sessionStorage);
  deck.field('decks','deckSearch','Anatomy');deck.field('decks','selectedId','deck-a');deck.flush();
  history.replaceState({[NAVIGATION_HISTORY_KEY]:deck.marker()},'');
  await render('/decks',<NNDecks/>);
  expect((host.querySelector('input[aria-label="decks.filters.search"]') as HTMLInputElement).value).toBe('Anatomy');
});
test('notebook reload requests the saved archive scope before rendering results',async()=>{
  const notebook=new NavigationJournal('library-owner','/notebooks',null,sessionStorage);
  notebook.field('notebooks','search','saved notebook');notebook.field('notebooks','archived',true);notebook.flush();
  history.replaceState({[NAVIGATION_HISTORY_KEY]:notebook.marker()},'');
  const scopes:any[]=[];useNN.setState({listNotebooks:async(q)=>{scopes.push(q);return [];}});
  await render('/notebooks',<NotebooksScreen/>);
  expect(scopes).toEqual([{archived:true}]);
  expect((host.querySelector('input') as HTMLInputElement).value).toBe('saved notebook');
});

test('returning to decks refreshes the hierarchy and drops a deleted inspected deck',async()=>{
  useNN.setState({decks:[{id:'deleted-deck',name:'Gone',parentId:null,position:0,color:'lime',createdAt:0} as any]});
  const journal=new NavigationJournal('library-owner','/decks',null,sessionStorage);journal.field('decks','selectedId','deleted-deck');journal.field('decks','deckSearch','Gone');journal.flush();history.replaceState({[NAVIGATION_HISTORY_KEY]:journal.marker()},'');
  let checked=false;globalThis.fetch=(async(url:any)=>{if(String(url).endsWith('/decks')){checked=true;return Response.json([]);}return Response.json({error:'unavailable'},{status:503});}) as unknown as typeof fetch;
  await render('/decks',<NNDecks/>);expect(checked).toBe(true);expect(host.querySelector('[role="treeitem"]')).toBeNull();expect((host.querySelector('input[aria-label="decks.filters.search"]') as HTMLInputElement).value).toBe('Gone');
});


test('restored library details retain their panel on a transient failure and support retry',async()=>{
  savedView();
  const journal=new NavigationJournal('library-owner','/library',history.state[NAVIGATION_HISTORY_KEY],sessionStorage);
  journal.field('library','detailId','source-a');journal.flush();
  let attempts=0;useNN.setState({getLibraryItem:async()=>{attempts++;throw new ApiError('unavailable',{status:503});}});
  await render();expect(attempts).toBe(1);
  expect(host.querySelector('[aria-label="library.details.close"]')).not.toBeNull();
  const retry=[...host.querySelectorAll('button')].find(button=>button.textContent==='navigation.retry');
  expect(retry).toBeDefined();await act(async()=>retry!.click());expect(attempts).toBe(2);
  expect((host.querySelector('input[aria-label="library.header.searchPlaceholder"]') as HTMLInputElement).value).toBe('saved topic');
});
test('an unavailable restored library detail closes while preserving collection filters',async()=>{
  savedView();const journal=new NavigationJournal('library-owner','/library',history.state[NAVIGATION_HISTORY_KEY],sessionStorage);
  journal.field('library','detailId','deleted-source');journal.flush();
  useNN.setState({getLibraryItem:async()=>{throw new ApiError('not_found',{status:404});}});
  await render();expect(host.querySelector('[aria-label="library.details.close"]')).toBeNull();
  expect((host.querySelector('input[aria-label="library.header.searchPlaceholder"]') as HTMLInputElement).value).toBe('saved topic');
});
