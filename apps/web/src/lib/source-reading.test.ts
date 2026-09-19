import { describe, expect, test } from 'bun:test';
import { canReadSource } from './source-reading';

describe('source reading independent of AI indexing', () => {
  test('original PDF remains readable during indexing or after failure', () => {
    for (const status of ['pending', 'parsing', 'indexing', 'ready', 'error'] as const) {
      expect(canReadSource({ kind: 'pdf', status, total: 0 }, 'pdf')).toBe(true);
    }
  });
  test('parsed text remains readable after indexing fails', () => {
    expect(canReadSource({ kind: 'text', status: 'error', total: 3 }, 'text')).toBe(true);
    expect(canReadSource({ kind: 'text', status: 'error', total: 0 }, 'text')).toBe(false);
    expect(canReadSource({ kind: 'text', status: 'ready', total: 0 }, 'text')).toBe(true);
  });
  test('deleting sources and non-PDF sources cannot mount PDF viewer', () => {
    expect(canReadSource({ kind: 'pdf', status: 'deleting', total: 3 }, 'pdf')).toBe(false);
    expect(canReadSource({ kind: 'text', status: 'deleting', total: 3 }, 'text')).toBe(false);
    expect(canReadSource({ kind: 'text', status: 'ready', total: 3 }, 'pdf')).toBe(false);
  });
});
