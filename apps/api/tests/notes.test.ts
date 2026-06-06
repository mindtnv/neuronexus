// Notes CRUD + generation integration tests (Milestone 1, Phase 4).
//
// Covers: POST → card generation (count, render cols, FSRS init, sanitization),
// PATCH → regeneration that PRESERVES FSRS on surviving templateOrds while
// inserting/deleting changed ords, DELETE → cascade, and ownership scoping.

import { beforeEach, describe, expect, test } from 'bun:test';
import { buildApp } from '../src/app.ts';
import { callApp, resetTestDb, signUpAndCookie, uniqueEmail } from './helpers.ts';

const app = buildApp();

async function freshDeck(cookie: string, name = 'D'): Promise<string> {
  return (
    await (await callApp(app, 'POST', '/decks', { cookie, body: { name } })).json<{ id: string }>()
  ).id;
}

/** A two-template note-type: Card 1 always renders, Card 2 only when Extra set. */
async function twoTemplateType(cookie: string): Promise<string> {
  const res = await callApp(app, 'POST', '/note-types', {
    cookie,
    body: {
      name: 'Front/Back+Reverse',
      kind: 'custom',
      fields: [
        { name: 'Front', ord: 0 },
        { name: 'Back', ord: 1 },
      ],
      templates: [
        { name: 'Card 1', ord: 0, frontTemplate: '{{Front}}', backTemplate: '{{Back}}' },
        // reverse card only generates when Back is non-empty (empty-front skip).
        { name: 'Card 2', ord: 1, frontTemplate: '{{Back}}', backTemplate: '{{Front}}' },
      ],
    },
  });
  return (await res.json<{ id: string }>()).id;
}

async function basicType(cookie: string): Promise<string> {
  const res = await callApp(app, 'POST', '/note-types', {
    cookie,
    body: {
      name: 'Basic',
      kind: 'basic',
      fields: [
        { name: 'Front', ord: 0 },
        { name: 'Back', ord: 1 },
      ],
      templates: [
        { name: 'Card 1', ord: 0, frontTemplate: '{{Front}}', backTemplate: '{{Front}}<hr>{{Back}}' },
      ],
    },
  });
  return (await res.json<{ id: string }>()).id;
}

describe('notes', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  test('POST generates one card per non-empty template with render cols + FSRS init', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);
    const noteTypeId = await twoTemplateType(cookie);

    const res = await callApp(app, 'POST', '/notes', {
      cookie,
      body: { noteTypeId, fieldValues: { Front: 'Hund', Back: 'dog' }, deckId, tags: ['a1'] },
    });
    expect(res.status).toBe(200);
    const body = await res.json<{
      note: { id: string; fieldValues: Record<string, string>; tags: string[] };
      cards: Array<{
        templateOrd: number;
        renderFrontText: string;
        renderBackText: string;
        renderText: string;
        renderKind: string;
        deckId: string;
        state: string;
        reps: number;
        lapses: number;
      }>;
    }>();

    // both templates render (Front + Back both non-empty).
    expect(body.cards.length).toBe(2);
    const c0 = body.cards.find((c) => c.templateOrd === 0)!;
    const c1 = body.cards.find((c) => c.templateOrd === 1)!;
    expect(c0.renderFrontText).toBe('Hund');
    expect(c0.renderBackText).toBe('dog');
    expect(c1.renderFrontText).toBe('dog'); // reverse
    expect(c1.renderBackText).toBe('Hund');
    // render cols + FSRS init
    expect(c0.renderText).toContain('Hund');
    expect(c0.renderKind).toBe('custom');
    expect(c0.deckId).toBe(deckId);
    expect(c0.state).toBe('new');
    expect(c0.reps).toBe(0);
    expect(c0.lapses).toBe(0);
    // note carries tags + field values
    expect(body.note.tags).toEqual(['a1']);
    expect(body.note.fieldValues).toEqual({ Front: 'Hund', Back: 'dog' });
  });

  test('POST skips a template whose rendered front is empty (optional reverse)', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);
    const noteTypeId = await twoTemplateType(cookie);

    // Back empty → Card 2 (front = {{Back}}) renders empty → skipped.
    const res = await callApp(app, 'POST', '/notes', {
      cookie,
      body: { noteTypeId, fieldValues: { Front: 'Hund', Back: '' }, deckId },
    });
    const body = await res.json<{ cards: Array<{ templateOrd: number }> }>();
    expect(body.cards.length).toBe(1);
    expect(body.cards[0]!.templateOrd).toBe(0);
  });

  test('POST sanitizes field values before generating render cols', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);
    const noteTypeId = await basicType(cookie);

    const res = await callApp(app, 'POST', '/notes', {
      cookie,
      body: {
        noteTypeId,
        fieldValues: { Front: '<b>Hund</b><script>alert(1)</script>', Back: 'dog<img src=x onerror=alert(1)>' },
        deckId,
      },
    });
    const body = await res.json<{
      note: { fieldValues: Record<string, string> };
      cards: Array<{ renderText: string }>;
    }>();
    // stored field value is sanitized HTML (script gone, <b> kept)
    expect(body.note.fieldValues.Front).toBe('<b>Hund</b>');
    expect(body.note.fieldValues.Back.toLowerCase()).not.toContain('onerror');
    // plaintext search col has neither tags nor the script payload
    expect(body.cards[0]!.renderText).toContain('Hund');
    expect(body.cards[0]!.renderText.toLowerCase()).not.toContain('alert');
    expect(body.cards[0]!.renderText).not.toContain('<b>');
  });

  test('POST rejects a deck the user does not own', async () => {
    const { cookie: a } = await signUpAndCookie(app, uniqueEmail('a'));
    const { cookie: b } = await signUpAndCookie(app, uniqueEmail('b'));
    const bDeck = await freshDeck(b, 'bob');
    const noteTypeId = await basicType(a);
    const res = await callApp(app, 'POST', '/notes', {
      cookie: a,
      body: { noteTypeId, fieldValues: { Front: 'x', Back: 'y' }, deckId: bDeck },
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toBe('deck_not_found');
  });

  test('POST rejects a note-type the user cannot see', async () => {
    const { cookie: a } = await signUpAndCookie(app, uniqueEmail('a'));
    const { cookie: b } = await signUpAndCookie(app, uniqueEmail('b'));
    const aDeck = await freshDeck(a);
    const bType = await basicType(b);
    const res = await callApp(app, 'POST', '/notes', {
      cookie: a,
      body: { noteTypeId: bType, fieldValues: { Front: 'x', Back: 'y' }, deckId: aDeck },
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toBe('note_type_not_found');
  });

  test('PATCH re-renders surviving template card while PRESERVING FSRS', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);
    const noteTypeId = await basicType(cookie);

    const created = await (
      await callApp(app, 'POST', '/notes', {
        cookie,
        body: { noteTypeId, fieldValues: { Front: 'Hund', Back: 'dog' }, deckId },
      })
    ).json<{ note: { id: string }; cards: Array<{ id: string }> }>();
    const cardId = created.cards[0]!.id;

    // grade → non-default FSRS state.
    await callApp(app, 'POST', '/reviews', { cookie, body: { cardId, rating: 3 } });

    // edit the Front field value → render col changes, template ord 0 survives.
    const res = await callApp(app, 'PATCH', `/notes/${created.note.id}`, {
      cookie,
      body: { fieldValues: { Front: 'Katze', Back: 'cat' } },
    });
    expect(res.status).toBe(200);
    const body = await res.json<{
      cards: Array<{ id: string; templateOrd: number; renderFrontText: string; reps: number; state: string }>;
    }>();
    const card = body.cards.find((c) => c.templateOrd === 0)!;
    // same card row (id preserved) …
    expect(card.id).toBe(cardId);
    // … render col refreshed …
    expect(card.renderFrontText).toBe('Katze');
    // … FSRS state preserved.
    expect(card.reps).toBe(1);
    expect(card.state).not.toBe('new');
  });

  test('PATCH inserts a card for a newly-non-empty reverse template (fresh FSRS)', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);
    const noteTypeId = await twoTemplateType(cookie);

    // Back empty → only Card 1.
    const created = await (
      await callApp(app, 'POST', '/notes', {
        cookie,
        body: { noteTypeId, fieldValues: { Front: 'Hund', Back: '' }, deckId },
      })
    ).json<{ note: { id: string }; cards: Array<{ id: string; templateOrd: number }> }>();
    expect(created.cards.length).toBe(1);
    const firstCardId = created.cards[0]!.id;

    // grade the surviving card.
    await callApp(app, 'POST', '/reviews', { cookie, body: { cardId: firstCardId, rating: 3 } });

    // fill Back → Card 2 now generates.
    const res = await callApp(app, 'PATCH', `/notes/${created.note.id}`, {
      cookie,
      body: { fieldValues: { Front: 'Hund', Back: 'dog' } },
    });
    const body = await res.json<{
      cards: Array<{ id: string; templateOrd: number; reps: number; deckId: string }>;
    }>();
    expect(body.cards.length).toBe(2);
    const survivor = body.cards.find((c) => c.templateOrd === 0)!;
    const inserted = body.cards.find((c) => c.templateOrd === 1)!;
    // survivor keeps FSRS …
    expect(survivor.id).toBe(firstCardId);
    expect(survivor.reps).toBe(1);
    // … inserted card has fresh FSRS + inherits the note's deck.
    expect(inserted.reps).toBe(0);
    expect(inserted.deckId).toBe(deckId);
  });

  test('PATCH deletes the card for a now-empty template', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);
    const noteTypeId = await twoTemplateType(cookie);

    const created = await (
      await callApp(app, 'POST', '/notes', {
        cookie,
        body: { noteTypeId, fieldValues: { Front: 'Hund', Back: 'dog' }, deckId },
      })
    ).json<{ note: { id: string }; cards: Array<{ templateOrd: number }> }>();
    expect(created.cards.length).toBe(2);

    // clear Back → Card 2 (front = {{Back}}) no longer renders → its card is removed.
    const res = await callApp(app, 'PATCH', `/notes/${created.note.id}`, {
      cookie,
      body: { fieldValues: { Front: 'Hund', Back: '' } },
    });
    const body = await res.json<{ cards: Array<{ templateOrd: number }> }>();
    expect(body.cards.length).toBe(1);
    expect(body.cards[0]!.templateOrd).toBe(0);
  });

  test('DELETE removes the note and cascades to its cards', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const deckId = await freshDeck(cookie);
    const noteTypeId = await basicType(cookie);
    const created = await (
      await callApp(app, 'POST', '/notes', {
        cookie,
        body: { noteTypeId, fieldValues: { Front: 'Hund', Back: 'dog' }, deckId },
      })
    ).json<{ note: { id: string } }>();

    const before = await (await callApp(app, 'GET', '/cards', { cookie })).json<{ items: unknown[] }>();
    expect(before.items.length).toBe(1);

    const del = await callApp(app, 'DELETE', `/notes/${created.note.id}`, { cookie });
    expect(del.status).toBe(200);

    const after = await (await callApp(app, 'GET', '/cards', { cookie })).json<{ items: unknown[] }>();
    expect(after.items.length).toBe(0);
  });

  test('DELETE refuses a foreign note', async () => {
    const { cookie: a } = await signUpAndCookie(app, uniqueEmail('a'));
    const { cookie: b } = await signUpAndCookie(app, uniqueEmail('b'));
    const deckId = await freshDeck(a);
    const noteTypeId = await basicType(a);
    const created = await (
      await callApp(app, 'POST', '/notes', {
        cookie: a,
        body: { noteTypeId, fieldValues: { Front: 'x', Back: 'y' }, deckId },
      })
    ).json<{ note: { id: string } }>();

    const del = await callApp(app, 'DELETE', `/notes/${created.note.id}`, { cookie: b });
    expect(del.status).toBe(404);
  });
});
