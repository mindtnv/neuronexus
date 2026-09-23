import {expect,test} from 'bun:test';
import {unavailableOriginFallback} from './navigation-origin';
test('a deleted notebook falls back to its collection without requiring its source to be deleted',async()=>{
  const reads:string[]=[];
  const fallback=await unavailableOriginFallback('/notebooks/book?source=source',async(kind)=>{reads.push(kind);throw {status:404};});
  expect(fallback).toBe('/notebooks');expect(reads).toEqual(['notebook']);
});
test('a missing source inside a live notebook falls back to that notebook',async()=>{
  expect(await unavailableOriginFallback('/notebooks/book?source=gone',async kind=>{if(kind==='source')throw {status:404};})).toBe('/notebooks/book');
  expect(await unavailableOriginFallback('/library/gone',async()=>{throw {status:403};})).toBe('/library');
});
test('collection routes need no object fetch and transient failures are not treated as deletion',async()=>{
  let calls=0;expect(await unavailableOriginFallback('/library/study?note=n',async()=>{calls++;})).toBeNull();expect(calls).toBe(0);
  expect(unavailableOriginFallback('/library/book',async()=>{throw {status:503};})).rejects.toEqual({status:503});
});
