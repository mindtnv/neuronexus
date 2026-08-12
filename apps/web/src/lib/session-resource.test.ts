import { afterEach, describe, expect, test } from 'bun:test';
import {
  clearSessionResourceCache,
  fetchSessionResource,
  peekSessionResource,
} from './session-resource';

afterEach(() => clearSessionResourceCache());

describe('session resource cache', () => {
  test('deduplicates identical in-flight requests', async () => {
    let calls = 0;
    const deferred = Promise.withResolvers<number>();
    const fetcher = () => {
      calls += 1;
      return deferred.promise;
    };

    const first = fetchSessionResource({ key: 'same', fetcher });
    const second = fetchSessionResource({ key: 'same', fetcher });
    expect(calls).toBe(1);
    deferred.resolve(7);
    expect(await first).toEqual({ ok: true, data: 7, current: true });
    expect(await second).toEqual({ ok: true, data: 7, current: true });
    expect(peekSessionResource<number>('same')).toBe(7);
  });

  test('marks an older filter request stale within the same scope', async () => {
    const oldDeferred = Promise.withResolvers<string>();
    const newDeferred = Promise.withResolvers<string>();
    const oldRequest = fetchSessionResource({
      key: 'library:q=old',
      scope: 'library:list',
      fetcher: () => oldDeferred.promise,
    });
    const newRequest = fetchSessionResource({
      key: 'library:q=new',
      scope: 'library:list',
      fetcher: () => newDeferred.promise,
    });

    newDeferred.resolve('new');
    oldDeferred.resolve('old');
    expect((await newRequest).current).toBe(true);
    expect((await oldRequest).current).toBe(false);
  });

  test('makes a deduplicated request current again after a rapid A → B → A switch', async () => {
    const aDeferred = Promise.withResolvers<string>();
    const bDeferred = Promise.withResolvers<string>();
    const firstA = fetchSessionResource({
      key: 'library:q=a',
      scope: 'library:list',
      fetcher: () => aDeferred.promise,
    });
    const requestB = fetchSessionResource({
      key: 'library:q=b',
      scope: 'library:list',
      fetcher: () => bDeferred.promise,
    });
    const secondA = fetchSessionResource({
      key: 'library:q=a',
      scope: 'library:list',
      fetcher: () => Promise.resolve('must-not-run'),
    });

    expect(secondA).toBe(firstA);
    bDeferred.resolve('b');
    aDeferred.resolve('a');
    expect((await requestB).current).toBe(false);
    expect((await secondA).current).toBe(true);
  });

  test('a session clear drops cached and already-started responses', async () => {
    const deferred = Promise.withResolvers<string>();
    const request = fetchSessionResource({
      key: 'private',
      fetcher: () => deferred.promise,
    });
    clearSessionResourceCache();
    deferred.resolve('secret');

    expect((await request).current).toBe(false);
    expect(peekSessionResource('private')).toBeUndefined();
  });
});
