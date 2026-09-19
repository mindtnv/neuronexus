'use client';
import { useMemo, useState } from 'react';
import { clearEditorDraft, clearInvalidEditorDraft, downloadEditorDraft, listEditorDrafts, type DraftListEntry } from '@/lib/editor-drafts';
import { isNoteDraftValue, isTypeDraftValue } from '@/lib/editor-draft-values';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { useAppNavigation } from './navigation';
import { useDialog } from './dialog';
import { NNBtn, NNCard } from './ui';

export function EditorDraftLibrary() {
  const owner = useNN(state => state.profile?.userId) ?? '';
  const t = useT(); const nav = useAppNavigation(); const { confirm } = useDialog();
  const [revision, refresh] = useState(0); const [error, setError] = useState('');
  const result = useMemo(() => {
    try { return { entries: listEditorDrafts(owner), failed: false }; }
    catch { return { entries: [], failed: true }; }
  }, [owner, revision]);
  const remove = async (entry: DraftListEntry) => {
    if (!(await confirm({ title: t('editor.draft.removeConfirm'), danger: true })) || useNN.getState().profile?.userId !== owner) return;
    try {
      if (entry.record) {
        if (!clearEditorDraft(entry.scope, entry.record.revision)) setError(t('editor.draft.changed'));
      } else clearInvalidEditorDraft(entry.scope);
    } catch { setError(t('editor.draft.unavailable')); }
    refresh(n => n + 1);
  };
  const download = (entry: DraftListEntry) => {
    if (!entry.record || useNN.getState().profile?.userId !== owner) return;
    try { downloadEditorDraft(entry.record.value, entry.scope.kind); }
    catch { setError(t('editor.draft.downloadFailed')); }

  };
  return <div style={{ padding: 24, maxWidth: 850, margin: '0 auto', width: '100%', boxSizing: 'border-box', flex: 1, minHeight: 0, overflow: 'auto' }}>
    <h1>{t('editor.draft.libraryTitle')}</h1><p>{t('editor.draft.libraryHint')}</p>
    <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
      <NNBtn onClick={() => nav.push('/editor')}>{t('editor.newCard')}</NNBtn>
      <NNBtn variant="ghost" onClick={() => { setError(''); refresh(n => n + 1); }}>{t('editor.draft.refresh')}</NNBtn>
    </div>
    {(result.failed || error) && <p role="alert">{error || t('editor.draft.unavailable')}</p>}
    {!result.failed && result.entries.length === 0 && <p>{t('editor.draft.empty')}</p>}
    {result.entries.map(entry => {
      const value = entry.record?.value;
      const note = isNoteDraftValue(value) ? value : null;
      const type = isTypeDraftValue(value) ? value : null;
      const firstField = note && [...(note.noteType?.fields ?? [])].sort((a, b) => a.ord - b.ord).map(field => note.fieldValues[field.name]).find(value => value?.trim());
      const label = type?.name || (note ? (note.label || firstField || Object.values(note.fieldValues).find(value => value.trim()))?.replace(/\s+/g, ' ').slice(0, 100) : '') || t('editor.draft.untitled');
      return <NNCard key={`${owner}:${entry.scope.kind}:${entry.scope.entityId}`} style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, overflowWrap: 'anywhere' }}>{entry.record ? label : t('editor.draft.invalid')}</h2>
        {entry.record && <p style={{ fontSize: 12 }}>{new Date(entry.record.updatedAt).toLocaleString()}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {entry.record && <NNBtn size="sm" onClick={() => download(entry)}>{t('editor.draft.download')}</NNBtn>}
          {note?.cardId && <NNBtn size="sm" onClick={() => nav.push(`/editor?card=${encodeURIComponent(note.cardId!)}`)}>{t('editor.draft.openOriginal')}</NNBtn>}
          {entry.scope.kind === 'type' && entry.scope.entityId !== 'new' && entry.record && <NNBtn size="sm" onClick={() => nav.push(`/note-types?edit=${encodeURIComponent(entry.scope.entityId)}`)}>{t('editor.draft.openOriginal')}</NNBtn>}
          <NNBtn size="sm" variant="danger" onClick={() => void remove(entry)}>{t('editor.draft.discard')}</NNBtn>
        </div>
        {(note || type) && <details style={{ marginTop: 12 }}><summary>{t('editor.draft.showText')}</summary>
          {note && Object.entries(note.fieldValues).map(([name, text]) => <label key={name} style={{ display: 'block', marginTop: 12 }}>{name}<textarea readOnly aria-label={name} value={text} style={{ width: '100%', minHeight: 100, background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, boxSizing: 'border-box' }} /></label>)}
          {type && <>
            <p>{type.fields.map(field => field.name).join(' · ')}</p>
            {type.templates.map((template, index) => <div key={index}><h3>{template.name}</h3>
              <textarea readOnly aria-label={`${template.name} — ${t('noteTypes.preview.front')}`} value={template.frontTemplate} style={{ width: '100%', minHeight: 100, background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, boxSizing: 'border-box' }} />
              <textarea readOnly aria-label={`${template.name} — ${t('noteTypes.preview.back')}`} value={template.backTemplate} style={{ width: '100%', minHeight: 100, background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, boxSizing: 'border-box' }} />
            </div>)}
          </>}
        </details>}
      </NNCard>;
    })}
  </div>;
}
