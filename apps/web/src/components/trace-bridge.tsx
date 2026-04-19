'use client';

import { useEffect } from 'react';
import { TRACE_HEADERS, ensureTraceContext, logTrace } from '@/lib/trace';

declare global {
  interface Window {
    __nnFetchPatched?: boolean;
    __nnOriginalFetch?: typeof window.fetch;
  }
}

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

function isApiRequest(url: string) {
  try {
    return new URL(url, window.location.origin).origin === new URL(apiBase).origin;
  } catch {
    return false;
  }
}

export function TraceBridge() {
  useEffect(() => {
    ensureTraceContext();
    if (typeof window === 'undefined' || window.__nnFetchPatched) return;

    const original = window.fetch.bind(window);
    window.__nnOriginalFetch = original;

    const tracedFetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null;
        const url = request?.url ?? String(input);

        if (!isApiRequest(url)) {
          return original(input, init);
      }

      const trace = ensureTraceContext();
      const startedAt = performance.now();
      const parsedUrl = new URL(url, window.location.origin);
      const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
      const headers = new Headers(request?.headers ?? undefined);
      if (init?.headers) {
        new Headers(init.headers).forEach((value, key) => headers.set(key, value));
      }
      if (!headers.has(TRACE_HEADERS.flowId)) {
        headers.set(TRACE_HEADERS.flowId, trace.flowId);
      }
      if (trace.scenarioId && !headers.has(TRACE_HEADERS.scenarioId)) {
        headers.set(TRACE_HEADERS.scenarioId, trace.scenarioId);
      }

      logTrace('api.request.start', {
        method,
        path: parsedUrl.pathname,
      });

      try {
        const nextRequest = request
          ? new Request(request, {
              ...init,
              headers,
            })
          : new Request(parsedUrl.toString(), {
              ...init,
              headers,
            });
        const response = await original(nextRequest);
        logTrace('api.request.end', {
          method,
          path: parsedUrl.pathname,
          status: response.status,
          requestId: response.headers.get('x-request-id'),
          durationMs: Math.round(performance.now() - startedAt),
        });
        return response;
        } catch (error) {
          logTrace('api.request.error', {
            method,
            path: parsedUrl.pathname,
            durationMs: Math.round(performance.now() - startedAt),
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
      original,
    ) as typeof window.fetch;

    window.fetch = tracedFetch;

    window.__nnFetchPatched = true;
    return () => {
      if (window.__nnOriginalFetch) {
        window.fetch = window.__nnOriginalFetch;
      }
      window.__nnFetchPatched = false;
      delete window.__nnOriginalFetch;
    };
  }, []);

  return null;
}
