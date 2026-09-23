import { expect, test } from 'bun:test';
import { restoreCollectionPages, refreshLoadedCollection } from './navigation-restore';

test('restores a later page using unchanged opaque cursors and preserves current rows', async () => {
  const seen: string[] = [];
  const result = await restoreCollectionPages({ initial: { items: [{id:'a'}], nextCursor:'opaque:1' }, anchors:['c'],
    fetchPage: async cursor => { seen.push(cursor); return cursor === 'opaque:1' ? {items:[{id:'b'}],nextCursor:'opaque:2'} : {items:[{id:'c'}],nextCursor:null}; } });
  expect(seen).toEqual(['opaque:1','opaque:2']); expect(result.reason).toBe('found');
  expect(result.items.map(x=>x.id)).toEqual(['a','b','c']);
});
test('reconstruction is bounded by pages, records and elapsed time', async () => {
  const initial={items:[{id:'a'}],nextCursor:'one'};
  const fetchPage=async(cursor:string)=>({items:[{id:cursor}],nextCursor:cursor+'x'});
  for(const limits of [{pages:2,rows:100,ms:1000},{pages:20,rows:2,ms:1000}]) {
    const result=await restoreCollectionPages({initial,anchors:['missing'],fetchPage,limits});
    expect(result.reason).toBe('limit');expect(result.requests).toBeLessThanOrEqual(1);
  }
  let calls=0; const result=await restoreCollectionPages({initial,anchors:['missing'],fetchPage:async c=>{calls++;return fetchPage(c);}, now:()=>calls?5001:0});
  expect(result.reason).toBe('limit');expect(calls).toBe(1);
});
test('errors and cancellation never turn a loaded collection into empty success', async () => {
  const initial={items:[{id:'a'}],nextCursor:'one'};
  const failed=await restoreCollectionPages({initial,anchors:['b'],fetchPage:async()=>{throw Error('network');}});
  expect(failed.reason).toBe('error');expect(failed.items).toEqual(initial.items);
  const controller=new AbortController();let resolve!: (v:any)=>void;
  const pending=restoreCollectionPages({initial,anchors:['b'],signal:controller.signal,fetchPage:()=>new Promise<{items:{id:string}[];nextCursor:string|null}>(r=>{resolve=r;})});
  controller.abort();resolve({items:[{id:'b'}],nextCursor:null});
  const cancelled=await pending;expect(cancelled.reason).toBe('cancelled');expect(cancelled.items).toEqual(initial.items);
});
test('missing anchors terminate at end of results and repeated cursors cannot loop', async()=>{
  const initial={items:[{id:'a'}],nextCursor:'same'};
  const missing=await restoreCollectionPages({initial,anchors:['missing'],fetchPage:async()=>({items:[],nextCursor:null})});
  expect(missing.reason).toBe('missing');
  const loop=await restoreCollectionPages({initial,anchors:['missing'],fetchPage:async()=>({items:[],nextCursor:'same'})});
  expect(loop.reason).toBe('limit');expect(loop.requests).toBe(1);
});
test('reconstructs the whole previously visible window beyond a page boundary',async()=>{
  const requests:string[]=[];
  const result=await restoreCollectionPages({initial:{items:[{id:'top'}],nextCursor:'next'},anchors:['top'],throughId:'bottom',
    fetchPage:async cursor=>{requests.push(cursor);return {items:[{id:'bottom'}],nextCursor:null};}});
  expect(requests).toEqual(['next']);expect(result.items.map(row=>row.id)).toEqual(['top','bottom']);
});
test('revalidation keeps the loaded tail instead of replacing two pages with only the first',async()=>{
  const result=await refreshLoadedCollection({items:[{id:'a'},{id:'b'},{id:'c'}],nextCursor:null},async cursor=>cursor?{items:[{id:'c'}],nextCursor:null}:{items:[{id:'a'},{id:'b'}],nextCursor:'tail'});
  expect(result.items.map(row=>row.id)).toEqual(['a','b','c']);
});
test('a failed tail refresh preserves the real error rather than committing a shorter successful page',async()=>{
  const failure=new Error('tail unavailable');
  await expect(refreshLoadedCollection({items:[{id:'a'},{id:'b'}],nextCursor:null},async cursor=>{if(cursor)throw failure;return {items:[{id:'a'}],nextCursor:'tail'};})).rejects.toBe(failure);
});
