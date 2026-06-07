// detectDisplayMode — pure PWA-standalone detector guard tests.
//
// The pure helper takes (win, nav) as args so it needs no DOM render — we stub
// matchMedia / navigator.standalone directly (pattern mirrors app-badge.test.ts:
// inject / omit / throw the browser API and assert the guard result).

import { describe, expect, test } from 'bun:test';
import { detectDisplayMode } from './ui-store';

function fakeWin(matches: boolean): Window {
  return {
    matchMedia: (_q: string) => ({ matches }),
  } as unknown as Window;
}

function throwingWin(): Window {
  return {
    matchMedia: () => {
      throw new Error('matchMedia blocked');
    },
  } as unknown as Window;
}

function fakeNav(standalone: boolean): Navigator {
  return { standalone } as unknown as Navigator;
}

describe('detectDisplayMode', () => {
  test('(a) undefined win + undefined nav → browser', () => {
    expect(detectDisplayMode(undefined, undefined)).toBe('browser');
  });

  test('(b) matchMedia.matches === false → browser', () => {
    expect(detectDisplayMode(fakeWin(false), undefined)).toBe('browser');
  });

  test('(c) matchMedia.matches === true → standalone', () => {
    expect(detectDisplayMode(fakeWin(true), undefined)).toBe('standalone');
  });

  test('(d) navigator.standalone === true (matchMedia false) → standalone', () => {
    expect(detectDisplayMode(fakeWin(false), fakeNav(true))).toBe('standalone');
  });

  test('(e) matchMedia throws → browser', () => {
    expect(detectDisplayMode(throwingWin(), undefined)).toBe('browser');
  });
});
