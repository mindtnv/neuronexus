import { afterEach, expect, test } from 'bun:test';
import { readStudyResult, saveStudyResult, clearStudyResult, type StudyResult } from './study-result';

const result: StudyResult = { version: 1, userId: 'a', completedAt: 1234, deckName: 'Study',
  answers: 2, cards: 1, xpGained: 10, durationMs: 1500, grades: { 1: 1, 2: 0, 3: 1, 4: 0 }, mode: 'regular', reviewHref: '/review?deck=deck' };
const data = new Map<string, string>();
const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
afterEach(() => { clearStudyResult('a', storage); data.clear(); });

test('results belong only to their signed-in owner', () => {
  saveStudyResult(result, storage);
  expect(readStudyResult('a', storage)).toEqual(result);
  expect(readStudyResult('b', storage)).toBeNull();
  expect(readStudyResult(undefined, storage)).toBeNull();
});

test('bad counts and external continuation links cannot be read as a valid result', () => {
  for (const invalid of [{ cards: -1 }, { answers: 3 }, { durationMs: null }, { reviewHref: 'https://example.com' }, { userId: 'b' }]) {
    data.set('nn:lastSession:a', JSON.stringify({ ...result, ...invalid }));
    expect(readStudyResult('a', storage)).toBeNull();
  }
});

test('blocked storage still permits an in-memory result and undo clears it', () => {
  const unavailable = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
  saveStudyResult(result, unavailable);
  expect(readStudyResult('a', unavailable)).toEqual(result);
  clearStudyResult('a', unavailable);
  expect(readStudyResult('a', unavailable)).toBeNull();
});
