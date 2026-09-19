import { beforeEach, describe, expect, test } from 'bun:test';
import { buildApp } from '../src/app';
import { callApp, resetTestDb, signUpAndCookie, uniqueEmail } from './helpers';

const app = buildApp();
beforeEach(resetTestDb);
const definition = { name: 'Definition', kind: 'typein', fields: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
  templates: [{ name: 'Card', ord: 0, frontTemplate: '{{Front}}', backTemplate: '{{Back}}' }] };

describe('note definition contracts', () => {
  test('adding and moving helper fields cannot change the pinned typed-answer field', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const type = await (await callApp(app, 'POST', '/note-types', { cookie, body: definition })).json<any>();
    expect(type.fields.find((field: any) => field.typeinAnswer)?.name).toBe('Back');
    const updated = await (await callApp(app, 'PATCH', `/note-types/${type.id}`, { cookie, body: {
      fields: [...type.fields, { name: 'Extra', ord: 2 }],
    } })).json<any>();
    expect(updated.fields.find((field: any) => field.typeinAnswer)?.name).toBe('Back');
    const moved = await (await callApp(app, 'PATCH', `/note-types/${type.id}`, { cookie, body: {
      fields: updated.fields.toReversed().map((field: any, ord: number) => ({ ...field, ord })),
    } })).json<any>();
    expect(moved.fields.find((field: any) => field.typeinAnswer)?.name).toBe('Back');
  });
  test('rejects ambiguous names and invalid templates before persistence', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    for (const fields of [[{ name: ' Q ', ord: 0 }, { name: 'q', ord: 1 }], [{ name: 'bad{{name}}', ord: 0 }]]) {
      expect((await callApp(app, 'POST', '/note-types', { cookie, body: { ...definition, fields } })).status).toBe(400);
    }
    for (const frontTemplate of ['<script>hidden</script>', '<style>hidden</style>', '<div', '{{Unknown}}', '{{#Front}}{{/Front}}', '{{#Front}}unfinished', '{{#Front}}x{{/Back}}', '<div></div>']) {
      const result = await callApp(app, 'POST', '/note-types', { cookie, body: { ...definition,
        templates: [{ ...definition.templates[0], frontTemplate }] } });
      expect(result.status).toBe(400);
      expect(await result.json()).toMatchObject({ error: 'invalid_template' });
    }
  });
});

test('typed alternatives survive edits and card reads; invalid questions cannot orphan a note', async () => {
  const { cookie } = await signUpAndCookie(app, uniqueEmail());
  const type = await (await callApp(app, 'POST', '/note-types', { cookie, body: definition })).json<any>();
  const deck = await (await callApp(app, 'POST', '/decks', { cookie, body: { name: 'Study' } })).json<any>();
  const created = await callApp(app, 'POST', '/notes', { cookie, body: { noteTypeId: type.id, deckId: deck.id,
    fieldValues: { Front: 'Capital?', Back: '**Paris**' }, acceptedAnswers: ['Lutetia'] } });
  expect(created.status).toBe(200);
  const { note, cards } = await created.json<any>();
  expect(note.acceptedAnswers).toEqual(['Lutetia']);
  const enriched = await (await callApp(app, 'GET', `/cards/${cards[0].id}`, { cookie })).json<any>();
  expect(enriched.note.acceptedAnswers).toEqual(['Lutetia']);
  expect(enriched.noteType.fields.find((field: any) => field.typeinAnswer)?.name).toBe('Back');
  const updated = await (await callApp(app, 'PATCH', `/notes/${note.id}`, { cookie, body: { tags: ['safe'] } })).json<any>();
  expect(updated.note.acceptedAnswers).toEqual(['Lutetia']);
  expect((await callApp(app, 'PATCH', `/notes/${note.id}`, { cookie, body: { fieldValues: { Front: '', Back: 'Paris' } } })).status).toBe(400);
  expect((await callApp(app, 'PATCH', `/notes/${note.id}`, { cookie, body: { fieldValues: { Front: 'Capital?', Back: '' } } })).status).toBe(400);
  const changed = await (await callApp(app, 'PATCH', `/notes/${note.id}`, { cookie, body: { acceptedAnswers: ['City of Paris'] } })).json<any>();
  expect(changed.note.acceptedAnswers).toEqual(['City of Paris']);
  expect(changed.cards[0].id).toBe(cards[0].id);
  expect((await callApp(app, 'PATCH', `/notes/${note.id}`, { cookie, body: { acceptedAnswers: ['x\ny'] } })).status).toBe(400);
});

test('type preview checks existing notes and blocks an unusable template without deleting cards', async () => {
  const { cookie } = await signUpAndCookie(app, uniqueEmail());
  const type = await (await callApp(app, 'POST', '/note-types', { cookie, body: { ...definition, kind: 'custom', fields: [...definition.fields, { name: 'Extra', ord: 2 }] } })).json<any>();
  const deck = await (await callApp(app, 'POST', '/decks', { cookie, body: { name: 'Study' } })).json<any>();
  for (const Front of ['One', 'Two']) {
    expect((await callApp(app, 'POST', '/notes', { cookie, body: { noteTypeId: type.id, deckId: deck.id, fieldValues: { Front, Back: 'Answer', Extra: '' } } })).status).toBe(200);
  }
  const bad = { templates: [{ ...type.templates[0], frontTemplate: '{{Extra}}' }] };
  const preview = await (await callApp(app, 'POST', `/note-types/${type.id}/preview`, { cookie, body: bad })).json<any>();
  expect(preview.validation).toMatchObject({ checkedNotes: 2, invalidNotes: 2 });
  expect(preview.validation.samples.map((sample: any) => sample.front)).toEqual(['One', 'Two']);
  expect((await callApp(app, 'PATCH', `/note-types/${type.id}`, { cookie, body: { ...bad, confirmationToken: preview.confirmationToken } })).status).toBe(400);
  const good = await (await callApp(app, 'POST', `/note-types/${type.id}/preview`, { cookie, body: { templates: [...type.templates,
    { name: 'Optional reverse', ord: 1, frontTemplate: '{{Extra}}', backTemplate: '{{Front}}' }] } })).json<any>();
  expect(good.validation.invalidNotes).toBe(0);
  expect(good.validation.samples[0].omittedTemplates).toEqual(['Optional reverse']);
  expect(good.impact).toMatchObject({ willKeepCards: 2, willDeleteCards: 0, willCreateCards: 0 });
});
