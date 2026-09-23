'use client';
import { useCallback, useEffect, useRef } from 'react';
import { assistantApi, ok } from '@/lib/api';
import { notebookNoteFromApi } from '@/lib/mappers';
import { useT } from '@/lib/i18n';
import type { CreateNoteInput } from '@/lib/store';
import { NotesPanel } from './notes-panel';
import { askAssistant } from '../chat/assistant-provider';

export function SourceNotesPanel({ sourceId, initialNoteId, initialCreate = false, unavailable = false }: { sourceId?: string; initialNoteId?: string; initialCreate?: boolean; unavailable?: boolean }) {
  const t = useT();
  const refreshRef = useRef<(() => void) | null>(null);
  const listNotes = useCallback(async (_scope: string, q?: string, offset?: number) => {
    const data = sourceId
      ? await ok(await assistantApi.sources({ id: sourceId }).notes.get({ query: { q, offset } }))
      : await ok(await assistantApi.study.notes.get({ query: { q, offset, unavailable: unavailable ? 'true' : 'false' } }));
    const items = data.items.map(notebookNoteFromApi);
    if (!sourceId && initialNoteId && !q && !offset && !items.some(item => item.id === initialNoteId)) {
      const requested = await ok(await assistantApi.study.notes({ noteId: initialNoteId }).get());
      items.unshift(notebookNoteFromApi(requested));
    }
    return { items, nextOffset: data.nextOffset };
  }, [sourceId, initialNoteId, unavailable]);
  const createNote = useCallback(async (_scope: string, input: CreateNoteInput) => {
    if (!sourceId) throw new Error('source_required');
    return notebookNoteFromApi(await ok(await assistantApi.sources({ id: sourceId }).notes.post(input)));
  }, [sourceId]);
  const getNote = useCallback(async (_scope: string, noteId: string) => {
    const note = notebookNoteFromApi(await ok(await assistantApi.study.notes({noteId}).get()));
    if (sourceId && (note.sourceId ?? note.sourceOriginId) !== sourceId) throw Object.assign(new Error('note_unavailable'), {status:404});
    return note;
  }, [sourceId]);
  const patchNote = useCallback(async (_scope: string, noteId: string, patch: { title?: string; content?: string; pinned?: boolean }) =>
    notebookNoteFromApi(await ok(await assistantApi.study.notes({ noteId }).patch(patch))), []);
  const deleteNote = useCallback(async (_scope: string, noteId: string) => { await ok(await assistantApi.study.notes({ noteId }).delete()); }, []);
  useEffect(() => {
    const refresh = () => refreshRef.current?.();
    window.addEventListener('nn:knowledge-changed', refresh);
    return () => window.removeEventListener('nn:knowledge-changed', refresh);
  }, []);
  return <NotesPanel studyScope={sourceId ? { kind: 'source', id: sourceId } : { kind: 'saved' }} allowCreate={Boolean(sourceId)}
    initialNoteId={initialNoteId} initialCreate={initialCreate} listNotes={listNotes} getNote={getNote} createNote={createNote} patchNote={patchNote} deleteNote={deleteNote} refreshRef={refreshRef}
    onPrefillChat={(prefill, noteId) => { if (noteId) askAssistant({ ref: { kind: 'written_note', id: noteId }, prefill }); }} t={t} />;
}
