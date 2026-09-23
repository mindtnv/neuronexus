import type { UiActionEnvelope, UiActionOffers, UiActionResult } from '@neuronexus/shared';
import { apiBaseURL, apiErrorFromResponse, ApiError } from './api';
import { useNN } from './store';

const sessions = new Map<string, Promise<string>>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const owned = (owner: string) => Boolean(owner) && useNN.getState().profile?.userId === owner;
export async function uiActionRequest<T>(owner: string, path: string, method = 'GET', body?: unknown): Promise<T> {
  if (!owned(owner)) throw new ApiError('owner_changed', { status: 409 });
  const response = await fetch(`${apiBaseURL}/ui-actions/v1${path}`, { method, credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!owned(owner)) throw new ApiError('owner_changed', { status: 409 });
  if (!response.ok) throw await apiErrorFromResponse(response);
  return response.json() as Promise<T>;
}
export function uiActionSession(owner: string): Promise<string> {
  if (!owned(owner)) return Promise.reject(new ApiError('owner_changed', { status: 409 }));
  const key = `nn:ui-actions:session:v1:${encodeURIComponent(owner)}`;
  try { const stored = sessionStorage.getItem(key); if (stored && uuid.test(stored)) return Promise.resolve(stored); } catch { /* memory-only session */ }
  const previous = sessions.get(owner);
  if (previous) return previous;
  const request = uiActionRequest<{ sessionId: string }>(owner, '/session', 'POST').then(value => {
    if (!uuid.test(value.sessionId) || !owned(owner)) throw new ApiError('owner_changed', { status: 409 });
    try { sessionStorage.setItem(key, value.sessionId); } catch {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nn:ui-action-storage-unavailable', { detail: { owner } }));
    }
    return value.sessionId;
  }).catch(error => { sessions.delete(owner); throw error; });
  sessions.set(owner, request);
  return request;
}
export async function saveUiAction<T>(owner: string, path: string, method: 'POST' | 'PATCH', args: object, requestId: string): Promise<UiActionResult<T>> {
  const identity: UiActionEnvelope = { requestId, sessionId: await uiActionSession(owner) };
  const response = await uiActionRequest<UiActionResult<T>>(owner, path, method, { ...args, ...identity });
  if (owned(owner) && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nn:ui-action', { detail: { owner, receipt: response.receipt } }));
    window.dispatchEvent(new Event('nn:knowledge-changed'));
  }
  return response;
}
export const getUiActionReceipt = <T = unknown>(owner: string, requestId: string) => uiActionRequest<UiActionResult<T>>(owner, `/receipts/${encodeURIComponent(requestId)}`);
export const undoUiActionRequest = <T = unknown>(owner: string, receiptId: string) => uiActionRequest<UiActionResult<T>>(owner, `/receipts/${encodeURIComponent(receiptId)}/undo`, 'POST');
export const fetchUiActionOffers = async (owner: string, cursor?: string) => uiActionRequest<UiActionOffers>(owner,
  `?${new URLSearchParams({ sessionId: await uiActionSession(owner), ...(cursor ? { cursor } : {}) })}`);
