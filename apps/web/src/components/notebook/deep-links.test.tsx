import { ensureTestDom, GlobalRegistrator } from '../../lib/test-dom-setup';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { DialogProvider } from '../dialog';
import type { NotebookArtifact, NotebookNote } from '../../lib/types';

ensureTestDom();
const { createRoot } = await import('react-dom/client');
const { NotesPanel } = await import('./notes-panel');
const { StudioPanel } = await import('./studio-panel');
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  ensureTestDom(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT; });
afterAll(() => { try { GlobalRegistrator.unregister(); } catch {} });
const t = (key: string) => key;
const note = { id: 'n', title: 'Deep note', content: 'The requested note body', kind: 'manual', pinned: false, notebookId: 'book', createdAt: '2026-01-01', updatedAt: '2026-01-01' } as NotebookNote;
const artifact = { id: 'a', title: 'Deep artifact', type: 'summary', status: 'ready', contentMd: 'The requested artifact body', sourceIds: [], notebookId: 'book', errorCode: null, model: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' } as NotebookArtifact;

test('a requested written note opens after asynchronous listing', async () => {
  let consumed = false;
  await act(async () => root.render(<DialogProvider><NotesPanel notebookId="book" initialNoteId="n" onInitialOpen={() => { consumed = true; }}
    listNotes={async () => [note]} createNote={async () => note} patchNote={async () => note} deleteNote={async () => {}}
    onPrefillChat={() => {}} t={t} /></DialogProvider>));
  expect(host.textContent).toContain('The requested note body');
  expect(consumed).toBe(true);
});

test('a requested artifact opens its full reader rather than only the studio list', async () => {
  let fetched = '', consumed = false;
  await act(async () => root.render(<DialogProvider><StudioPanel notebookId="book" initialArtifactId="a" onInitialOpen={() => { consumed = true; }}
    scopeIds={[]} chatEnabled={false} listArtifacts={async () => [artifact]} getArtifact={async (_nb,id) => { fetched = id; return artifact; }}
    createArtifact={async () => artifact} deleteArtifact={async () => {}} regenerateArtifact={async () => artifact}
    submitQuizAttempt={async () => { throw new Error('not used'); }} listQuizAttempts={async () => []}
    onOpenCitation={() => {}} onSaveToNote={() => {}} onPrefillChat={() => {}} t={t} /></DialogProvider>));
  expect(fetched).toBe('a');
  expect(document.body.textContent).toContain('The requested artifact body');
  expect(consumed).toBe(true);
});

test('a late artifact response cannot replace a more recently opened object', async () => {
  const second = { ...artifact, id: 'b', title: 'Second', contentMd: 'Second artifact body' };
  let resolveOld!: (value: NotebookArtifact) => void;
  const pending = new Promise<NotebookArtifact>(resolve => { resolveOld = resolve; });
  const props = { notebookId: 'book', scopeIds: [], chatEnabled: false,
    listArtifacts: async () => [artifact, second], getArtifact: async (_nb: string,id: string) => id === 'a' ? pending : second,
    createArtifact: async () => artifact, deleteArtifact: async () => {}, regenerateArtifact: async () => artifact,
    submitQuizAttempt: async () => { throw new Error('unused'); }, listQuizAttempts: async () => [],
    onOpenCitation: () => {}, onSaveToNote: () => {}, onPrefillChat: () => {}, t };
  await act(async () => root.render(<DialogProvider><StudioPanel {...props} initialArtifactId="a" /></DialogProvider>));
  await act(async () => root.render(<DialogProvider><StudioPanel {...props} initialArtifactId="b" /></DialogProvider>));
  await act(async () => resolveOld(artifact));
  expect(document.body.textContent).toContain('Second artifact body');
  expect(document.body.textContent).not.toContain('The requested artifact body');
});

test('a notebook note outside the first list page is loaded directly by its durable id',async()=>{
  let requested='',consumed=false;
  await act(async()=>root.render(<DialogProvider><NotesPanel notebookId="book" initialNoteId="deep-note" onInitialOpen={()=>{consumed=true;}}
    listNotes={async()=>[]} getNote={async(parent,id)=>{requested=`${parent}:${id}`;return {...note,id};}}
    createNote={async()=>note} patchNote={async()=>note} deleteNote={async()=>{}} onPrefillChat={()=>{}} t={t}/></DialogProvider>));
  expect(requested).toBe('book:deep-note');expect(host.textContent).toContain('The requested note body');expect(consumed).toBe(true);
});

test('a late direct-note response cannot replace a newer requested note',async()=>{
  let resolve!:(note:NotebookNote)=>void;
  const pending=new Promise<NotebookNote>(done=>{resolve=done;});
  const ready={...note,id:'ready',content:'The newer requested note'};
  const listNotes=async()=>[ready],getNote=async()=>pending;
  const props={notebookId:'book',listNotes,getNote,createNote:async()=>note,patchNote:async()=>note,deleteNote:async()=>{},onPrefillChat:()=>{},t};
  await act(async()=>root.render(<DialogProvider><NotesPanel {...props} initialNoteId="late"/></DialogProvider>));
  await act(async()=>root.render(<DialogProvider><NotesPanel {...props} initialNoteId="ready"/></DialogProvider>));
  await act(async()=>{resolve({...note,id:'late',content:'Late obsolete note'});await pending;});
  expect(host.textContent).toContain('The newer requested note');expect(host.textContent).not.toContain('Late obsolete note');
});

test('refreshing the first list page preserves an open deep-linked note without crossing owners', async () => {
  const refreshRef = { current: null as (() => void) | null };
  const props = { notebookId: 'book', initialNoteId: 'deep-note', refreshRef,
    listNotes: async () => ({ items: [], nextOffset: 50 }),
    getNote: async () => ({ ...note, id: 'deep-note' }),
    createNote: async () => note, patchNote: async () => note, deleteNote: async () => {}, onPrefillChat: () => {}, t };
  await act(async () => root.render(<DialogProvider><NotesPanel {...props} /></DialogProvider>));
  expect(host.textContent).toContain('The requested note body');
  await act(async () => { refreshRef.current?.(); });
  expect(host.textContent).toContain('The requested note body');
  await act(async () => root.render(<DialogProvider><NotesPanel {...props} notebookId="different-owner" initialNoteId={null} /></DialogProvider>));
  expect(host.textContent).not.toContain('The requested note body');
});
