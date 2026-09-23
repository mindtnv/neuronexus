import React from 'react';
import type { LibraryItem } from '@/lib/types';
import { sourceOperationLabel } from '@/lib/source-operation-label';

export function LibraryIngestIndicator({ item, t }: { item: Pick<LibraryItem, 'status' | 'indexed' | 'total' | 'searchAvailable'>; t: (key: string) => string }) {
  if (!['pending', 'parsing', 'indexing'].includes(item.status)) return null;
  const parked = item.status === 'indexing' && item.searchAvailable === false;
  const label = sourceOperationLabel(item, t) ?? t(`library.status.${item.status}`);
  const progress = !parked && item.status === 'indexing' && item.total > 0 ? Math.min(100, Math.max(0, item.indexed / item.total * 100)) : null;
  return <div className="reomi-library-ingest" data-stage={parked ? 'parked' : item.status} role="status" aria-label={label}>
    {!parked && <div className="reomi-library-ingest-scan" aria-hidden="true"><i/><i/><i/></div>}
    <div className="reomi-library-ingest-label">{!parked && <span className="reomi-library-ingest-orbit" aria-hidden="true"/>}
      <span>{label}{progress !== null && <small>{item.indexed} / {item.total}</small>}</span>
    </div>
    {progress !== null && <div className="reomi-library-ingest-progress" role="progressbar" aria-label={t('library.status.indexing')} aria-valuemin={0} aria-valuemax={item.total} aria-valuenow={Math.min(item.indexed, item.total)}><span style={{ width: `${progress}%` }}/></div>}
  </div>;
}
