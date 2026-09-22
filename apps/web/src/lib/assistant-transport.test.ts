import { ensureTestDom, GlobalRegistrator } from './test-dom-setup';
import {afterAll,afterEach,beforeEach,expect,test} from 'bun:test';
import {assistantApi,ok} from './api';
const original=globalThis.fetch;
beforeEach(ensureTestDom);
afterAll(()=>{try{GlobalRegistrator.unregister();}catch{}});
afterEach(()=>{globalThis.fetch=original;});
test('assistant API preserves date-looking source text and titles as exact strings',async()=>{
  globalThis.fetch=(async()=>Response.json({items:[{ref:{kind:'source',id:'source'},label:'2026-09-21',excerpt:'2026-09-21T12:00:00Z',available:true}]})) as unknown as typeof fetch;
  const result=await ok(await assistantApi.chat.context.resolve.post({refs:[]}));
  expect(result.items[0]!.label).toBe('2026-09-21');expect(result.items[0]!.excerpt).toBe('2026-09-21T12:00:00Z');
});
