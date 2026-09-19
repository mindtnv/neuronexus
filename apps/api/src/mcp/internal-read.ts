import type { User } from '@neuronexus/db';

// Identity is associated with the Request object, never with a header that a
// remote caller could forge. Only the curated MCP GET bridge creates entries.
const identities = new WeakMap<Request, User>();
export function internalReadUser(request: Request) {
  return request.method === 'GET' ? identities.get(request) : undefined;
}
export async function withInternalRead<T>(request: Request, user: User, run: () => Promise<T>) {
  if (request.method !== 'GET') throw new Error('internal_read_only');
  identities.set(request, user);
  try { return await run(); } finally { identities.delete(request); }
}
