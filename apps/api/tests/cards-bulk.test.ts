import { beforeEach, describe, expect, test } from 'bun:test';
import { buildApp } from '../src/app.ts';
import { callApp, resetTestDb, signUpAndCookie, uniqueEmail } from './helpers.ts';

const app = buildApp();

async function freshDeck(cookie: string, name = 'Test'): Promise<string> {
  const res = await callApp(app, 'POST', '/decks', { cookie, body: { name } });
  return (await res.json<{ id: string }>()).id;
}

async function newCard(
  cookie: string,
  deckId: string,
  front = 'f',
  back = 'b',
  tags: string[] = [],
): Promise<string> {
  const res = await callApp(app, 'POST', '/cards', {
    cookie,
    body: { deckId, front, back, tags },
  });
  return (await res.json<{ id: string }>()).id;
}

async function getCard(cookie: string, id: string): Promise<Record<string, unknown> | undefined> {
  const res = await callApp(app, 'GET', '/cards?includeSuspended=true&limit=1000', { cookie });
  const body = await res.json<{ items: Array<Record<string, unknown>> }>();
  return body.items.find((c) => c.id === id);
}

function bulk(cookie: string, body: unknown) {
  return callApp(app, 'POST', '/cards/bulk', { cookie, body });
}

describe('POST /cards/bulk', () => {
  let cookie: string;
  let deckA: string;
  let deckB: string;

  beforeEach(async () => {
    await resetTestDb();
    const u = await signUpAndCookie(app, uniqueEmail('bulk'));
    cookie = u.cookie;
    deckA = await freshDeck(cookie, 'A');
    deckB = await freshDeck(cookie, 'B');
  });

  test('move → reassigns deckId for owned cards', async () => {
    const c1 = await newCard(cookie, deckA);
    const c2 = await newCard(cookie, deckA);
    const res = await bulk(cookie, {
      action: 'move',
      cardIds: [c1, c2],
      payload: { deckId: deckB },
    });
    expect(res.status).toBe(200);
    expect((await res.json<{ updated: number }>()).updated).toBe(2);
    expect((await getCard(cookie, c1))!.deckId).toBe(deckB);
    expect((await getCard(cookie, c2))!.deckId).toBe(deckB);
  });

  test('move → 400 deck_not_found for unknown/foreign deck', async () => {
    const c1 = await newCard(cookie, deckA);
    const res = await bulk(cookie, {
      action: 'move',
      cardIds: [c1],
      payload: { deckId: '00000000-0000-4000-8000-000000000000' },
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toBe('deck_not_found');
    // card not moved
    expect((await getCard(cookie, c1))!.deckId).toBe(deckA);
  });

  test('move → 400 deck_required when payload omitted', async () => {
    const c1 = await newCard(cookie, deckA);
    const res = await bulk(cookie, { action: 'move', cardIds: [c1] });
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toBe('deck_required');
  });

  test('delete → removes owned cards and returns count', async () => {
    const c1 = await newCard(cookie, deckA);
    const c2 = await newCard(cookie, deckA);
    const c3 = await newCard(cookie, deckA);
    const res = await bulk(cookie, { action: 'delete', cardIds: [c1, c2] });
    expect(res.status).toBe(200);
    expect((await res.json<{ deleted: number }>()).deleted).toBe(2);
    expect(await getCard(cookie, c1)).toBeUndefined();
    expect(await getCard(cookie, c2)).toBeUndefined();
    expect(await getCard(cookie, c3)).toBeTruthy();
  });

  test('suspend / unsuspend flips the flag', async () => {
    const c1 = await newCard(cookie, deckA);
    const c2 = await newCard(cookie, deckA);

    const s = await bulk(cookie, { action: 'suspend', cardIds: [c1, c2] });
    expect((await s.json<{ updated: number }>()).updated).toBe(2);
    expect((await getCard(cookie, c1))!.suspended).toBe(true);
    expect((await getCard(cookie, c2))!.suspended).toBe(true);

    const u = await bulk(cookie, { action: 'unsuspend', cardIds: [c1] });
    expect((await u.json<{ updated: number }>()).updated).toBe(1);
    expect((await getCard(cookie, c1))!.suspended).toBe(false);
    expect((await getCard(cookie, c2))!.suspended).toBe(true);
  });

  test('addTag dedups (only updates cards missing the tag)', async () => {
    const c1 = await newCard(cookie, deckA, 'f1', 'b1', ['x']);
    const c2 = await newCard(cookie, deckA, 'f2', 'b2', []);

    const res = await bulk(cookie, {
      action: 'addTag',
      cardIds: [c1, c2],
      payload: { tag: 'x' },
    });
    expect(res.status).toBe(200);
    // c1 already has 'x' → skipped; only c2 updated.
    expect((await res.json<{ updated: number }>()).updated).toBe(1);
    expect((await getCard(cookie, c1))!.tags).toEqual(['x']); // no duplicate
    expect((await getCard(cookie, c2))!.tags).toEqual(['x']);
  });

  test('addTag requires a tag → 400', async () => {
    const c1 = await newCard(cookie, deckA);
    const res = await bulk(cookie, { action: 'addTag', cardIds: [c1] });
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toBe('tag_required');
  });

  test('removeTag strips the tag', async () => {
    const c1 = await newCard(cookie, deckA, 'f1', 'b1', ['keep', 'drop']);
    const c2 = await newCard(cookie, deckA, 'f2', 'b2', ['drop']);
    const res = await bulk(cookie, {
      action: 'removeTag',
      cardIds: [c1, c2],
      payload: { tag: 'drop' },
    });
    expect(res.status).toBe(200);
    expect((await res.json<{ updated: number }>()).updated).toBe(2);
    expect((await getCard(cookie, c1))!.tags).toEqual(['keep']);
    expect((await getCard(cookie, c2))!.tags).toEqual([]);
  });

  test('ownership: foreign ids are silent no-ops (no leak, no error)', async () => {
    const mine = await newCard(cookie, deckA, 'mine');

    const other = await signUpAndCookie(app, uniqueEmail('bulk-other'));
    const otherDeck = await freshDeck(other.cookie, 'Theirs');
    const theirs = await newCard(other.cookie, otherDeck, 'theirs');

    // I try to suspend my card + their card. Only mine is affected.
    const res = await bulk(cookie, { action: 'suspend', cardIds: [mine, theirs] });
    expect(res.status).toBe(200);
    expect((await res.json<{ updated: number }>()).updated).toBe(1);
    expect((await getCard(cookie, mine))!.suspended).toBe(true);
    // Their card untouched.
    expect((await getCard(other.cookie, theirs))!.suspended).toBe(false);
  });

  test('ownership: deleting a foreign card is a no-op', async () => {
    const other = await signUpAndCookie(app, uniqueEmail('bulk-del-other'));
    const otherDeck = await freshDeck(other.cookie, 'Theirs');
    const theirs = await newCard(other.cookie, otherDeck, 'theirs');

    const res = await bulk(cookie, { action: 'delete', cardIds: [theirs] });
    expect(res.status).toBe(200);
    expect((await res.json<{ deleted: number }>()).deleted).toBe(0);
    // Their card still exists.
    expect(await getCard(other.cookie, theirs)).toBeTruthy();
  });

  test('empty cardIds → 400 (minItems)', async () => {
    const res = await bulk(cookie, { action: 'delete', cardIds: [] });
    expect(res.status).toBe(400);
  });

  test('move atomicity: a failed deck check leaves all cards unchanged', async () => {
    const c1 = await newCard(cookie, deckA);
    const c2 = await newCard(cookie, deckA);
    // Foreign deck → 400 before any write; both cards remain in deckA.
    const res = await bulk(cookie, {
      action: 'move',
      cardIds: [c1, c2],
      payload: { deckId: '00000000-0000-4000-8000-000000000000' },
    });
    expect(res.status).toBe(400);
    expect((await getCard(cookie, c1))!.deckId).toBe(deckA);
    expect((await getCard(cookie, c2))!.deckId).toBe(deckA);
  });
});
