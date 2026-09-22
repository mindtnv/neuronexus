import { expect, test } from 'bun:test';
import { PdfPageVisibility } from './pdf-page-visibility';

test('current page uses actual visible area, independent of prefetched pages', () => {
  const pages = new PdfPageVisibility(20);
  expect([...pages.updateNearby([{ page: 2, visible: true }, { page: 3, visible: true }])]).toContain(3);
  expect(pages.updateViewport([{ page: 2, area: 400 }, { page: 3, area: 0 }])).toBe(2);
  // Observer callbacks are deltas: a small newly visible page must not replace
  // the larger page just because that larger page is absent from this callback.
  expect(pages.updateViewport([{ page: 3, area: 20 }])).toBe(2);
  expect(pages.updateViewport([{ page: 2, area: 0 }, { page: 3, area: 450 }])).toBe(3);
});
test('virtualization drops old neighbours instead of expanding the prior render set forever', () => {
  const pages = new PdfPageVisibility(100);
  expect([...pages.updateNearby([{ page: 1, visible: true }])]).toEqual([1, 2, 3]);
  expect([...pages.updateNearby([{ page: 1, visible: false }, { page: 50, visible: true }])]).toEqual([48, 49, 50, 51, 52]);
  expect([...pages.updateNearby([{ page: 50, visible: false }, { page: 100, visible: true }])]).toEqual([98, 99, 100]);
});
test('unknown, non-finite and out-of-range pages cannot influence either view', () => {
  const pages = new PdfPageVisibility(3);
  expect([...pages.updateNearby([{ page: 99, visible: true }, { page: 1.5, visible: true }])]).toEqual([]);
  expect(pages.updateViewport([{ page: 99, area: 500 }, { page: 2, area: Number.NaN }])).toBeUndefined();
  expect(pages.updateViewport([{ page: 2, area: 10 }, { page: 1, area: 10 }])).toBe(1);
});
