import { describe, expect, test } from 'bun:test';
import { identifiedFields, renameFieldValues, renameTemplateFields } from './note-fields';

describe('stable field rename', () => {
  test('legacy IDs survive reorder and persistence', () => {
    const fields = identifiedFields('type', [{ name: 'Q', ord: 0 }, { name: 'A', ord: 1 }]);
    const reordered = fields.toReversed().map((field, ord) => ({ ...field, ord }));
    expect(identifiedFields('type', reordered)[1].id).toBe(fields[0].id);
  });
  test('renames variables and balanced sections once, leaving content untouched', () => {
    const map = new Map([['Q', 'Question'], ['Question', 'Other']]);
    expect(renameTemplateFields('{{# Q }}{{Q}}{{/Q}}{{^Q}}empty{{/Q}} Question', map))
      .toBe('{{#Question}}{{Question}}{{/Question}}{{^Question}}empty{{/Question}} Question');
  });
  test('value swaps use the original values and retain undeclared fields', () => {
    expect(renameFieldValues({ Q: 'first', A: 'second', Legacy: 'keep' }, new Map([['Q', 'A'], ['A', 'Q']])))
      .toEqual({ A: 'first', Q: 'second', Legacy: 'keep' });
  });
  test('collision with a retained undeclared field rejects rather than overwrites', () => {
    expect(renameFieldValues({ Q: 'first', Legacy: 'precious' }, new Map([['Q', 'Legacy']]))).toBeNull();
  });
});
