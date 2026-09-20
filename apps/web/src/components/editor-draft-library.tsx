'use client';
import { useMemo, useState } from 'react';
import { clearEditorDraft, clearInvalidEditorDraft, downloadEditorDraft, listEditorDrafts, type DraftListEntry } from '@/lib/editor-drafts';
import { isNoteDraftValue, isTypeDraftValue } from '@/lib/editor-draft-values';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { useAppNavigation } from './navigation';
import { useDialog } from './dialog';
import { NNBtn, NNCard, NNIcon, NNBadge } from './ui';

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
  return <div className="reomi-page-surface reomi-draft-workspace nn-scroll">
    <header className="reomi-draft-heading"><div><h1>{t('editor.draft.libraryTitle')}</h1><p>{t('editor.draft.libraryHint')}</p></div>
      <NNBtn variant="ghost" icon="sync" ariaLabel={t('editor.draft.refresh')} title={t('editor.draft.refresh')} onClick={() => { setError(''); refresh(n => n + 1); }} />
      {result.entries.length > 0 && <NNBtn variant="primary" icon="plus" onClick={() => nav.push('/editor')}>{t('editor.newCard')}</NNBtn>}
    </header>
    {(result.failed || error) && <p role="alert" className="reomi-draft-error">{error || t('editor.draft.unavailable')}</p>}
    {!result.failed && result.entries.length === 0 && <div className="reomi-draft-empty"><span aria-hidden><NNIcon name="note" size={28} /></span><h2>{t('editor.draft.empty')}</h2><p>{t('editor.draft.emptyHint')}</p><NNBtn variant="primary" icon="plus" onClick={() => nav.push('/editor')}>{t('editor.newCard')}</NNBtn></div>}
    {result.entries.map(entry => {
      const value = entry.record?.value;
      const note = isNoteDraftValue(value) ? value : null;
      const type = isTypeDraftValue(value) ? value : null;
      const firstField = note && [...(note.noteType?.fields ?? [])].sort((a, b) => a.ord - b.ord).map(field => note.fieldValues[field.name]).find(value => value?.trim());
      const label = type?.name || (note ? (note.label || firstField || Object.values(note.fieldValues).find(value => value.trim()))?.replace(/\s+/g, ' ').slice(0, 100) : '') || t('editor.draft.untitled');
      return <NNCard key={`${owner}:${entry.scope.kind}:${entry.scope.entityId}`} className="reomi-draft-card">
        <NNBadge size="xs" tone="neutral">{t(entry.scope.kind === 'type' ? 'noteTypes.pageTitle' : 'cards.panel.title')}</NNBadge>
        <h2 style={{ fontSize: 16, overflowWrap: 'anywhere' }}>{entry.record ? label : t('editor.draft.invalid')}</h2>
        {entry.record && <p style={{ fontSize: 12 }}>{new Date(entry.record.updatedAt).toLocaleString()}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {note && <NNBtn size="sm" variant="primary" icon="edit" onClick={() => {
            if (useNN.getState().profile?.userId !== owner) return;
            nav.push(note.cardId ? `/editor?card=${encodeURIComponent(note.cardId)}` : `/editor?${new URLSearchParams({ deck: note.deckId, noteType: note.noteTypeId })}`);
          }}>{t('editor.draft.openOriginal')}</NNBtn>}
          {type && entry.record && <NNBtn size="sm" variant="primary" icon="edit" onClick={() => {
            if (useNN.getState().profile?.userId === owner) nav.push(entry.scope.entityId === 'new' ? '/note-types?new=1' : `/note-types?edit=${encodeURIComponent(entry.scope.entityId)}`);
          }}>{t('editor.draft.openOriginal')}</NNBtn>}
          {entry.record && <NNBtn size="sm" onClick={() => download(entry)}>{t('editor.draft.download')}</NNBtn>}
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
