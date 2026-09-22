import { NAVIGATION_LIMITS } from './navigation-context';
export type RestorationReason = 'found' | 'nearby' | 'missing' | 'limit' | 'error' | 'cancelled';
export type CollectionPage<T> = { items: T[]; nextCursor: string | null };

/** Rebuild a view using current opaque cursors, never cached rows as authority. */
export async function restoreCollectionPages<T extends { id: string }>(options: {
  initial: CollectionPage<T>; anchors: string[];
  throughId?: string;
  fetchPage: (cursor: string) => Promise<CollectionPage<T>>;
  signal?: AbortSignal; now?: () => number;
  limits?: { pages: number; rows: number; ms: number };
}): Promise<CollectionPage<T> & { reason: RestorationReason; requests: number; error?:unknown }> {
  const { initial, anchors, fetchPage, signal, now = () => performance.now(), limits = { pages: NAVIGATION_LIMITS.pages, rows: NAVIGATION_LIMITS.rows, ms: NAVIGATION_LIMITS.restoreMs } } = options;
  let items = [...initial.items]; let nextCursor = initial.nextCursor; let requests = 0;
  const started = now(); const seen = new Set<string>();
  const finish = (reason: RestorationReason) => ({ items, nextCursor, requests, reason });
  if (!anchors.length) return finish('found');
  while (true) {
    if (signal?.aborted) return finish('cancelled');
    const found=items.some(item=>item.id===anchors[0]);
    if (found&&(!options.throughId||items.some(item=>item.id===options.throughId))) return finish('found');
    if (!nextCursor) return finish(found?'found':items.some(item => anchors.includes(item.id)) ? 'nearby' : 'missing');
    if (requests + 1 >= limits.pages || items.length >= limits.rows || now() - started >= limits.ms || seen.has(nextCursor)) return finish('limit');
    seen.add(nextCursor); requests++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      const stopped = new Promise<'cancelled' | 'limit'>(resolve => {
        abort = () => resolve('cancelled'); signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => resolve('limit'), Math.max(0, limits.ms - (now() - started)));
      });
      const page = await Promise.race([fetchPage(nextCursor), stopped]);
      if (typeof page === 'string') return finish(page);
      if (signal?.aborted) return finish('cancelled');
      if (now() - started >= limits.ms) return finish('limit');
      const byId = new Map(items.map(item => [item.id, item]));
      for (const item of page.items) {
        if (!byId.has(item.id) && byId.size >= limits.rows) { items = [...byId.values()]; return finish('limit'); }
        byId.set(item.id, item);
      }
      items = [...byId.values()]; nextCursor = page.nextCursor;
    } catch (error) { return {...finish(signal?.aborted ? 'cancelled' : 'error'),error}; }
    finally { if (timer !== undefined) clearTimeout(timer); if (abort) signal?.removeEventListener('abort', abort); }
  }
}

/** Revalidate all pages the user already loaded before replacing their view.
 * A failed tail request must leave the previous cached view available for retry. */
export async function refreshLoadedCollection<T extends {id:string}>(
  previous:CollectionPage<T>|undefined,
  fetchPage:(cursor?:string)=>Promise<CollectionPage<T>>,
  unavailableMessage='The full list could not be refreshed.',
):Promise<CollectionPage<T>> {
  const first=await fetchPage();
  const tail=previous?.items.at(-1)?.id;
  if(!tail||!first.nextCursor||first.items.some(item=>item.id===tail))return first;
  const result=await restoreCollectionPages({initial:first,anchors:[tail],fetchPage});
  if(['error','limit','cancelled'].includes(result.reason))throw result.error??new Error(unavailableMessage);
  return {items:result.items,nextCursor:result.nextCursor};
}
