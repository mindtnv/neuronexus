import { expect, test } from 'bun:test';
import { OperationObserver } from './operation-observer';
import type { OperationsFeed, OperationItem } from '@neuronexus/shared';

const row: OperationItem = { id: 'book', runId: 'run', kind: 'source', title: 'Book', artifactType: null,
  phase: 'parsing', canRead: false, canSearch: false, progress: null, startedAt: null, finishedAt: null,
  retry: { allowed: false, reason: 'not_failed', needsDefaults: false }, destination: { kind: 'source', id: 'book' } };
function data(active = true): OperationsFeed {
  return { active: { items: active ? [row] : [], total: active ? 1 : 0, nextCursor: null },
    attention: { items: [], total: 0, nextCursor: null },
    recent: { items: active ? [] : [{ ...row, phase: 'ready' }], total: active ? 0 : 1, nextCursor: null }, serverTime: new Date().toISOString() };
}
test('route subscribers share one request; failure preserves last known rows', async () => {
  let calls = 0;
  let response = Promise.withResolvers<OperationsFeed>();
  const observer = new OperationObserver(async () => { calls++; return response.promise; });
  const remove = observer.subscribe(() => {});
  const a = observer.refresh();
  const b = observer.refresh();
  expect(calls).toBe(1);
  response.resolve(data());
  await Promise.all([a, b]);
  remove(); // navigation removes a screen, not the shell observer
  expect(observer.getSnapshot().feed?.active.items).toHaveLength(1);
  response = Promise.withResolvers();
  const failed = observer.refresh();
  response.reject(new Error('offline'));
  await failed;
  expect(observer.getSnapshot().status).toBe('stale');
  expect(observer.getSnapshot().feed?.active.items[0]?.id).toBe('book');
  observer.dispose();
});
test('account teardown ignores a late response and announces only transitions observed in this session', async () => {
  let current = data(false);
  const observer = new OperationObserver(async () => current);
  await observer.refresh();
  expect(observer.getSnapshot().completions).toEqual([]);
  current = data();
  await observer.refresh();
  current = data(false);
  await observer.refresh();
  expect(observer.getSnapshot().completions.map(x => x.id)).toEqual(['book']);
  await observer.refresh();
  expect(observer.getSnapshot().completions).toEqual([]);
  observer.dispose();
  const delayed = Promise.withResolvers<OperationsFeed>();
  const leaving = new OperationObserver(async () => delayed.promise);
  const pending = leaving.refresh();
  leaving.dispose();
  delayed.resolve(data());
  await pending;
  expect(leaving.getSnapshot().feed).toBeNull();
});
test('refresh preserves the loaded tail and does not mistake a failed page for an empty group', async () => {
  let fail = false;
  const observer = new OperationObserver(async (_signal, cursors) => {
    if (fail) throw new Error('offline');
    const first = data();
    first.active.total = 2;
    first.active.nextCursor = 'page2';
    if (cursors.activeCursor) first.active = { items: [{ ...row, id: 'tail' }], total: 2, nextCursor: null };
    return first;
  });
  await observer.refresh();
  await observer.loadMore('active');
  expect(observer.getSnapshot().feed?.active.items.map(x => x.id)).toEqual(['book', 'tail']);
  await observer.refresh();
  expect(observer.getSnapshot().feed?.active.items.map(x => x.id)).toEqual(['book', 'tail']);
  fail = true;
  await observer.refresh();
  expect(observer.getSnapshot().feed?.active.items).toHaveLength(2);
  observer.dispose();
});
