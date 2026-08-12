'use client';

import { useCallback, useEffect, useState, type SetStateAction } from 'react';
import type { ApiError } from './api';
import { idleResource, toApiError, type ResourceState } from './resource-state';

type CacheEntry = { value: unknown; updatedAt: number };

export type SessionResourceResult<T> =
  | { ok: true; data: T; current: boolean }
  | { ok: false; error: ApiError; current: boolean };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<
  string,
  { requestId: number; promise: Promise<SessionResourceResult<unknown>> }
>();
const latestRequestByScope = new Map<string, number>();
const MAX_CACHE_ENTRIES = 64;
let requestSequence = 0;
let cacheGeneration = 0;

export function peekSessionResource<T>(key: string): T | undefined {
  return cache.get(key)?.value as T | undefined;
}

export function setSessionResource<T>(key: string, value: T): void {
  if (!cache.has(key) && cache.size >= MAX_CACHE_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [candidate, entry] of cache) {
      if (entry.updatedAt < oldestAt) {
        oldestAt = entry.updatedAt;
        oldestKey = candidate;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { value, updatedAt: Date.now() });
}

export function clearSessionResourceCache(): void {
  cacheGeneration += 1;
  cache.clear();
  inFlight.clear();
  latestRequestByScope.clear();
}

/**
 * Session-only stale-while-revalidate primitive. Identical requests share one
 * promise, while `current` is true only for the newest request in a scope. A
 * sign-out cache clear also invalidates responses that were already in flight.
 */
export function fetchSessionResource<T>(options: {
  key: string;
  scope?: string;
  fetcher: () => Promise<T>;
}): Promise<SessionResourceResult<T>> {
  const scope = options.scope ?? options.key;
  const flightKey = `${scope}\u0000${options.key}`;
  const existing = inFlight.get(flightKey);
  if (existing) {
    // Returning to the same filter while its first request is still running
    // makes that shared request current again. Without this hand-off, the hook
    // could remain stuck in `refreshing` after a quick A → B → A sequence.
    latestRequestByScope.set(scope, existing.requestId);
    return existing.promise as Promise<SessionResourceResult<T>>;
  }

  const requestId = ++requestSequence;
  const generation = cacheGeneration;
  latestRequestByScope.set(scope, requestId);

  const promise: Promise<SessionResourceResult<T>> = options.fetcher().then(
    (data) => {
      const current =
        generation === cacheGeneration && latestRequestByScope.get(scope) === requestId;
      if (generation === cacheGeneration) setSessionResource(options.key, data);
      return { ok: true as const, data, current };
    },
    (error) => ({
      ok: false as const,
      error: toApiError(error),
      current:
        generation === cacheGeneration && latestRequestByScope.get(scope) === requestId,
    }),
  ).finally(() => {
    if (inFlight.get(flightKey)?.promise === promise) inFlight.delete(flightKey);
  });

  inFlight.set(flightKey, {
    requestId,
    promise: promise as Promise<SessionResourceResult<unknown>>,
  });
  return promise;
}

export function useSessionResource<T>(options: {
  key: string;
  scope?: string;
  enabled?: boolean;
  keepPreviousData?: boolean;
  fetcher: () => Promise<T>;
}) {
  const { key, scope, enabled = true, keepPreviousData = true, fetcher } = options;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ResourceState<T>>(() => {
    const cached = enabled ? peekSessionResource<T>(key) : undefined;
    return cached === undefined ? idleResource<T>() : { data: cached, status: 'ready', error: null };
  });

  useEffect(() => {
    if (!enabled) {
      setState(idleResource<T>());
      return;
    }

    const cached = peekSessionResource<T>(key);
    setState((previous) => {
      const data = cached ?? (keepPreviousData ? previous.data : null);
      return {
        data,
        status: data === null ? 'loading' : 'refreshing',
        error: null,
      };
    });

    let active = true;
    void fetchSessionResource({ key, scope, fetcher }).then((result) => {
      if (!active || !result.current) return;
      if (result.ok) {
        setState({ data: result.data, status: 'ready', error: null });
      } else {
        setState((previous) => ({ ...previous, status: 'error', error: result.error }));
      }
    });
    return () => {
      active = false;
    };
  }, [enabled, fetcher, keepPreviousData, key, revision, scope]);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const mutate = useCallback(
    (update: SetStateAction<T | null>) => {
      setState((previous) => {
        const data = typeof update === 'function'
          ? (update as (value: T | null) => T | null)(previous.data)
          : update;
        if (data !== null) setSessionResource(key, data);
        return { data, status: data === null ? 'idle' : 'ready', error: null };
      });
    },
    [key],
  );

  return { ...state, refresh, mutate };
}
