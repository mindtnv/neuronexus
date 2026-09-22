import { afterEach, beforeEach, expect, test } from 'bun:test';
import { buildApp } from '../src/app';
import { callApp, resetTestDb, signUpAndCookie, uniqueEmail } from './helpers';
import { __setAiClientForTests, __resetAiClientForTests } from '../src/ai/openai-client';
const app=buildApp();beforeEach(resetTestDb);afterEach(__resetAiClientForTests);
test('textual strict intent precedes agent execution and persists the effective policy',async()=>{
  const {cookie}=await signUpAndCookie(app,uniqueEmail());
  const thread=await(await callApp(app,'POST','/chat/conversations',{cookie,body:{title:'Policy test'}})).json<any>();
  const order:string[]=[];
  __setAiClientForTests({complete:async()=>{order.push('policy');return '{"intent":"strict"}';},async *chatStreamAgentic(messages){order.push('agent');expect(String(messages[0]!.content)).toContain('strict');yield {type:'content',text:'No selected evidence.'};yield {type:'finish',reason:'stop'};}});
  const response=await callApp(app,'POST',`/chat/conversations/${thread.id}/stream`,{cookie,body:{content:'Answer only from the selected materials',context:{version:1,policy:'focus',refs:[]}}});
  const frames=await response.text();expect(frames).toContain('event: context');expect(order[0]).toBe('policy');expect(order).toContain('agent');
  const detail=await(await callApp(app,'GET',`/chat/conversations/${thread.id}`,{cookie})).json<any>();
  expect(detail.conversation.context.policy).toBe('strict');expect(detail.messages.find((m:any)=>m.role==='user').context.policy).toBe('strict');
});
test('unresolved intent preserves the draft by rejecting before insertion; an explicit selection bypasses the classifier',async()=>{
  const {cookie}=await signUpAndCookie(app,uniqueEmail());
  const thread=await(await callApp(app,'POST','/chat/conversations',{cookie,body:{title:'Policy test'}})).json<any>();
  let classified=0,agent=0;
  __setAiClientForTests({complete:async()=>{classified++;return 'ambiguous';},async *chatStreamAgentic(){agent++;yield {type:'content',text:'Answer'};yield {type:'finish',reason:'stop'};}});
  const path=`/chat/conversations/${thread.id}/stream`;
  const first=await callApp(app,'POST',path,{cookie,body:{content:'Use only appropriate materials'}});
  expect(first.status).toBe(400);expect(await first.json()).toEqual({error:'context_policy_selection_required'});expect(agent).toBe(0);
  const detail=await(await callApp(app,'GET',`/chat/conversations/${thread.id}`,{cookie})).json<any>();expect(detail.messages).toEqual([]);
  const selected=await callApp(app,'POST',path,{cookie,body:{content:'Use only appropriate materials',policySelection:'strict'}});
  expect(selected.status).toBe(200);expect(await selected.text()).toContain('event: done');expect(classified).toBe(1);
});

test('edited regeneration resolves strict intent before replay and leaves history intact on ambiguity', async () => {
  const { cookie } = await signUpAndCookie(app, uniqueEmail());
  const thread = await (await callApp(app, 'POST', '/chat/conversations', { cookie, body: { title: 'Edited policy' } })).json<any>();
  let intent = 'ambiguous';
  let runs = 0;
  let classifications = 0;
  __setAiClientForTests({
    complete: async () => { classifications++; return intent; },
    async *chatStreamAgentic(messages) {
      runs++;
      if (runs > 1) expect(String(messages[0]!.content)).toContain('strict');
      yield { type: 'content', text: 'Original answer' };
      yield { type: 'finish', reason: 'stop' };
    },
  });
  await (await callApp(app, 'POST', `/chat/conversations/${thread.id}/stream`, { cookie, body: { content: 'Explain Pods', context: { version: 1, policy: 'focus', refs: [] } } })).text();
  const read = async () => (await callApp(app, 'GET', `/chat/conversations/${thread.id}`, { cookie })).json<any>();
  const before = await read();
  const path = `/chat/context-v1/conversations/${thread.id}/regenerate`;
  const rejected = await callApp(app, 'POST', path, { cookie, body: { content: 'Answer only from selected materials' } });
  expect(rejected.status).toBe(400);
  expect(await rejected.json()).toEqual({ error: 'context_policy_selection_required' });
  expect((await read()).messages).toEqual(before.messages);
  expect(runs).toBe(1);
  intent = '{"intent":"strict"}';
  const replay = await callApp(app, 'POST', path, { cookie, body: { content: 'Answer only from selected materials' } });
  expect(replay.status).toBe(200);
  expect(await replay.text()).toContain('event: context');
  expect((await read()).messages.find((message: any) => message.role === 'user').context.policy).toBe('strict');
  expect(runs).toBe(2);
  const classifiedBeforeReplay = classifications;
  intent = 'ambiguous';
  // Ordinary regeneration reuses the persisted snapshot without interpreting
  // old instructions against the current composer or classifier state.
  expect(await (await callApp(app, 'POST', path, { cookie, body: {} })).text()).toContain('event: done');
  expect(classifications).toBe(classifiedBeforeReplay);
  // The visible choice can resolve an ambiguous edited request explicitly.
  const explicit = await callApp(app, 'POST', path, { cookie, body: { content: 'Use only appropriate materials', policySelection: 'strict' } });
  expect(await explicit.text()).toContain('event: done');
  expect(classifications).toBe(classifiedBeforeReplay);
});
