import { expect, test } from 'bun:test';
import { answerDurationGroups } from './session-charts';

test('one answer remains one measured observation, including zero duration', () => {
  expect(answerDurationGroups([{ durationMs: 5000, rating: 3 }])).toEqual([{ first: 1, last: 1, count: 1, meanMs: 5000, totalMs: 5000 }]);
  expect(answerDurationGroups([{ durationMs: 0, rating: 1 }])[0].meanMs).toBe(0);
  expect(answerDurationGroups([])).toEqual([]);
});
test('long sessions group consecutive answers without losing their time or count', () => {
  const answers = Array.from({ length: 101 }, (_, index) => ({ durationMs: (index + 1) * 100, rating: 3 as const }));
  const groups = answerDurationGroups(answers);
  expect(groups.length).toBeLessThanOrEqual(40);
  expect(groups.reduce((sum, item) => sum + item.count, 0)).toBe(101);
  expect(groups.reduce((sum, item) => sum + item.totalMs, 0)).toBe(answers.reduce((sum, item) => sum + item.durationMs, 0));
  expect(groups[0]).toMatchObject({ first: 1, last: 3, meanMs: 200 });
  expect(groups.at(-1)).toMatchObject({ first: 100, last: 101, count: 2, meanMs: 10050 });
});
test('undo naturally removes the last observation instead of retaining its chart value', () => {
  const answers = [{ durationMs: 2000, rating: 3 as const }, { durationMs: 9000, rating: 1 as const }];
  expect(answerDurationGroups(answers.slice(0, -1))).toEqual([{ first: 1, last: 1, count: 1, meanMs: 2000, totalMs: 2000 }]);
});
