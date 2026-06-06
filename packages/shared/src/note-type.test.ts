import { describe, expect, test } from 'bun:test';
import type {
  CardTemplate,
  FieldValues,
  NoteField,
  NoteTypeDef,
  RenderKind,
} from './note-type.ts';

// These are TYPE-level guarantees consumed by Phase 3/4/5; the tests assert the
// shapes are constructible and usable (compile-time + a couple of runtime spot
// checks). No DOM/Node.

describe('note-type type shapes', () => {
  test('a full NoteTypeDef is constructible with all fields', () => {
    const field: NoteField = { name: 'Front', ord: 0 };
    const template: CardTemplate = {
      name: 'Card 1',
      ord: 0,
      frontTemplate: '{{Front}}',
      backTemplate: '{{Front}}<hr>{{Back}}',
    };
    const def: NoteTypeDef = {
      id: 'nt_1',
      name: 'Basic',
      fields: [field, { name: 'Back', ord: 1 }],
      templates: [template],
      styling: '.card { font-size: 16px; }',
      isBuiltin: true,
      kind: 'basic',
    };
    expect(def.fields).toHaveLength(2);
    expect(def.templates[0].ord).toBe(0);
    expect(def.kind).toBe('basic');
    expect(def.isBuiltin).toBe(true);
  });

  test('id is optional (builtins/fixtures before persistence)', () => {
    const def: NoteTypeDef = {
      name: 'Cloze',
      fields: [{ name: 'Text', ord: 0 }],
      templates: [{ name: 'Cloze', ord: 0, frontTemplate: '{{Text}}', backTemplate: '{{Text}}' }],
      styling: '',
      isBuiltin: true,
      kind: 'cloze',
    };
    expect(def.id).toBeUndefined();
  });

  test('all four RenderKind values are assignable', () => {
    const kinds: RenderKind[] = ['basic', 'cloze', 'typein', 'custom'];
    expect(kinds).toHaveLength(4);
  });

  test('FieldValues maps field names to HTML strings', () => {
    const fv: FieldValues = { Front: '<b>Q</b>', Back: 'A' };
    expect(fv.Front).toBe('<b>Q</b>');
  });
});
