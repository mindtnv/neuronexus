import {ensureTestDom,GlobalRegistrator} from '../lib/test-dom-setup';
import {afterAll,afterEach,beforeEach,expect,test} from 'bun:test';
import React,{act,useState} from 'react';
import type {Root} from 'react-dom/client';
import {useNN} from '../lib/store';
ensureTestDom();
const {createRoot}=await import('react-dom/client');
const {AuthenticatedWorkspace}=await import('./auth-gate');
let root:Root,host:HTMLDivElement;
beforeEach(()=>{ensureTestDom();(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();useNN.getState().reset();delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;});
afterAll(()=>{try{GlobalRegistrator.unregister();}catch{}});
function Content(){const owner=useNN(state=>state.profile?.userId);const [initial]=useState(owner);return <p>{initial}/{owner}</p>;}
test('a new authenticated account cannot mount cached work from the previous profile',async()=>{
  useNN.setState({profile:{userId:'alice'} as any,bootstrapped:true,bootstrapStatus:'ready'});
  await act(async()=>root.render(<AuthenticatedWorkspace owner="alice"><Content/></AuthenticatedWorkspace>));expect(host.textContent).toBe('alice/alice');
  await act(async()=>root.render(<AuthenticatedWorkspace owner="bob"><Content/></AuthenticatedWorkspace>));expect(host.textContent).not.toContain('alice');
  await act(async()=>useNN.setState({profile:{userId:'bob'} as any,bootstrapped:true,bootstrapStatus:'ready'}));expect(host.textContent).toBe('bob/bob');
});
test('an atomic owner switch remounts route-local state and failed bootstrap exposes recovery only',async()=>{
  useNN.setState({profile:{userId:'alice'} as any,bootstrapped:true,bootstrapStatus:'ready'});
  await act(async()=>root.render(<AuthenticatedWorkspace owner="alice"><Content/></AuthenticatedWorkspace>));
  await act(async()=>{useNN.setState({profile:{userId:'bob'} as any});root.render(<AuthenticatedWorkspace owner="bob"><Content/></AuthenticatedWorkspace>);});
  expect(host.textContent).toBe('bob/bob');
  await act(async()=>useNN.setState({profile:null,bootstrapped:false,bootstrapStatus:'error'}));expect(host.textContent).not.toContain('bob/bob');expect(host.querySelector('button')).not.toBeNull();
});
