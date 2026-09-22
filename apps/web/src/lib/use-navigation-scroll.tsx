'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigationWorkspace } from '@/components/navigation';
import { NAVIGATION_LIMITS, type ScrollAnchor } from './navigation-context';
import type { RestorationReason } from './navigation-restore';
import { useT } from './i18n';
import { NNBtn } from '@/components/ui';

function anchors(node: HTMLElement) { return [...node.querySelectorAll<HTMLElement>('[data-navigation-anchor]')]; }
export function captureNavigationAnchor(node: HTMLElement, fractional = false): ScrollAnchor {
  const top = node.getBoundingClientRect().top;
  const rows = anchors(node);
  const index = rows.findIndex(row => row.getBoundingClientRect().bottom > top + 1);
  const row = rows[index];
  const end=rows.filter(item=>item.getBoundingClientRect().top<node.getBoundingClientRect().bottom).at(-1);
  return { x: Math.max(0,node.scrollLeft), y: Math.max(0,node.scrollTop), ...(row ? {
    id: row.dataset.navigationAnchor, offset: row.getBoundingClientRect().top - top,
    ...(end?.dataset.navigationAnchor?{endId:end.dataset.navigationAnchor}:{}),
    ...(fractional && row.getBoundingClientRect().height > 0 ? {fraction:Math.min(1,Math.max(0,(top-row.getBoundingClientRect().top)/row.getBoundingClientRect().height))} : {}),
    nearby: [rows[index-1],rows[index+1]].flatMap(item=>item?.dataset.navigationAnchor ? [item.dataset.navigationAnchor] : []),
  } : {}) };
}
export function applyNavigationAnchor(node: HTMLElement, anchor: ScrollAnchor): boolean {
  const rows = anchors(node);
  const row = [anchor.id,...(anchor.nearby??[])].map(id=>rows.find(item=>item.dataset.navigationAnchor===id)).find(Boolean);
  if (anchor.id && !row) return false;
  node.scrollLeft = anchor.x;
  const offset = row && anchor.fraction != null && anchor.fraction > 0 ? -anchor.fraction * row.getBoundingClientRect().height : anchor.offset??0;
  node.scrollTop = row ? Math.max(0,node.scrollTop + row.getBoundingClientRect().top - node.getBoundingClientRect().top - offset) : anchor.y;
  return true;
}

export function useNavigationScroll(scope: string, name: string, options: {
  ready: boolean; queryKey?: string;
  fractional?: boolean;
  restoreRows?: (anchor: ScrollAnchor, signal: AbortSignal) => Promise<RestorationReason>;
}) {
  const context = useNavigationWorkspace();
  const entryId = context?.entry?.id; const revision = context?.revision ?? 0;
  const [node,setNode] = useState<HTMLElement | null>(null);
  const [retry,setRetry] = useState(0);
  const [failure,setFailure] = useState(false);
  const saved = useMemo(()=>{
    const anchor=context?.entry?.views[scope]?.scrolls[name];
    if(anchor?.queryKey!==undefined&&anchor.queryKey!==options.queryKey)return undefined;
    return anchor ? {...anchor,nearby:anchor.nearby?.slice()} : undefined;
  },[entryId,revision,scope,name,options.queryKey]);
  const restoreRows = useRef(options.restoreRows); restoreRows.current=options.restoreRows;
  const run = useRef<AbortController | null>(null);
  const cancelled = useRef(false);
  const settled = useRef(false);
  const previousEntry = useRef({entryId,revision});
  const lastQuery = useRef({entryId,key:options.queryKey});
  const capture = useCallback(()=>{
    if (!node || (!options.ready&&!cancelled.current) || (run.current && !run.current.signal.aborted)) return;
    context?.journal?.scroll(scope,name,{...captureNavigationAnchor(node,options.fractional),queryKey:options.queryKey},entryId);
  },[node,context?.journal,scope,name,entryId,options.fractional,options.queryKey,options.ready]);
  useEffect(()=>context?.capture(capture),[context?.capture,capture]);
  useLayoutEffect(()=>{
    if(previousEntry.current.entryId===entryId&&previousEntry.current.revision!==revision&&node){node.scrollTop=0;node.scrollLeft=0;}
    previousEntry.current={entryId,revision};
    cancelled.current=false;settled.current=false;setFailure(false);
    return ()=>{run.current?.abort();run.current=null;};
  },[entryId,revision,retry,scope,name]);
  useLayoutEffect(()=>{
    if(lastQuery.current.entryId===entryId && lastQuery.current.key!==options.queryKey) { cancelled.current=true;run.current?.abort();run.current=null; }
    lastQuery.current={entryId,key:options.queryKey};
  },[options.queryKey,entryId]);
  useEffect(()=>{
    if (!node) return;
    const cancel=(event:Event)=>{
      if (event instanceof KeyboardEvent && !['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)) return;
      cancelled.current=true;run.current?.abort();run.current=null;
    };
    const focus=(event:FocusEvent)=>{
      const target=event.target as HTMLElement;
      const row=target.closest<HTMLElement>('[data-navigation-anchor]');
      if(row?.dataset.navigationAnchor)context?.journal?.focus(scope,row.dataset.navigationAnchor,entryId);
    };
    node.addEventListener('scroll',capture,{passive:true}); node.addEventListener('focusin',focus);
    for(const type of ['wheel','touchstart','pointerdown','keydown']) node.addEventListener(type,cancel,{passive:true});
    return ()=>{node.removeEventListener('scroll',capture);node.removeEventListener('focusin',focus);for(const type of ['wheel','touchstart','pointerdown','keydown'])node.removeEventListener(type,cancel);};
  },[node,capture,context?.journal,entryId,scope]);
  useLayoutEffect(()=>{
    if(!node || !saved || !options.ready || cancelled.current || settled.current) return;
    const controller=new AbortController();run.current=controller;
    let frame=0;const start=performance.now();
    void(async()=>{
      const currentAnchors=anchors(node);
      const found=(!saved.id || currentAnchors.some(row=>row.dataset.navigationAnchor===saved.id)) && (!saved.endId||currentAnchors.some(row=>row.dataset.navigationAnchor===saved.endId)) && applyNavigationAnchor(node,saved);
      const result=!found&&restoreRows.current ? await restoreRows.current(saved,controller.signal) : found?'found':'missing';
      if(controller.signal.aborted)return;
      const restoreFocus=()=>{
        const focusId=context?.entry?.views[scope]?.focus;
        if(!context?.restored || document.activeElement!==document.body || !focusId)return;
        const rows=anchors(node);
        const target=rows.find(row=>row.dataset.navigationAnchor===focusId)
          ?? [saved.id,...(saved.nearby??[])].map(id=>rows.find(row=>row.dataset.navigationAnchor===id)).find(Boolean);
        const control=target?.matches('button,a,[tabindex]')?target:target?.querySelector<HTMLElement>('button,a,[tabindex]');
        if(control){control.focus({preventScroll:true});return;}
        const heading=node.closest('main')?.querySelector<HTMLElement>('h1,h2,[role="heading"]')??node;
        if(!heading.hasAttribute('tabindex'))heading.tabIndex=-1;
        heading.focus({preventScroll:true});
      };
      const finish=()=>{
        if(controller.signal.aborted)return;
        if(applyNavigationAnchor(node,saved)) {
          run.current=null;settled.current=true;
          if(result==='nearby')setFailure(true);
          restoreFocus();
          return;
        }
        if((result==='found'||result==='nearby')&&performance.now()-start<NAVIGATION_LIMITS.restoreMs) {frame=requestAnimationFrame(finish);return;}
        node.scrollTop=0;node.scrollLeft=saved.x;run.current=null;settled.current=true;setFailure(true);
        restoreFocus();
      };
      frame=requestAnimationFrame(finish);
    })();
    return ()=>{controller.abort();cancelAnimationFrame(frame);if(run.current===controller)run.current=null;};
  },[node,saved,options.ready,entryId,revision,retry]);
  const retryRestoration=useCallback(()=>{cancelled.current=false;setRetry(n=>n+1);},[]);
  const isCancelled=useCallback(()=>cancelled.current,[]);
  const beginExplicitJump=useCallback(()=>{run.current?.abort();run.current=null;settled.current=true;cancelled.current=false;},[]);
  return {ref:setNode,failure,retry:retryRestoration,capture,isCancelled,beginExplicitJump};
}

export function NavigationRestoreNotice({failure,retry}:{failure:boolean;retry:()=>void}) {
  const t=useT();
  return failure?<div className="nn-navigation-notice" role="status"><span>{t('navigation.positionUnavailable')}</span><NNBtn size="sm" variant="ghost" onClick={retry}>{t('navigation.retry')}</NNBtn></div>:null;
}
