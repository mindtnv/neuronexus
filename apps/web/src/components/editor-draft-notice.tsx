'use client';
import { useState } from 'react';
import { AppLink } from './navigation';
import { NNBtn } from './ui';
import { useT } from '@/lib/i18n';

export function EditorDraftNotice({ draft, stale = false }: { draft: {
  pending: { updatedAt: number } | null; status: string; dirty: boolean;
  restore: () => void; discard: () => void; download: () => boolean;
}; stale?: boolean }) {
  const t = useT();
  const [downloadError, setDownloadError] = useState(false);
  if (draft.pending) return <div role="status" style={{ padding: 12, marginBottom: 16, border: '1px solid var(--border)', borderRadius: 10 }}>
    <p>{t('editor.draft.found', { date: new Date(draft.pending.updatedAt).toLocaleString() })}</p>
    {stale && <p>{t('editor.draft.stale')}</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <NNBtn variant="primary" onClick={draft.restore}>{t('editor.draft.restore')}</NNBtn>
      <NNBtn variant="ghost" onClick={draft.discard}>{t('editor.draft.discard')}</NNBtn>
      <AppLink href="/editor?drafts=1">{t('editor.draft.libraryTitle')}</AppLink>
    </div>
  </div>;
  if (draft.status === 'idle') return null;
  const failed = !['saved', 'saving'].includes(draft.status);
  return <div role={failed ? 'alert' : 'status'} style={{ fontSize: 12, marginBottom: 12, color: failed ? 'var(--rose-400)' : 'var(--text-dim)' }}>
    {t(`editor.draft.${draft.status}`)}
    {failed && <NNBtn size="sm" variant="ghost" onClick={() => setDownloadError(!draft.download())}>{t('editor.draft.download')}</NNBtn>}
    {draft.status === 'capacity' && <AppLink href="/editor?drafts=1" target="_blank" rel="noopener noreferrer">{t('editor.draft.manageInNewTab')}</AppLink>}
    {failed && downloadError && <p>{t('editor.draft.downloadFailed')}</p>}
    {draft.status === 'invalid' && <NNBtn size="sm" variant="ghost" onClick={draft.discard}>{t('editor.draft.discard')}</NNBtn>}
  </div>;
}
