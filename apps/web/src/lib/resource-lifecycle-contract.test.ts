import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiError } from './api';
import { idleResource, toApiError } from './resource-state';

const root = resolve(import.meta.dir, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('resource lifecycle primitives', () => {
  test('starts idle and preserves correlated API errors', () => {
    expect(idleResource<string>()).toEqual({ data: null, status: 'idle', error: null });
    const error = new ApiError('upstream_failed', { status: 503, requestId: 'req-503' });
    expect(toApiError(error)).toBe(error);
    expect(toApiError(error).requestId).toBe('req-503');
  });

  test('bootstrap exposes a retryable lifecycle while keeping the legacy flag', () => {
    const store = read('lib/store.ts');
    expect(store).toContain("bootstrapStatus: LoadStatus");
    expect(store).toContain("bootstrapStatus: 'error'");
    expect(store).toContain("bootstrapStatus: 'ready'");
    expect(store).toContain('bootstrapped: boolean');
  });

  test('screen-local collections use retained session resources', () => {
    const library = read('components/screens/library.tsx');
    const notebooks = read('components/screens/notebooks.tsx');
    expect(library).toContain("scope: 'library:list'");
    expect(library).not.toContain('setLoaded(false)');
    expect(notebooks).toContain("scope: 'notebooks:list'");
    expect(notebooks).not.toContain('setNotebooksLoaded(false)');
    expect(notebooks).not.toContain("setStatus({ notebooksEnabled: false })");
  });

  test('graph waits for semantic availability before starting its first simulation', () => {
    const graph = read('components/screens/graph.tsx');
    expect(graph).toContain('if (!edgeAvailabilityResolved) return;');
    expect(graph).toContain("semanticResource.status === 'error'");
  });
});
