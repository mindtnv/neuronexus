import { ensureTestDom, GlobalRegistrator } from '../../lib/test-dom-setup';
import { afterAll, afterEach, beforeEach, expect, test, spyOn } from 'bun:test';
import React, { act, useLayoutEffect, useRef } from 'react';
import type { Root } from 'react-dom/client';
import { DialogProvider } from '../dialog';
ensureTestDom();
const {createRoot}=await import('react-dom/client');const {TextChunkReader}=await import('./text-reader');
let root:Root,host:HTMLDivElement,oldFetch:typeof fetch;
beforeEach(()=>{ensureTestDom();(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;oldFetch=globalThis.fetch;globalThis.fetch=(async()=>Response.json({items:[],nextOffset:null})) as unknown as typeof fetch;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();globalThis.fetch=oldFetch;delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;});
afterAll(()=>{try{GlobalRegistrator.unregister();}catch{}});
const page=(id:string)=>({items:[{id,sourceId:id,position:0,text:`Text ${id}`} as any],total:1,nextFrom:null});
test('restoring position during initial loading does not request and append the same page twice',async()=>{
  let calls=0,finish!:(value:ReturnType<typeof page>)=>void;
  const promise=new Promise<ReturnType<typeof page>>(resolve=>{finish=resolve;});
  const load=async()=>{calls++;return promise;};
  function Reader(){const ref=useRef<import('./text-reader').TextChunkReaderHandle>(null);useLayoutEffect(()=>ref.current?.scrollToChunk(undefined,0),[]);return <TextChunkReader ref={ref} sourceId="book" getSourceChunks={load} t={key=>key}/>;}
  await act(async()=>root.render(<DialogProvider><Reader/></DialogProvider>));
  expect(calls).toBe(1);
  await act(async()=>{finish(page('chunk'));await promise;});
  expect(host.querySelectorAll('[data-chunk-id="chunk"]')).toHaveLength(1);
});
test('a late response for the previous source cannot replace the newly opened material',async()=>{
  let first!:(value:ReturnType<typeof page>)=>void;
  const old=new Promise<ReturnType<typeof page>>(resolve=>{first=resolve;});
  const load=async(id:string)=>id==='old'?old:page('new');
  await act(async()=>root.render(<DialogProvider><TextChunkReader sourceId="old" getSourceChunks={load} t={key=>key}/></DialogProvider>));
  await act(async()=>root.render(<DialogProvider><TextChunkReader sourceId="new" getSourceChunks={load} t={key=>key}/></DialogProvider>));
  await act(async()=>{first(page('old'));await old;});
  expect(host.textContent).toContain('Text new');expect(host.textContent).not.toContain('Text old');
});

test('a temporary text loading failure offers a retry instead of declaring the source deleted',async()=>{
  const {ApiError}=await import('../../lib/api');let calls=0;
  const load=async()=>{if(++calls===1)throw new ApiError('Unavailable',{status:503});return page('recovered');};
  await act(async()=>root.render(<DialogProvider><TextChunkReader sourceId="book" getSourceChunks={load} t={key=>key}/></DialogProvider>));
  expect(host.textContent).toContain('assistant.textLoadFailed');expect(host.textContent).not.toContain('notebooks.backlinks.tombstone');expect(calls).toBe(1);
  await act(async()=>Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='review.retry')!.click());
  expect(host.textContent).toContain('Text recovered');expect(host.querySelector('[role="alert"]')).toBeNull();
});
test('an ownership 404 still reports an unavailable source',async()=>{
  const {ApiError}=await import('../../lib/api');
  const load=async()=>{throw new ApiError('Not found',{status:404});};
  await act(async()=>root.render(<DialogProvider><TextChunkReader sourceId="missing" getSourceChunks={load} t={key=>key}/></DialogProvider>));
  expect(host.textContent).toContain('notebooks.backlinks.tombstone');expect(host.textContent).not.toContain('assistant.textLoadFailed');
});

test('a failed next page leaves readable text in place and resumes only after retry',async()=>{
  const {ApiError}=await import('../../lib/api');let attempts=0;
  const load=async(_id:string,from=0)=>{
    if(from===0)return {...page('first'),total:2,nextFrom:50};
    if(++attempts===1)throw new ApiError('Unavailable',{status:503});
    return {...page('second'),total:2};
  };
  await act(async()=>root.render(<DialogProvider><TextChunkReader sourceId="book" getSourceChunks={load} t={key=>key}/></DialogProvider>));
  await act(async()=>Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='notebooks.reader.loadMore')!.click());
  expect(host.textContent).toContain('Text first');expect(host.textContent).toContain('assistant.textLoadFailed');expect(attempts).toBe(1);
  await act(async()=>Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='review.retry')!.click());
  expect(host.textContent).toContain('Text first');expect(host.textContent).toContain('Text second');expect(attempts).toBe(2);
});

test('an explicit jump after text has loaded executes and respects reduced motion',async()=>{
  const ref=React.createRef<import('./text-reader').TextChunkReaderHandle>();
  const scroll=spyOn(HTMLElement.prototype,'scrollIntoView').mockImplementation(()=>{});
  const media=spyOn(window,'matchMedia').mockImplementation(()=>({matches:true,addEventListener(){},removeEventListener(){}}) as any);
  try{
    await act(async()=>root.render(<DialogProvider><TextChunkReader ref={ref} sourceId="book" getSourceChunks={async()=>page('chunk')} t={key=>key}/></DialogProvider>));
    await act(async()=>ref.current?.scrollToChunk('chunk'));
    expect(scroll).toHaveBeenCalledWith({behavior:'auto',block:'center'});
  }finally{scroll.mockRestore();media.mockRestore();}
});
