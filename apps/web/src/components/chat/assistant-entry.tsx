'use client';

import React, { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { AssistantView, AssistantThreads } from './assistant-view';
import { useAssistant, useAssistantSnapshot } from './assistant-provider';
import { NNBtn, NNSkeleton } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { raiseToast } from '@/components/toasts';
import type { ChatPanelProps } from './chat-panel';

export function AssistantPageEntry() {
  const a = useAssistant(), snapshot = useAssistantSnapshot(), params = useSearchParams(), t = useT();
  const thread = params.get('thread');
  const current = snapshot.selectedKey ? snapshot.sessions[snapshot.selectedKey] : undefined;
  useEffect(() => {
    a.controller.setPresentation('page'); a.setFilter({});
    return () => {
      const current = a.controller.getSnapshot();
      if (current.presentation !== 'page') return;
      const session = current.selectedKey ? current.sessions[current.selectedKey] : undefined;
      a.controller.setPresentation(session && (session.messages.length || session.draft || session.pins.length) ? 'floating' : 'hidden');
    };
  }, [a.controller,a.setFilter]);
  useEffect(() => { if (thread && snapshot.ownerId) void a.controller.open(thread); }, [thread,a.controller,snapshot.ownerId]);
  if (!snapshot.ownerId) return <div className="reomi-assistant-page-entry" aria-busy="true"><NNSkeleton height={60}/><NNSkeleton height={180}/></div>;
  const toolbar = <div className="reomi-assistant-page-toolbar"><strong className="reomi-assistant-page-title">{current?.conversation?.title ?? t('chat.threads.newThread')}</strong><NNBtn size="sm" variant="ghost" icon="chat"
    onClick={() => a.controller.setPresentation(snapshot.presentation === 'page' ? 'floating' : 'page')}>{t(snapshot.presentation === 'page' ? 'assistant.float' : 'assistant.expand')}</NNBtn></div>;
  return <div className="reomi-assistant-page-entry">
    {snapshot.presentation === 'page' ? <AssistantView page header={toolbar}/> : <>{toolbar}<AssistantThreads compact onSelected={() => a.controller.setPresentation('page')}/></>}
  </div>;
}

export function NotebookAssistantEntry(props: ChatPanelProps) {
  const a = useAssistant(), snapshot = useAssistantSnapshot(), t = useT();
  const consumed = useRef<string | null>(null);
  const notified = useRef<string | null>(null);
  const notebookId = props.notebookId;
  const ask = (prefill = '', fresh = false) => {
    if (!notebookId) return;
    void a.ask({ ref: { kind:'notebook',id:notebookId,...(props.sourceIds !== undefined ? {sourceIds:props.sourceIds}: {}) }, prefill, newConversation:fresh })
      .catch(() => raiseToast({ kind:'error',title:t('assistant.contextFailed') }));
  };
  useEffect(() => { a.setFilter(notebookId ? { kind:'notebook',id:notebookId } : {}); }, [notebookId,a.setFilter]);
  useEffect(() => {
    if (!props.activeThreadId || consumed.current === props.activeThreadId) return;
    consumed.current = props.activeThreadId; void a.controller.open(props.activeThreadId); a.controller.setPresentation('floating');
  }, [props.activeThreadId,a.controller]);
  useEffect(() => {
    const current = snapshot.selectedKey ? snapshot.sessions[snapshot.selectedKey] : undefined;
    const key=`${notebookId}:${current?.conversationId}`;
    if (current?.conversationId && current.conversationId!==props.activeThreadId && notified.current!==key && current.pins.some(s => s.ref.kind==='notebook' && s.ref.id===notebookId)) {
      notified.current=key;props.onThreadChange?.(current.conversationId);
    }
  }, [snapshot.selectedKey,snapshot.sessions,notebookId,props.activeThreadId,props.onThreadChange]);
  const askRef = useRef(ask); askRef.current=ask;
  useEffect(() => {
    if (!props.composerPrefillRef) return;
    props.composerPrefillRef.current={ prefill: text => askRef.current(text) };
    return () => { if(props.composerPrefillRef)props.composerPrefillRef.current=null; };
  }, [props.composerPrefillRef]);
  return <div className="reomi-assistant-notebook-entry">
    <div className="reomi-assistant-notebook-actions"><p>{t('assistant.notebookEntry')}</p>
      <NNBtn variant="primary" icon="chat" onClick={() => ask()}>{t('assistant.askNotebook')}</NNBtn>
      <NNBtn variant="ghost" icon="plus" onClick={() => ask('',true)}>{t('chat.threads.newThread')}</NNBtn>
    </div>
    {props.suggestedQuestions?.length ? <div className="reomi-assistant-notebook-suggestions">{props.suggestedQuestions.slice(0,4).map(question => <NNBtn size="sm" key={question} variant="soft" onClick={() => ask(question)}>{question}</NNBtn>)}</div> : null}
    <AssistantThreads compact onSelected={() => a.controller.setPresentation('floating')}/>
  </div>;
}
