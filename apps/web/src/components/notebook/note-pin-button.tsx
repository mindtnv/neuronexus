'use client';
import { useSmallAction } from '@/lib/use-small-action';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { notebookNoteFromApi } from '@/lib/mappers';
import type { NotebookNote } from '@/lib/types';
import { SaveFeedback } from '../save-feedback';
import { NNBtn } from '../ui';

export function NotePinButton({ note, onUpdated, readCurrent }: { note: NotebookNote; onUpdated: (note: NotebookNote) => void; readCurrent?: () => Promise<NotebookNote> }) {
  const owner = useNN(state => state.profile?.userId) ?? '', action = useSmallAction(owner), t = useT();
  const accept = (result: Awaited<ReturnType<typeof action.run>>) => {
    if (result?.response.result && useNN.getState().profile?.userId === owner) onUpdated(notebookNoteFromApi(result.response.result));
  };
  return <span className="nn-note-pin-action">
    <NNBtn variant="ghost" size="sm" icon="pin" active={note.pinned} disabled={action.busy || action.uncertain || action.snapshot.status === 'conflict'}
      ariaLabel={t(note.pinned ? 'notebooks.notes.unpin' : 'notebooks.notes.pin')} title={t(note.pinned ? 'notebooks.notes.unpin' : 'notebooks.notes.pin')}
      onClick={() => { void action.run(`/study-notes/${note.id}`, { expectedRevision: note.metadataRevision ?? 0, patch: { pinned: !note.pinned } }).then(accept); }} />
    <SaveFeedback status={action.snapshot.status} errorCode={action.snapshot.error} onRetry={() => { void action.retry().then(accept); }} />
    {action.snapshot.status === 'conflict' && readCurrent && <NNBtn size="sm" onClick={() => {
      void readCurrent().then(row => { if (useNN.getState().profile?.userId === owner) { onUpdated(row); action.controller.resolveConflict(); } }).catch(() => {});
    }}>{t('actionsRecovery.current')}</NNBtn>}
  </span>;
}
