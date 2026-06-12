// Unit tests for the studio live-progress pure formatters (streaming follow-up):
// elapsed-seconds + split, and the char-count formatter (grouped / thousands).

import { describe, expect, test } from 'bun:test';
import { formatCharCount, formatElapsedSeconds, splitElapsed } from './artifact-progress';

describe('formatElapsedSeconds', () => {
  test('floors ms to whole seconds; clamps negatives/NaN to 0', () => {
    expect(formatElapsedSeconds(0)).toBe(0);
    expect(formatElapsedSeconds(999)).toBe(0);
    expect(formatElapsedSeconds(1000)).toBe(1);
    expect(formatElapsedSeconds(1999)).toBe(1);
    expect(formatElapsedSeconds(65_000)).toBe(65);
    expect(formatElapsedSeconds(-500)).toBe(0);
    expect(formatElapsedSeconds(Number.NaN)).toBe(0);
  });
});

describe('splitElapsed', () => {
  test('splits total seconds into minutes + seconds', () => {
    expect(splitElapsed(0)).toEqual({ minutes: 0, seconds: 0 });
    expect(splitElapsed(45)).toEqual({ minutes: 0, seconds: 45 });
    expect(splitElapsed(60)).toEqual({ minutes: 1, seconds: 0 });
    expect(splitElapsed(125)).toEqual({ minutes: 2, seconds: 5 });
    expect(splitElapsed(-10)).toEqual({ minutes: 0, seconds: 0 });
  });
});

describe('formatCharCount', () => {
  test('groups thousands with a space below 10 000 (isThousands false)', () => {
    expect(formatCharCount(0)).toEqual({ display: '0', isThousands: false });
    expect(formatCharCount(42)).toEqual({ display: '42', isThousands: false });
    expect(formatCharCount(1234)).toEqual({ display: '1 234', isThousands: false });
    expect(formatCharCount(9999)).toEqual({ display: '9 999', isThousands: false });
  });

  test('switches to a one-decimal thousands value at/above 10 000', () => {
    expect(formatCharCount(10_000)).toEqual({ display: '10', isThousands: true });
    expect(formatCharCount(12_345)).toEqual({ display: '12,3', isThousands: true });
    expect(formatCharCount(12_000)).toEqual({ display: '12', isThousands: true });
    expect(formatCharCount(99_950)).toEqual({ display: '100', isThousands: true });
  });

  test('clamps negatives/NaN to 0', () => {
    expect(formatCharCount(-5)).toEqual({ display: '0', isThousands: false });
    expect(formatCharCount(Number.NaN)).toEqual({ display: '0', isThousands: false });
  });
});
