import {ensureTestDom,GlobalRegistrator} from '../../lib/test-dom-setup';
import {afterAll,afterEach,beforeEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import type {Root} from 'react-dom/client';
import type {ConversationVM} from '../../lib/chat-threads';

ensureTestDom();const {createRoot}=await import('react-dom/client');const {ThreadRail}=await import('./thread-rail');
let root:Root,host:HTMLDivElement;
beforeEach(()=>{ensureTestDom();(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();delete(globalThis as any).IS_REACT_ACT_ENVIRONMENT;});
afterAll(()=>{try{GlobalRegistrator.unregister();}catch{}});
test('thread list renders durable context, unavailable objects, activity and explicit pagination',async()=>{
  const rows:ConversationVM[]=[{id:'thread',title:'Learning Kubernetes',updatedAt:new Date().toISOString(),activity:'needs_approval',
    context:{policy:'strict',refs:[{ref:{kind:'source',id:'book'},label:'Original book',available:false}]}}];
  let selected='',more=0;
  await act(async()=>root.render(<ThreadRail conversations={rows} activeId={null} loaded isMobile onOpen={id=>{selected=id;}} onNew={()=>{}} onRename={()=>{}} onDelete={()=>{}} onTogglePin={()=>{}}
    hasMore onLoadMore={()=>more++} t={key=>key}/>));
  expect(host.textContent).toContain('Original book');expect(host.textContent).toContain('assistant.unavailable');expect(host.textContent).toContain('assistant.activity.needs_approval');
  await act(async()=>(host.querySelector('.nn-thread-row') as HTMLElement).click());expect(selected).toBe('thread');
  await act(async()=>Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='assistant.more')!.click());expect(more).toBe(1);
});
