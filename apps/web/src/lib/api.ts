// End-to-end typed API client via Eden Treaty.
//
// The backend is at apps/api. We import only its *type* (erased at build time),
// so no server code ends up in the browser bundle.
//
// Usage:
//   const { data, error } = await api.decks.get();
//   const { data } = await api.decks.post({ name: 'New deck' });
//   const { data } = await api.decks({ id }).patch({ name: 'Renamed' });

import { treaty } from '@elysiajs/eden';
import type { App } from '@neuronexus/api';

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const api = treaty<App>(baseURL, {
  fetch: {
    // Send + receive BetterAuth session cookies cross-origin.
    credentials: 'include',
  },
});

export type ApiErrorPayload = {
  requestId?: string;
  error?: {
    code?: string;
    message?: string;
    detail?: unknown;
  };
};

export class NNApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly detail: unknown;

  constructor(opts: {
    status: number;
    code: string;
    message: string;
    requestId?: string | null;
    detail?: unknown;
  }) {
    super(opts.message);
    this.name = 'NNApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.requestId = opts.requestId ?? null;
    this.detail = opts.detail;
  }
}

function parseApiErrorPayload(value: unknown): ApiErrorPayload {
  return value && typeof value === 'object' ? (value as ApiErrorPayload) : {};
}

// Helpers that unwrap Eden's { data, error } envelope into plain promises.
// Throws on network / non-2xx so callers can use try/catch.
export async function ok<T, E>(result: {
  data: T | null;
  error: E | null;
  status: number;
  headers: Record<string, string>;
}): Promise<T> {
  if (result.error) {
    const error = result.error as
      | { status?: number; value?: unknown; message?: string }
      | null;
    const payload = parseApiErrorPayload(error?.value);
    throw new NNApiError({
      status: error?.status ?? result.status,
      code: payload.error?.code ?? 'API_REQUEST_FAILED',
      message:
        payload.error?.message ??
        error?.message ??
        (typeof error?.value === 'string' ? error.value : 'Request failed.'),
      requestId: payload.requestId ?? result.headers['x-request-id'] ?? null,
      detail: payload.error?.detail,
    });
  }
  if (result.data === null) {
    throw new NNApiError({
      status: result.status,
      code: 'EMPTY_RESPONSE',
      message: 'Empty response.',
      requestId: result.headers['x-request-id'] ?? null,
    });
  }
  return result.data;
}
