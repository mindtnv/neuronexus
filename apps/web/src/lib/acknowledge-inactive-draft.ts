import { clearEditorDraft, draftFingerprint, listEditorDrafts } from './editor-drafts';

/** A late acknowledgement may clear only the submitted revision of its old
 * account. It never publishes content or changes the new account's state. */
export function acknowledgeInactiveDraft(owner: string, requestId: string) {
  try {
    for (const entry of listEditorDrafts(owner)) {
      const value = entry.record?.value as Record<string, any> | undefined;
      const pending = value?.pendingSave;
      if (!entry.record || !value || pending?.owner !== owner || pending.requestId !== requestId) continue;
      const fingerprint = entry.scope.kind === 'note'
        ? draftFingerprint({ fieldValues: value.fieldValues, deckId: value.deckId, noteTypeId: value.noteTypeId,
          tagsText: value.tagsText, acceptedAnswersText: value.acceptedAnswersText, clozeRetainHistoryFor: value.clozeRetainHistoryFor })
        : entry.scope.kind === 'study-note' ? draftFingerprint({ title: value.title, content: value.content })
          : draftFingerprint({ name: value.name, fields: value.fields, templates: value.templates, styling: value.styling });
      if (pending.fingerprint === fingerprint) clearEditorDraft(entry.scope, entry.record.revision);
    }
  } catch { /* Storage denial retains recovery data instead of discarding it. */ }
}
