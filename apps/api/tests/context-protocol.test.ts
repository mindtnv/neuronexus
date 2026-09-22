import {afterEach,beforeEach,expect,test} from 'bun:test';
import {buildApp} from '../src/app';
import {callApp,resetTestDb,signUpAndCookie,uniqueEmail} from './helpers';
import {__setAiClientForTests,__resetAiClientForTests} from '../src/ai/openai-client';
const app=buildApp();beforeEach(resetTestDb);afterEach(__resetAiClientForTests);
test('versioned and legacy routes address the same conversation and preserve typed context',async()=>{
  const {cookie}=await signUpAndCookie(app,uniqueEmail());
  const created=await callApp(app,'POST','/chat/context-v1/conversations',{cookie,body:{context:{version:1,policy:'strict',refs:[]}}});expect(created.status).toBe(200);
  const thread=await created.json<any>();
  expect((await callApp(app,'GET',`/chat/conversations/${thread.id}`,{cookie})).status).toBe(200);
  __setAiClientForTests({async *chatStreamAgentic(){yield {type:'content',text:'Answer'};yield {type:'finish',reason:'stop'};}});
  const sent=await callApp(app,'POST',`/chat/context-v1/conversations/${thread.id}/stream`,{cookie,body:{content:'Hello',context:{version:1,policy:'strict',refs:[]}}});expect(await sent.text()).toContain('event: done');
  const detail=await(await callApp(app,'GET',`/chat/conversations/${thread.id}`,{cookie})).json<any>();expect(detail.messages[0].context.policy).toBe('strict');
});
test('both route versions share the same per-conversation admission lock',async()=>{
  const {cookie}=await signUpAndCookie(app,uniqueEmail());
  const thread=await(await callApp(app,'POST','/chat/conversations',{cookie,body:{}})).json<any>();
  let finish!:()=>void;const hold=new Promise<void>(resolve=>{finish=resolve;});
  __setAiClientForTests({async *chatStreamAgentic(){await hold;yield {type:'finish',reason:'stop'};}});
  const first=await callApp(app,'POST',`/chat/conversations/${thread.id}/stream`,{cookie,body:{content:'One'}});const draining=first.text();
  try{const duplicate=await callApp(app,'POST',`/chat/context-v1/conversations/${thread.id}/stream`,{cookie,body:{content:'Two'}});expect(duplicate.status).toBe(409);expect(await duplicate.json()).toEqual({error:'turn_in_progress'});}
  finally{finish();await draining;}
});
