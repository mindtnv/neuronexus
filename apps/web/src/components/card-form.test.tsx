import { ensureTestDom, GlobalRegistrator } from '../lib/test-dom-setup';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { AppNavigationProvider } from './navigation';
import { DialogProvider } from './dialog';
import { BASIC_NOTE_TYPE, CLOZE_NOTE_TYPE } from '@neuronexus/shared';
import { useNN } from '../lib/store';
import { cardFromApi, noteTypeFromApi } from '../lib/mappers';
import { clearSessionResourceCache } from '../lib/session-resource';

// Re-register before loading DOM-dependent modules; other suites tear the DOM down.
ensureTestDom();
const { createRoot } = await import('react-dom/client');
const { NNCardForm } = await import('./card-form');
const { NNEditor } = await import('./screens/editor');
const { NNCardsBrowser } = await import('./screens/cards-browser');
const { NNCustomStudy } = await import('./screens/custom-study');

const row = { id: '01900000-0000-7000-8000-000000000001', noteId: 'note', deckId: 'deck',
  note: { id: 'note', noteTypeId: BASIC_NOTE_TYPE.id, updatedAt: '2026-09-19T00:00:00.000Z', fieldValues: { Front: 'Question', Back: 'Answer' }, tags: [] },
  noteType: BASIC_NOTE_TYPE };
const card = cardFromApi(row);
const navigations: string[] = [];
const router = { bfcacheId: 'test', push(href: string) { navigations.push(href); }, replace(href: string) { navigations.push(href); }, back() {}, forward() {}, refresh() {}, prefetch() {}, hmrRefresh() {} };
let root: Root;
let container: HTMLDivElement;
let originalFetch: typeof fetch;
const originalUpload = useNN.getState().uploadMedia;

beforeEach(() => {
  ensureTestDom(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  clearSessionResourceCache(); navigations.length = 0;
  originalFetch = globalThis.fetch;
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  useNN.setState({ bootstrapped: true, cards: [card], noteTypes: [noteTypeFromApi(BASIC_NOTE_TYPE)], decks: [{ id: 'deck', name: 'Study', color: 'lime', species: 'fern', createdAt: 0 }] });
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  globalThis.fetch = originalFetch; useNN.getState().reset();
  useNN.setState({ uploadMedia: originalUpload });
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});
afterAll(() => GlobalRegistrator.unregister());

async function render(props: Partial<React.ComponentProps<typeof NNCardForm>> = {}) {
  await act(async () => root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/editor">
    <AppNavigationProvider><DialogProvider><NNCardForm card={card} {...props} /></DialogProvider></AppNavigationProvider>
  </PathnameContext.Provider></AppRouterContext.Provider>));
}

function button(key: string) { return Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(key))!; }

async function renderEditor(search: URLSearchParams, screen: React.ReactNode = <NNEditor />) {
  await act(async () => root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/editor"><SearchParamsContext.Provider value={search}>
    <AppNavigationProvider><DialogProvider>{screen}</DialogProvider></AppNavigationProvider>
  </SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
}

describe('card editor', () => {
  test('preview switches numbered questions and hides a previously revealed answer', async () => {
    const cloze = cardFromApi({ ...row, renderKind: 'cloze', clozeNumber: 1, noteType: CLOZE_NOTE_TYPE,
      note: { ...row.note, fieldValues: { Text: '{{c1::Paris::city}} is in {{c2::France}}.', Extra: '' } } });
    useNN.setState({ noteTypes: [noteTypeFromApi(CLOZE_NOTE_TYPE)] });
    await render({ card: cloze });
    await act(async () => button('editor.previewToggle').click());
    const preview = container.querySelector('[role="button"]') as HTMLElement;
    expect(preview.textContent).toContain('[city] is in France');
    await act(async () => preview.click());
    expect(preview.textContent).toContain('Paris is in France');
    await act(async () => (container.querySelector('[aria-label="editor.previewQuestion"]') as HTMLButtonElement).click());
    const option = Array.from(document.querySelectorAll('[role="option"]')).find((node) => node.textContent?.includes('c2'))!;
    await act(async () => (option as HTMLElement).click());
    expect(preview.textContent).toContain('Paris is in […]');
    expect(preview.textContent).not.toContain('France');
  });

  test('preview includes reverse templates instead of always showing template zero', async () => {
    const type = { ...BASIC_NOTE_TYPE, id: 'custom', kind: 'custom' as const, templates: [
      { name: 'Forward', ord: 0, frontTemplate: '{{Front}}', backTemplate: '{{Back}}' },
      { name: 'Reverse', ord: 1, frontTemplate: '{{Back}}', backTemplate: '{{Front}}' },
    ] };
    useNN.setState({ noteTypes: [noteTypeFromApi(type)] });
    await render({ card: cardFromApi({ ...row, noteType: type }) });
    await act(async () => button('editor.previewToggle').click());
    const preview = container.querySelector('[role="button"]') as HTMLElement;
    expect(preview.textContent).toContain('Question');
    await act(async () => (container.querySelector('[aria-label="editor.previewQuestion"]') as HTMLButtonElement).click());
    const reverse = Array.from(document.querySelectorAll('[role="option"]')).find((node) => node.textContent === 'Reverse')!;
    await act(async () => (reverse as HTMLElement).click());
    expect(preview.textContent).toContain('Answer');
    expect(preview.textContent).not.toContain('Question');
  });

  test('legacy splitting previews and confirms the selected history destination', async () => {
    const clozeRow = { ...row, renderKind: 'cloze', clozeNumber: 0, noteType: CLOZE_NOTE_TYPE,
      note: { ...row.note, fieldValues: { Text: '{{c1::Paris}} {{c2::France}}', Extra: '' } } };
    useNN.setState({ noteTypes: [noteTypeFromApi(CLOZE_NOTE_TYPE)] });
    const requests: any[] = [];
    globalThis.fetch = (async (_url: any, init: any) => {
      const body = JSON.parse(init.body); requests.push(body);
      return Response.json(body.preview ? { sourceVersion: row.note.updatedAt, confirmationToken: 'split',
        impact: { willCreateCards: 1, willKeepCards: 1, willDeleteCards: 0, willDeleteReviews: 0, removedCards: [] } }
        : { note: clozeRow.note, cards: [{ ...clozeRow, clozeNumber: 2 }] });
    }) as typeof fetch;
    await render({ card: cardFromApi(clozeRow) });
    await act(async () => button('editor.cloze.split').click());
    await act(async () => (container.querySelector('[aria-label="editor.cloze.historyTarget"]') as HTMLButtonElement).click());
    const option = Array.from(document.querySelectorAll('[role="option"]')).find((node) => node.textContent === 'c2')!;
    await act(async () => (option as HTMLElement).click());
    await act(async () => button('actions.save').click());
    expect(requests).toHaveLength(1);
    expect(requests[0].clozeRetainHistoryFor).toEqual({ 0: 2 });
    const dialog = container.querySelector('[role="dialog"]')!;
    const apply = Array.from(dialog.querySelectorAll('button')).find((node) => node.textContent === 'editor.cloze.split')!;
    await act(async () => apply.click());
    expect(requests[1]).toMatchObject({ clozeRetainHistoryFor: { 0: 2 }, confirmationToken: 'split' });
  });
  test('double Save and command-Enter submit one request and retain fields on error', async () => {
    let writes = 0;
    const response = Promise.withResolvers<Response>();
    globalThis.fetch = (() => { writes++; return response.promise; }) as unknown as typeof fetch;
    await render();
    await act(async () => {
      const save = button('actions.save');
      save.click();
      save.click();
      save.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
    });
    expect(writes).toBe(1);
    expect(button('editor.saving').disabled).toBe(true);
    await act(async () => response.resolve(Response.json({ error: 'unavailable' }, { status: 503 })));
    expect(container.querySelector('textarea')!.value).toBe('Question');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(button('actions.save').disabled).toBe(false);
  });

  test('numbered cloze without a deletion stays in the editor with an actionable error', async () => {
    let writes = 0;
    globalThis.fetch = (async () => { writes++; return Response.json({ note: row.note, cards: [] }); }) as unknown as typeof fetch;
    useNN.setState({ noteTypes: [noteTypeFromApi(BASIC_NOTE_TYPE), noteTypeFromApi(CLOZE_NOTE_TYPE)] });
    const cloze = cardFromApi({ ...row, noteType: CLOZE_NOTE_TYPE, renderKind: 'cloze', clozeNumber: 1,
      note: { ...row.note, noteTypeId: CLOZE_NOTE_TYPE.id, fieldValues: { Text: 'Text without a cloze', Extra: '' } } });
    await render({ card: cloze });
    await act(async () => button('actions.save').click());
    expect(writes).toBe(0);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('editor.errors.clozeRequired');
    expect(container.querySelector('textarea')!.value).toBe('Text without a cloze');
  });

  test('missing decks and empty rendered questions cannot submit', async () => {
    let writes = 0;
    globalThis.fetch = (async () => { writes++; return Response.json({}); }) as unknown as typeof fetch;
    await render({ card: cardFromApi({ ...row, note: { ...row.note, fieldValues: { Front: '', Back: 'Answer' } } }) });
    await act(async () => button('actions.save').click());
    expect(container.textContent).toContain('editor.errors.noCards');
    expect(writes).toBe(0);
    await act(async () => useNN.setState({ decks: [] }));
    await act(async () => button('actions.save').click());
    expect(container.textContent).toContain('editor.errors.pickDeck');
    expect(writes).toBe(0);
  });

  test('image upload preserves edits made while uploading and blocks premature save', async () => {
    const upload = Promise.withResolvers<{ token: string; mediaId: string }>();
    useNN.setState({ uploadMedia: (() => upload.promise) as typeof originalUpload });
    await render();
    const fileInput = container.querySelector('input[type="file"]')!;
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [new File(['image'], 'diagram.png', { type: 'image/png' })] });
    await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
    expect(button('actions.save').disabled).toBe(true);
    const field = container.querySelector('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, 'Question with a late edit');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => upload.resolve({ token: '/m/01900000-0000-7000-8000-000000000009', mediaId: '01900000-0000-7000-8000-000000000009' }));
    expect(field.value).toContain('Question with a late edit');
    expect(field.value).toContain('![diagram](/m/');
    expect(button('actions.save').disabled).toBe(false);
  });

  test('editor fetches a deep-linked card outside the mirror and returns to its study scope after save', async () => {
    useNN.setState({ cards: [] });
    globalThis.fetch = ((url: any) => Promise.resolve(Response.json(String(url).endsWith('/preview')
      ? { impact: { willCreateCards: 0, willKeepCards: 1, willDeleteCards: 0, willDeleteReviews: 0, removedCards: [] },
        confirmationToken: 'preview', sourceVersion: row.note.updatedAt }
      : String(url).includes('/notes/') ? { note: row.note, cards: [row] } : row))) as unknown as typeof fetch;
    await renderEditor(new URLSearchParams({ card: card.id, returnTo: '/review?deck=deck' }));
    expect(container.querySelector('textarea')?.value).toBe('Question');
    await act(async () => button('editor.saveAndReturn').click());
    expect(navigations.at(-1)).toBe('/review?deck=deck');
  });

  test('missing editor card shows a recoverable error instead of a new-card form', async () => {
    useNN.setState({ cards: [] });
    globalThis.fetch = (async () => Response.json({ error: 'not_found' }, { status: 404 })) as unknown as typeof fetch;
    await renderEditor(new URLSearchParams({ card: card.id }));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.textContent).not.toContain('editor.newCard');
  });

  test('a browser focus link fetches a card outside the first page', async () => {
    useNN.setState({ cards: [] });
    globalThis.fetch = ((url: any) => Promise.resolve(Response.json(String(url).endsWith(`/cards/${card.id}`)
      ? row : String(url).includes('/tags') ? { tags: [] } : { items: [], nextCursor: null }))) as unknown as typeof fetch;
    await renderEditor(new URLSearchParams({ focus: card.id }), <NNCardsBrowser />);
    expect(container.querySelector('textarea')?.value).toBe('Question');
    expect(navigations.at(-1)).toBe('/cards');
  });

  test('quick study is single-flight and reuses the saved query on a later launch', async () => {
    const response = Promise.withResolvers<Response>();
    let writes = 0;
    let submitted: any;
    globalThis.fetch = ((_url: any, init: any) => { writes++; submitted = JSON.parse(init.body); return response.promise; }) as unknown as typeof fetch;
    await renderEditor(new URLSearchParams(), <NNCustomStudy />);
    await act(async () => {
      button('review.customStudy.quickActions.cram').click();
      button('review.customStudy.quickActions.cram').click();
    });
    expect(writes).toBe(1);
    expect(submitted.includeSuspended).toBe(false);
    await act(async () => response.resolve(Response.json({ ...submitted, id: 'filtered' })));
    expect(navigations.at(-1)).toBe('/review?filteredDeckId=filtered');
    await act(async () => button('review.customStudy.quickActions.cram').click());
    expect(writes).toBe(1);
  });

  test('cancelling a regeneration preview keeps the draft and makes no write', async () => {
    const methods: string[] = [];
    globalThis.fetch = (async (_url: any, init: any) => {
      methods.push(init.method);
      return Response.json({ sourceVersion: row.note.updatedAt, confirmationToken: 'consent', impact: {
        willCreateCards: 0, willKeepCards: 1, willDeleteCards: 1, willDeleteReviews: 7,
        removedCards: [{ id: 'sibling', front: 'Other question', reviews: 7 }],
      } });
    }) as typeof fetch;
    await render();
    await act(async () => button('actions.save').click());
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Other question (7)');
    await act(async () => (dialog.querySelector('button') as HTMLButtonElement).click());
    expect(methods).toEqual(['POST']);
    expect(container.querySelector('textarea')!.value).toBe('Question');
    expect(button('actions.save').disabled).toBe(false);
  });

  test('note conflict preserves the draft and allows an explicit rebase before another save', async () => {
    const nextVersion = '2026-09-19T00:01:00.000Z';
    const requests: any[] = [];
    let attempts = 0;
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url).includes('/cards/')) return Response.json({ ...row, note: { ...row.note, updatedAt: nextVersion, fieldValues: { Front: 'Remote question', Back: 'Answer' } } });
      const body = JSON.parse(init.body); requests.push(body);
      if (String(url).endsWith('/preview')) {
        if (++attempts === 1) return Response.json({ error: 'note_changed' }, { status: 409 });
        return Response.json({ sourceVersion: nextVersion, confirmationToken: 'current', impact: {
          willCreateCards: 0, willKeepCards: 1, willDeleteCards: 0, willDeleteReviews: 0, removedCards: [],
        } });
      }
      return Response.json({ note: { ...row.note, updatedAt: nextVersion }, cards: [row] });
    }) as typeof fetch;
    await render();
    await act(async () => button('actions.save').click());
    expect(container.querySelector('textarea')!.value).toBe('Question');
    expect(Array.from(container.querySelectorAll('textarea[readonly]')).some((field) => (field as HTMLTextAreaElement).value === 'Remote question')).toBe(true);
    await act(async () => button('editor.conflict.reviewDraft').click());
    const buttons = container.querySelector('[role="dialog"]')!.querySelectorAll('button');
    await act(async () => (buttons[buttons.length - 1] as HTMLButtonElement).click());
    await act(async () => button('actions.save').click());
    expect(requests[0].expectedUpdatedAt).toBe(row.note.updatedAt);
    expect(requests[1]).toMatchObject({ expectedUpdatedAt: nextVersion, fieldValues: { Front: 'Question' } });
    expect(requests[2]).toMatchObject({ confirmationToken: 'current', expectedUpdatedAt: nextVersion });
  });

  test('a changed type is explicitly rebased by stable field identity without losing the draft', async () => {
    const oldVersion = '2026-09-19T00:00:00.000Z';
    const newVersion = '2026-09-19T00:01:00.000Z';
    const originalType = { ...BASIC_NOTE_TYPE, updatedAt: oldVersion,
      fields: BASIC_NOTE_TYPE.fields.map((field) => ({ ...field, id: `field-${field.ord}` })) };
    const currentType = { ...originalType, updatedAt: newVersion,
      fields: originalType.fields.map((field) => field.name === 'Front' ? { ...field, name: 'Question' } : field),
      templates: originalType.templates.map((template) => ({ ...template, frontTemplate: '{{Question}}' })) };
    useNN.setState({ noteTypes: [noteTypeFromApi(originalType)] });
    const currentRow = { ...row, noteType: currentType, note: { ...row.note, updatedAt: newVersion, fieldValues: { Question: 'Remote', Back: 'Answer' } } };
    const requests: any[] = [];
    let previews = 0;
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url).endsWith('/note-types')) return Response.json([currentType]);
      if (String(url).includes('/cards/')) return Response.json(currentRow);
      const body = JSON.parse(init.body); requests.push(body);
      if (String(url).endsWith('/preview')) {
        if (++previews === 1) return Response.json({ error: 'note_type_changed' }, { status: 409 });
        return Response.json({ sourceVersion: newVersion, confirmationToken: 'rebased', impact: {
          willCreateCards: 0, willKeepCards: 1, willDeleteCards: 0, willDeleteReviews: 0, removedCards: [],
        } });
      }
      return Response.json({ note: { ...currentRow.note, fieldValues: body.fieldValues }, cards: [currentRow] });
    }) as typeof fetch;
    await render({ card: cardFromApi({ ...row, noteType: originalType }) });
    await act(async () => button('actions.save').click());
    expect(container.querySelector('textarea')!.value).toBe('Question');
    expect(useNN.getState().noteTypes[0].updatedAt).toBe(oldVersion);
    await act(async () => button('editor.conflict.reviewDraft').click());
    const buttons = container.querySelector('[role="dialog"]')!.querySelectorAll('button');
    await act(async () => (buttons[buttons.length - 1] as HTMLButtonElement).click());
    expect(container.querySelector('textarea')!.value).toBe('Question');
    await act(async () => button('actions.save').click());
    expect(requests[0].expectedTypeUpdatedAt).toBe(oldVersion);
    expect(requests[1]).toMatchObject({ expectedTypeUpdatedAt: newVersion, fieldValues: { Question: 'Question', Back: 'Answer' } });
    expect(requests[1].fieldValues.Front).toBeUndefined();
  });
});

test('a question from a later field saves with an empty first field', async () => {
  const type = { ...BASIC_NOTE_TYPE, id: 'later-field', kind: 'custom' as const, fields: [{ name: 'Extra', ord: 0 }, { name: 'Question', ord: 1 }],
    templates: [{ name: 'Question', ord: 0, frontTemplate: '{{Question}}', backTemplate: '{{Extra}}' }] };
  const edited = { ...row, noteType: type, note: { ...row.note, fieldValues: { Extra: '', Question: 'Visible question' } } };
  useNN.setState({ noteTypes: [noteTypeFromApi(type)] });
  let saved: any;
  globalThis.fetch = (async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    if (body.preview) return Response.json({ sourceVersion: row.note.updatedAt, confirmationToken: 'valid',
      impact: { willCreateCards: 0, willKeepCards: 1, willDeleteCards: 0, willDeleteReviews: 0, removedCards: [] } });
    saved = body; return Response.json({ note: { ...edited.note, ...body }, cards: [edited] });
  }) as typeof fetch;
  await render({ card: cardFromApi(edited) });
  await act(async () => button('actions.save').click());
  expect(saved.fieldValues).toEqual({ Extra: '', Question: 'Visible question' });
});

test('conversion keeping the card id replaces the editor fields and type, not only its store row', async () => {
  const source = { ...BASIC_NOTE_TYPE, updatedAt: row.note.updatedAt,
    fields: BASIC_NOTE_TYPE.fields.map((field, index) => ({ ...field, id: `source-${index}` })),
    templates: BASIC_NOTE_TYPE.templates.map((template) => ({ ...template, id: 'source-template' })) };
  const target = { ...source, id: 'converted-type', name: 'Mapped type', isBuiltin: false,
    fields: [{ id: 'question', name: 'Question', ord: 0 }, { id: 'answer', name: 'Answer', ord: 1 }],
    templates: [{ id: 'new-template', name: 'Card 1', ord: 0, frontTemplate: '{{Question}}', backTemplate: '{{Answer}}' }] };
  useNN.setState({ noteTypes: [source, target].map(noteTypeFromApi) });
  let saved: any;
  globalThis.fetch = (async (url: any) => Response.json(String(url).endsWith('/preview') ? {
    noteCount: 1, sourceVersion: row.note.updatedAt, targetVersion: row.note.updatedAt, confirmationToken: 'convert',
    impact: { willCreateCards: 0, willKeepCards: 1, willDeleteCards: 0, willDeleteReviews: 0, removedCards: [] },
    validation: { checkedNotes: 1, invalidNotes: 0, samples: [] }, fieldMapping: [], unmappedFields: [], unmappedFieldCount: 0, discardedValues: 0, discardedAlternatives: 0,
  } : { noteIds: [row.noteId], cards: [{ ...row, noteType: target, note: { ...row.note, fieldValues: { Question: 'Mapped question', Answer: 'Mapped answer' } } }] })) as unknown as typeof fetch;
  await render({ card: cardFromApi({ ...row, noteType: source }), onSaved: (card) => { saved = card; } });
  await act(async () => button('noteTypes.convert.open').click());
  const select = document.querySelector('[aria-label="noteTypes.convert.target"]') as HTMLSelectElement;
  await act(async () => { select.value = target.id; select.dispatchEvent(new Event('change', { bubbles: true })); });
  const modalButton = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find((button) => button.textContent?.includes(text))!;
  await act(async () => modalButton('noteTypes.kind.preview').click());
  await act(async () => modalButton('noteTypes.convert.apply').click());
  expect(saved.id).toBe(row.id);
  expect(container.textContent).toContain('Mapped type');
  expect((container.querySelector('[aria-label="Question"]') as HTMLTextAreaElement).value).toBe('Mapped question');
  expect((container.querySelector('[aria-label="Answer"]') as HTMLTextAreaElement).value).toBe('Mapped answer');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

test('a successful conversion removes the old scoped rows even when refreshing the list fails', async () => {
  const source = { ...BASIC_NOTE_TYPE, updatedAt: row.note.updatedAt,
    fields: BASIC_NOTE_TYPE.fields.map((field, index) => ({ ...field, id: `source-${index}` })),
    templates: BASIC_NOTE_TYPE.templates.map((template) => ({ ...template, id: 'source-template' })) };
  const target = { ...source, id: 'target-type', name: 'Target', isBuiltin: false, templates: [{ ...source.templates[0], id: 'target-template' }] };
  useNN.setState({ noteTypes: [source, target].map(noteTypeFromApi), cards: [cardFromApi({ ...row, noteType: source })] });
  let applied = false;
  globalThis.fetch = (async (url: any) => {
    const path = String(url);
    if (path.includes('/cards/tags')) return Response.json({ tags: [] });
    if (path.includes('/cards/search')) return applied ? Response.json({ error: 'unavailable' }, { status: 503 }) : Response.json({ items: [{ ...row, noteType: source }], nextCursor: null });
    if (path.endsWith('/convert/preview')) return Response.json({ noteCount: 1, sourceVersion: row.note.updatedAt, targetVersion: row.note.updatedAt, confirmationToken: 'convert',
      impact: { willCreateCards: 0, willKeepCards: 1, willDeleteCards: 0, willDeleteReviews: 0, removedCards: [] }, validation: { checkedNotes: 1, invalidNotes: 0, samples: [] },
      fieldMapping: [], unmappedFields: [], unmappedFieldCount: 0, discardedValues: 0, discardedAlternatives: 0 });
    if (path.endsWith('/notes/convert')) { applied = true; return Response.json({ noteIds: [row.noteId], cards: [{ ...row, noteType: target }] }); }
    return Response.json({ items: [] });
  }) as unknown as typeof fetch;
  await renderEditor(new URLSearchParams({ noteTypeId: source.id!, convertTo: target.id }), <NNCardsBrowser />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
  await act(async () => (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
  await act(async () => button('noteTypes.convert.open').click());
  const modalButton = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find((button) => button.textContent?.includes(text))!;
  await act(async () => modalButton('noteTypes.kind.preview').click());
  await act(async () => modalButton('noteTypes.convert.apply').click());
  expect(applied).toBe(true);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(useNN.getState().cards[0].noteType?.id).toBe(target.id);
  expect(container.textContent).not.toContain('Question');
});
