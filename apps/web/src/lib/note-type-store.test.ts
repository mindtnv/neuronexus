import { ensureTestDom, GlobalRegistrator } from './test-dom-setup';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cardFromApi, noteTypeFromApi } from './mappers';
import { useNN } from './store';

const savedFetch = globalThis.fetch;
const type = { id: 'type', name: 'Before', fields: [{ id: 'field', name: 'Q', ord: 0 }], templates: [{ id: 'tpl', name: 'Card', ord: 0, frontTemplate: '{{Q}}', backTemplate: 'Answer' }], kind: 'custom', styling: '', isBuiltin: false };
const row = (id: string, name = 'Before') => ({ id, noteId: `note-${id}`, deckId: 'deck', noteType: { ...type, name }, note: { id: `note-${id}`, fieldValues: { Q: name }, tags: [] } });
beforeEach(() => { ensureTestDom(); useNN.setState({ noteTypes: [noteTypeFromApi(type)], cards: [cardFromApi(row('deep')), cardFromApi(row('removed'))] }); });
afterEach(() => { globalThis.fetch = savedFetch; useNN.getState().reset(); });
afterAll(() => { try { GlobalRegistrator.unregister(); } catch {} });

describe('note type cache reconciliation', () => {
  test('refreshes deep loaded cards and new cards while dropping removed cards', async () => {
    globalThis.fetch = (async (url: any, init: any) => {
      if (init.method === 'PATCH') return Response.json({ ...type, name: 'After' });
      if (String(url).includes('/lookup')) return Response.json({ items: [row('deep', 'After')] });
      return Response.json({ items: [row('new', 'After')], nextCursor: 'more' });
    }) as typeof fetch;
    await useNN.getState().updateNoteType(type.id, { name: 'After' });
    expect(useNN.getState().cards.map((card) => card.id).sort()).toEqual(['deep', 'new']);
    expect(useNN.getState().cards.every((card) => card.noteType?.name === 'After' && card.note?.fieldValues.Q === 'After')).toBe(true);
    expect(useNN.getState().noteTypes[0].name).toBe('After');
  });

  test('a later deletion wins over an earlier delayed refresh', async () => {
    const reads = Promise.withResolvers<Response>();
    const started = Promise.withResolvers<void>();
    globalThis.fetch = (async (_url: any, init: any) => {
      if (init.method === 'PATCH') return Response.json({ ...type, name: 'After' });
      if (init.method === 'DELETE') return Response.json({ ok: true });
      started.resolve(); return (await reads.promise).clone();
    }) as typeof fetch;
    const updating = useNN.getState().updateNoteType(type.id, { name: 'After' });
    await started.promise;
    await useNN.getState().deleteNoteType(type.id, 'confirmed-preview');
    reads.resolve(Response.json({ items: [row('deep', 'After')] }));
    await updating;
    expect(useNN.getState().noteTypes).toEqual([]);
    expect(useNN.getState().cards).toEqual([]);
  });

  test('a saved type is not reported as failed when the follow-up read is unavailable', async () => {
    globalThis.fetch = (async (_url: any, init: any) => init.method === 'PATCH'
      ? Response.json({ ...type, name: 'Saved' }) : Response.json({ error: 'offline' }, { status: 503 })) as typeof fetch;
    expect((await useNN.getState().updateNoteType(type.id, { name: 'Saved' })).name).toBe('Saved');
    expect(useNN.getState().cards).toEqual([]); // do not expose obsolete embedded types
    expect(useNN.getState().noteTypes[0].name).toBe('Saved');
  });

  test('search begun before deletion cannot resurrect the removed cards', async () => {
    const response = Promise.withResolvers<Response>();
    globalThis.fetch = (async (_url: any, init: any) => init.method === 'DELETE'
      ? Response.json({ ok: true }) : response.promise) as typeof fetch;
    const searching = useNN.getState().searchCards('question');
    await useNN.getState().deleteNoteType(type.id, 'confirmed-preview');
    response.resolve(Response.json({ items: [row('deep')], nextCursor: null }));
    await searching;
    expect(useNN.getState().cards).toEqual([]);
  });
});

test('a card search started before conversion cannot restore the old embedded type', async () => {
  const search = Promise.withResolvers<Response>();
  globalThis.fetch = (async (url: any) => String(url).includes('/notes/convert')
    ? Response.json({ noteIds: ['note-deep'], cards: [{ ...row('deep'), noteType: { ...type, id: 'target', name: 'Converted' } }] })
    : search.promise) as unknown as typeof fetch;
  const pending = useNN.getState().searchCards('question');
  await useNN.getState().convertNotes({} as any);
  search.resolve(Response.json({ items: [row('deep')], nextCursor: null }));
  await pending;
  expect(useNN.getState().cards.find((card) => card.id === 'deep')?.noteType?.id).toBe('target');
});

test('a late type refresh or conversion does not restore data after account reset', async () => {
  const response = Promise.withResolvers<Response>();
  globalThis.fetch = (() => response.promise) as unknown as typeof fetch;
  const refreshing = useNN.getState().getNoteTypes();
  useNN.getState().reset();
  response.resolve(Response.json([type])); await refreshing;
  expect(useNN.getState().noteTypes).toEqual([]);
  const conversion = Promise.withResolvers<Response>();
  globalThis.fetch = (() => conversion.promise) as unknown as typeof fetch;
  const converting = useNN.getState().convertNotes({} as any);
  useNN.getState().reset();
  conversion.resolve(Response.json({ noteIds: ['note-deep'], cards: [row('deep')] })); await converting;
  expect(useNN.getState().cards).toEqual([]);
});
