import {ensureTestDom,GlobalRegistrator} from './test-dom-setup';
import {afterAll,afterEach,beforeEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import type {Root} from 'react-dom/client';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {PathnameContext,SearchParamsContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import {AppNavigationProvider} from '../components/navigation';
import {NavigationJournal,NAVIGATION_HISTORY_KEY} from './navigation-context';
import {useNavigationScroll} from './use-navigation-scroll';
import {useNN} from './store';
ensureTestDom();const {createRoot}=await import('react-dom/client');
let root:Root,host:HTMLDivElement;
const router={push(){},replace(){},back(){},forward(){},refresh(){},prefetch(){},hmrRefresh(){},bfcacheId:'test'};
beforeEach(()=>{ensureTestDom();(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();useNN.setState({profile:{userId:'focus-owner'} as any});host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();useNN.getState().reset();delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;});
afterAll(()=>{try{GlobalRegistrator.unregister();}catch{}});
function List({survives}:{survives:boolean}){const position=useNavigationScroll('library','list',{ready:true});return <main><h1>Library heading</h1><div ref={position.ref}>{survives&&<button data-navigation-anchor="nearby">Surviving source</button>}</div></main>;}
async function restore(survives:boolean){
 const journal=new NavigationJournal('focus-owner','/library',null,sessionStorage);
 journal.scroll('library','list',{id:'deleted',nearby:['nearby'],x:0,y:40,offset:0});journal.focus('library','deleted');journal.flush();history.replaceState({[NAVIGATION_HISTORY_KEY]:journal.marker()},'');
 await act(async()=>root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/library"><SearchParamsContext.Provider value={new URLSearchParams()}><AppNavigationProvider><List survives={survives}/></AppNavigationProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
 await act(async()=>new Promise(resolve=>setTimeout(resolve,50)));
}
test('a deleted keyboard target returns focus to a surviving nearby row',async()=>{await restore(true);expect(document.activeElement?.textContent).toBe('Surviving source');});
test('when no old row survives, focus falls back to the collection heading',async()=>{await restore(false);expect(document.activeElement?.textContent).toBe('Library heading');});
