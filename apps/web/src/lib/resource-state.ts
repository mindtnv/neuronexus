import { ApiError } from './api';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'refreshing' | 'error';

export interface ResourceState<T> {
  data: T | null;
  status: LoadStatus;
  error: ApiError | null;
}

export function idleResource<T>(data: T | null = null): ResourceState<T> {
  return { data, status: 'idle', error: null };
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const message = error instanceof Error ? error.message : 'request_failed';
  return new ApiError(message, { status: 0 });
}
