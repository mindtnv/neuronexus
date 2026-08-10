import { describe, expect, test } from 'bun:test';
import { newUuidV7 } from './uuid.ts';

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newUuidV7', () => {
  test('returns RFC 9562 UUIDv7 values', () => {
    expect(newUuidV7()).toMatch(UUID_V7_RE);
  });

  test('is monotonic within one process', () => {
    const ids = Array.from({ length: 100 }, () => newUuidV7());
    expect(ids).toEqual([...ids].sort());
  });
});
