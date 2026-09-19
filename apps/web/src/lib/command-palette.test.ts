import { expect, test } from 'bun:test';
import { movePaletteSelection, paletteSelection, paletteDeckHref } from './command-palette';

test('empty keyboard navigation never produces an invalid selection', () => {
  expect(movePaletteSelection([], null, 'ArrowDown')).toBeNull();
  expect(movePaletteSelection([], 'gone', 'ArrowUp')).toBeNull();
});
test('navigation wraps and respects Home/End', () => {
  expect(movePaletteSelection(['a', 'b'], 'a', 'ArrowUp')).toBe('b');
  expect(movePaletteSelection(['a', 'b'], 'b', 'ArrowDown')).toBe('a');
  expect(movePaletteSelection(['a', 'b'], 'b', 'Home')).toBe('a');
  expect(movePaletteSelection(['a', 'b'], 'a', 'End')).toBe('b');
});
test('arriving search results preserve the selected identity and replace vanished results', () => {
  expect(paletteSelection(['new', 'a', 'b'], 'b')).toBe('b');
  expect(paletteSelection(['new'], 'b')).toBe('new');
});
test('a deck opens its own filtered cards, including quoted names', () => {
  expect(new URL(paletteDeckHref('English / Work'), 'http://local').searchParams.get('q')).toBe('deck:"English / Work"');
  expect(new URL(paletteDeckHref('Say "hi"'), 'http://local').searchParams.get('q')).toBe('deck:"Say \\"hi\\""');
});
