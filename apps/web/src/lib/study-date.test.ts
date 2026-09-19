import { expect, test } from 'bun:test';
import { studyDateIso } from './study-date';

test('manual study dates reject rollover and ambiguous input', () => {
  expect(studyDateIso('2028-02-29')).toBe('2028-02-29T00:00:00.000Z');
  expect(studyDateIso('2026-02-29')).toBeNull();
  expect(studyDateIso('2026-02-31')).toBeNull();
  expect(studyDateIso('tomorrow')).toBeNull();
  expect(studyDateIso('02/03/2026')).toBeNull();
  expect(studyDateIso('')).toBeNull();
});
