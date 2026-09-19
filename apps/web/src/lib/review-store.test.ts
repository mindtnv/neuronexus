import { ensureTestDom, GlobalRegistrator } from './test-dom-setup';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cardFromApi } from './mappers';
import { useNN } from './store';

const originalFetch = globalThis.fetch;
const row = {
  id: '01900000-0000-7000-8000-000000000001', deckId: 'deck', noteId: 'note',
  state: 'new', due: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  renderFrontText: 'Question', renderBackText: 'Answer',
};
const rich = cardFromApi({ ...row,
  note: { id: 'note', fieldValues: { Front: 'Question', Back: 'Answer' }, tags: ['tag'] },
  noteType: { id: 'type', name: 'Basic', kind: 'basic', templates: [{ ord: 0, name: 'Card', front: '{{Front}}', back: '{{Back}}' }] },
});
const saved = { ...row, state: 'learning', reps: 1, updatedAt: '2026-01-01T00:00:01.000Z' };
const gradeResponse = { card: saved, review: { id: 'review', cardId: row.id, rating: 3 }, profile: null };

beforeEach(() => ensureTestDom());
afterEach(() => { globalThis.fetch = originalFetch; useNN.getState().reset(); });
afterAll(() => GlobalRegistrator.unregister());

describe('review store', () => {
  test('bare grade response preserves content and sends the displayed version', async () => {
    useNN.setState({ cards: [rich] });
    let sent: any;
    globalThis.fetch = (async (_url: any, init: any) => {
      sent = JSON.parse(init.body);
      return Response.json(gradeResponse);
    }) as unknown as typeof fetch;
    await useNN.getState().gradeCard(rich.id, 3, 1000);
    const card = useNN.getState().cards[0]!;
    expect(card.note).toEqual(rich.note);
    expect(card.noteType).toEqual(rich.noteType);
    expect(card.tags).toEqual(['tag']);
    expect(card.fsrs.reps).toBe(1);
    expect(sent.expectedReps).toBe(0);
    expect(sent.expectedUpdatedAt).toBe(row.updatedAt);
  });

  test('grade upserts a queue card outside the bootstrap page', async () => {
    globalThis.fetch = (async () => Response.json(gradeResponse)) as unknown as typeof fetch;
    const result = await useNN.getState().gradeCard(rich.id, 3, 1000, 'regular', rich);
    expect(useNN.getState().cards).toHaveLength(1);
    expect(result.card.note).toEqual(rich.note);
  });

  test('undo preserves the full card and targets the requested review', async () => {
    useNN.setState({ cards: [rich] });
    let sent: any;
    globalThis.fetch = (async (_url: any, init: any) => {
      sent = JSON.parse(init.body);
      return Response.json({ card: row, profile: null, reviewId: 'review' });
    }) as unknown as typeof fetch;
    const result = await useNN.getState().undoLastReview('review');
    expect(sent).toEqual({ reviewId: 'review' });
    expect(result.card.note).toEqual(rich.note);
    expect(useNN.getState().cards[0]!.noteType).toEqual(rich.noteType);
  });

  test('a response from the previous account cannot repopulate the mirror', async () => {
    const response = Promise.withResolvers<Response>();
    globalThis.fetch = (() => response.promise) as unknown as typeof fetch;
    useNN.setState({ cards: [rich] });
    const grading = useNN.getState().gradeCard(rich.id, 3, 1000);
    useNN.getState().reset();
    response.resolve(Response.json({ ...gradeResponse, profile: { xp: 10 } }));
    await grading;
    expect(useNN.getState().cards).toEqual([]);
    expect(useNN.getState().profile).toBeNull();
  });

  test('a newly saved note is immediately editable with its full fields and template', async () => {
    useNN.setState({ noteTypes: [{ ...rich.noteType!, fields: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }], isBuiltin: true }] });
    globalThis.fetch = (async () => Response.json({ card: undefined, cards: [row], note: { ...rich.note, noteTypeId: rich.noteType!.id } })) as unknown as typeof fetch;
    const created = await useNN.getState().addNote({ deckId: row.deckId, noteTypeId: rich.noteType!.id, fieldValues: rich.note!.fieldValues, tags: ['tag'] });
    expect(created[0]!.note).toEqual(rich.note);
    expect(created[0]!.noteType).toEqual({ ...rich.noteType!, fields: useNN.getState().noteTypes[0].fields });
    expect(useNN.getState().cards[0]!.note?.fieldValues.Back).toBe('Answer');
  });
});
