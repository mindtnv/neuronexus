import { expect, test } from 'bun:test';
import { adoptTypeIdentities, withoutDraftKey } from './type-draft-identities';
test('late type creation adopts IDs without replacing newer names, order or template text', () => {
  const submitted = { fields: [{ draftKey: 'q', name: 'Q', ord: 0 }, { draftKey: 'a', name: 'A', ord: 1 }],
    templates: [{ draftKey: 'front', name: 'Front', ord: 0, frontTemplate: '{{Q}}' }] };
  const current = { fields: [{ draftKey: 'a', name: 'Renamed answer', ord: 0 }, { draftKey: 'q', name: 'Q', ord: 1 }],
    templates: [{ draftKey: 'front', name: 'Front', ord: 0, frontTemplate: 'Newer template' }] };
  const saved = { fields: [{ id: 'server-q', ord: 0 }, { id: 'server-a', ord: 1 }], templates: [{ id: 'server-front', ord: 0 }] };
  const merged = adoptTypeIdentities(current, submitted, saved);
  expect(merged.fields[0]).toMatchObject({ id: 'server-a', name: 'Renamed answer', ord: 0 });
  expect(merged.templates[0]).toMatchObject({ id: 'server-front', frontTemplate: 'Newer template' });
  expect(withoutDraftKey(merged.fields[0]!)).not.toHaveProperty('draftKey');
});
