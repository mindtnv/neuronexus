import { expect, test } from 'bun:test';
import { CARD_COLUMNS, defaultCardColumns, normalizeCardColumns, cardTableMinWidth, readCardColumns, saveCardColumns } from './card-columns';
test('desktop defaults retain all fields, mobile retains compact fields', () => {
  expect(defaultCardColumns(false)).toHaveLength(10);
  expect(defaultCardColumns(true)).toEqual(['question', 'answer', 'state']);
});
test('preferences reject malformed data and retain Question in canonical order', () => {
  expect(normalizeCardColumns({ version: 1, ids: ['edited', 'missing', 'edited', 'answer'] }, false)).toEqual(['question', 'answer', 'edited']);
  expect(normalizeCardColumns({ version: 1, ids: [] }, false)).toEqual(['question']);
  expect(normalizeCardColumns({ version: 7, ids: ['answer'] }, false)).toEqual(defaultCardColumns(false));
  expect(normalizeCardColumns(null, true)).toEqual(defaultCardColumns(true));
});
test('minimum canvas includes selection, column tracks, gutters and both paddings', () => {
  expect(cardTableMinWidth(CARD_COLUMNS.filter(c => c.id === 'question'))).toBe(232);
  expect(cardTableMinWidth(CARD_COLUMNS)).toBeGreaterThan(1200);
});
test('unavailable or corrupt storage degrades and desktop/mobile choices stay separate', () => {
  const broken = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
  expect(readCardColumns(true, broken)).toEqual(defaultCardColumns(true));
  expect(() => saveCardColumns(['question'], false, broken)).not.toThrow();
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  saveCardColumns(['question','tags'], false, storage);
  saveCardColumns(['question','due'], true, storage);
  expect(readCardColumns(false, storage)).toEqual(['question','tags']);
  expect(readCardColumns(true, storage)).toEqual(['question','due']);
  expect(readCardColumns(false, { ...storage, getItem: () => 'not-json' })).toEqual(defaultCardColumns(false));
});
