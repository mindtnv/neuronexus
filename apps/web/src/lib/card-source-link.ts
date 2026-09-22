import type { CardSourceLink } from './types';
export function cardSourceHref(item: CardSourceLink): string | null {
  if (!item.sourceId) return null;
  const params = new URLSearchParams();
  if (item.locationAvailable !== false) {
    if (item.sourceChunkId) params.set('chunk',item.sourceChunkId);
    if (item.position != null) params.set('pos',String(item.position));
    if (item.page != null) params.set('page',String(item.page));
  }
  return `/library/${item.sourceId}${params.size?`?${params}`:''}`;
}
