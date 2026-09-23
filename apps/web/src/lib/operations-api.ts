import type { OperationDestination, OperationRetryInput, OperationRetryResult, OperationsFeed } from '@neuronexus/shared';
import { apiBaseURL, ApiError } from './api';
import type { OperationCursors } from './operation-observer';

export class OperationRequestError extends ApiError {
  constructor(message: string, status: number, readonly retryAfterMs = 0, requestId?: string) { super(message, { status, requestId }); }
}
async function read<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new OperationRequestError(typeof body?.error === 'string' ? body.error : 'request_failed', response.status,
    typeof body?.retryAfterMs === 'number' ? body.retryAfterMs : 0, response.headers.get('x-request-id') ?? undefined);
  return body as T;
}
export const fetchOperations = (signal: AbortSignal, cursors: OperationCursors = {}) =>
  fetch(`${apiBaseURL}/operations/v1?${new URLSearchParams(cursors)}`, { credentials: 'include', signal }).then(read<OperationsFeed>);
export const requestOperationRetry = (input: OperationRetryInput, signal?: AbortSignal) =>
  fetch(`${apiBaseURL}/operations/v1/retry`, { method: 'POST', credentials: 'include', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }).then(read<OperationRetryResult>);

export function operationHref(destination: OperationDestination): string {
  const id = encodeURIComponent(destination.id);
  if (destination.kind === 'source') return `/library/${id}`;
  if (destination.kind === 'notebook-artifact') return `/notebooks/${encodeURIComponent(destination.notebookId)}?artifact=${id}`;
  return destination.sourceId ? `/library/${encodeURIComponent(destination.sourceId)}?artifact=${id}` : `/library/study?artifact=${id}`;
}
export function notifyOperationsChanged() { if (typeof window !== 'undefined') window.dispatchEvent(new Event('nn:operations-changed')); }
