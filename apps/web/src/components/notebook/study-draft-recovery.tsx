'use client';
import { useMemo } from 'react';
import { useNN } from '@/lib/store';
import { readEditorDraft } from '@/lib/editor-drafts';
import { isStudyNoteDraft } from '@/lib/study-note-draft';
import { assistantApi, ok } from '@/lib/api';
import { notebookNoteFromApi } from '@/lib/mappers';
import { useT } from '@/lib/i18n';
import { AppLink, useAppNavigation } from '../navigation';
import { WrittenNoteEditor } from './written-note-editor';

/** Creation slots stay recoverable after acknowledgement or source deletion. */
export function StudyDraftRecovery({ slot }: { slot: string }) {
  const owner = useNN(state => state.profile?.userId) ?? '', nav = useAppNavigation(), t = useT();
  const value = useMemo(() => {
    try {
      if (!owner || slot.length > 512) return null;
      const record = readEditorDraft({ ownerId: owner, kind: 'study-note', entityId: slot });
      return isStudyNoteDraft(record?.value) ? record.value : null;
    } catch { return null; }
  }, [owner, slot]);
  if (!value) return <div role="status"><p>{t('editor.draft.unavailable')}</p><AppLink href="/editor?drafts=1">{t('editor.draft.libraryTitle')}</AppLink></div>;
  return <WrittenNoteEditor key={`${owner}:${slot}`} draftSlot={slot} studyOwner={value.owner}
    onClose={() => nav.push('/editor?drafts=1')}
    getCurrent={async id => notebookNoteFromApi(await ok(value.owner?.kind === 'notebook'
      ? await assistantApi.notebooks({ id: value.owner.id }).notes({ noteId: id }).get()
      : await assistantApi.study.notes({ noteId: id }).get()))}
    onSaved={(note, close) => { if (close) nav.push(note.ownerKind === 'notebook' && note.notebookId
      ? `/notebooks/${note.notebookId}?note=${note.id}` : `/library/study?note=${note.id}`); }} />;
}
