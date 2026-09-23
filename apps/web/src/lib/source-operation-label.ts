export function sourceOperationLabel(item: { status: string; total: number; searchAvailable?: boolean; errorCode?: string | null }, t: (key: string) => string): string | null {
  if (item.total > 0 && item.status === 'indexing') return t(item.searchAvailable === false
    ? 'operations.phases.search_unavailable' : 'operations.phases.search_preparing');
  if (item.total > 0 && item.status === 'error' && item.errorCode === 'index_failed') return t('operations.phases.search_unavailable');
  return null;
}
