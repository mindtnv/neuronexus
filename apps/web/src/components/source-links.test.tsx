import { ensureTestDom, GlobalRegistrator } from '../lib/test-dom-setup';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { AppNavigationProvider } from './navigation';
import { useNN } from '../lib/store';
ensureTestDom();
const {createRoot}=await import('react-dom/client'); const {SourceLinksPanel}=await import('./source-links');
let root:Root,host:HTMLDivElement,oldFetch:typeof fetch;
const pushes:string[]=[];
const router={push(path:string){pushes.push(path);},replace(){},back(){},forward(){},refresh(){},prefetch(){},hmrRefresh(){},bfcacheId:'test'};
beforeEach(()=>{ensureTestDom();(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true; oldFetch=globalThis.fetch;pushes.length=0;
  useNN.setState({profile:{userId:'alice'} as any});host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();globalThis.fetch=oldFetch;useNN.getState().reset();delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;});
afterAll(()=>{try{GlobalRegistrator.unregister();}catch{}});
async function render(){await act(async()=>root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/cards"><SearchParamsContext.Provider value={new URLSearchParams()}><AppNavigationProvider><SourceLinksPanel cardId="card"/></AppNavigationProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));}
const item={id:'link',createdAt:'2026-09-21T00:00:00Z',sourceId:'book',sourceChunkId:'chunk',sourceTitle:'Original title',snippet:'Historical quote',position:3,page:4,locationAvailable:true};
test('a deleted source retains its historical quote and title but cannot navigate',async()=>{
  globalThis.fetch=(async()=>Response.json({items:[{...item,sourceId:null,sourceChunkId:null,locationAvailable:false}]})) as unknown as typeof fetch;
  await render();expect(host.textContent).toContain('Original title');expect(host.textContent).toContain('Historical quote');
  expect(host.querySelector('button')!.disabled).toBe(true);expect(pushes).toEqual([]);
});
test('backlinks revalidate deletion before navigating and do not leak cached content across accounts',async()=>{
  let reads=0;globalThis.fetch=(async()=>Response.json({items:[{...item,...(++reads>1?{sourceId:null,sourceChunkId:null,locationAvailable:false}:{})}]})) as unknown as typeof fetch;
  await render();await act(async()=>{host.querySelector('button')!.click();await new Promise(resolve=>setTimeout(resolve,0));});
  expect(reads).toBe(2);expect(pushes).toEqual([]);expect(host.querySelector('button')!.disabled).toBe(true);
  globalThis.fetch=(async()=>Response.json({items:[]})) as unknown as typeof fetch;
  await act(async()=>useNN.setState({profile:{userId:'bob'} as any}));expect(host.textContent).not.toContain('Historical quote');
});

test('source-only legacy links do not claim a supplied quote that was never stored', async () => {
  globalThis.fetch = (async () => Response.json({ items: [{ ...item, snippet: '', sourceChunkId: null,
    sourceSnapshot: { version: 1, kind: 'user_quote', sourceId: 'book', sourceTitle: 'Original title', sourceVersion: '2026-09-21T00:00:00Z', quote: '' } }] })) as unknown as typeof fetch;
  await render(); expect(host.textContent).toContain('Original title');
  expect(host.textContent).not.toContain('chat.confirm.userQuoteEvidence');
});
test('manual text selections retain the user-supplied quote label', async () => {
  globalThis.fetch = (async () => Response.json({ items: [{ ...item,
    sourceSnapshot: { version: 1, kind: 'user_selection', sourceId: 'book', sourceTitle: 'Original title', chunkId: 'chunk', position: 3, textHash: 'a'.repeat(64), quote: 'Historical quote', selection: { version: 1, quote: 'Historical quote', chunks: [] } } }] })) as unknown as typeof fetch;
  await render(); expect(host.textContent).toContain('chat.confirm.userQuoteEvidence');
});
