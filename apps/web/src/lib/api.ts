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

const baseURL =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : 'http://localhost:3000';

export const api = treaty<App>(baseURL, {
  fetch: {
    // Send + receive BetterAuth session cookies cross-origin.
    credentials: 'include',
  },
});

// Helpers that unwrap Eden's { data, error } envelope into plain promises.
// Throws on network / non-2xx so callers can use try/catch.
export async function ok<T, E>(result: { data: T | null; error: E | null }): Promise<T> {
  if (result.error) {
    const message =
      typeof result.error === 'object' && result.error && 'value' in result.error
        ? JSON.stringify((result.error as { value: unknown }).value)
        : String(result.error);
    throw new Error(message);
  }
  if (result.data === null) throw new Error('empty response');
  return result.data;
}
