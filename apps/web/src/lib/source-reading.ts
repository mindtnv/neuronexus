import type { Source } from './types';

/** Reading original bytes / parsed text does not require AI indexing to succeed.
 * The file and chunk endpoints remain responsible for ownership and availability. */
export function canReadSource(source: Pick<Source, 'kind' | 'status' | 'total'>, mode: 'pdf' | 'text'): boolean {
  if (source.status === 'deleting') return false;
  return mode === 'pdf'
    ? source.kind === 'pdf'
    : source.status === 'ready' || source.total > 0;
}
