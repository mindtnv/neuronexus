import React from 'react';
import type { LibraryItem } from '@/lib/types';

export function LibraryIngestIndicator({ item, t }: { item: Pick<LibraryItem, 'status' | 'indexed' | 'total'>; t: (key: string) => string }) {
  if (!['pending', 'parsing', 'indexing'].includes(item.status)) return null;
  const progress = item.status === 'indexing' && item.total > 0 ? Math.min(100, Math.max(0, item.indexed / item.total * 100)) : null;
  return <div className="reomi-library-ingest" data-stage={item.status} role="status" aria-label={t(`library.status.${item.status}`)}>
    <div className="reomi-library-ingest-scan" aria-hidden="true"><i/><i/><i/></div>
    <div className="reomi-library-ingest-label"><span className="reomi-library-ingest-orbit" aria-hidden="true"/>
      <span>{t(`library.status.${item.status}`)}{progress !== null && <small>{item.indexed} / {item.total}</small>}</span>
    </div>
    {progress !== null && <div className="reomi-library-ingest-progress" role="progressbar" aria-label={t('library.status.indexing')} aria-valuemin={0} aria-valuemax={item.total} aria-valuenow={Math.min(item.indexed, item.total)}><span style={{ width: `${progress}%` }}/></div>}
  </div>;
}
