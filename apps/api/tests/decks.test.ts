import { beforeEach, describe, expect, test } from 'bun:test';
import { buildApp } from '../src/app.ts';
import { callApp, resetTestDb, signUpAndCookie, uniqueEmail } from './helpers.ts';

const app = buildApp();

describe('decks', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  test('CRUD roundtrip', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());

    // Create
    const created = await callApp(app, 'POST', '/decks', {
      cookie,
      body: { name: 'Languages', color: 'amber' },
    });
    expect(created.status).toBe(200);
    const d = await created.json<{ id: string; name: string; color: string }>();
    expect(d.name).toBe('Languages');
    expect(d.color).toBe('amber');

    // List
    const list = await callApp(app, 'GET', '/decks', { cookie });
    const all = await list.json<{ id: string }[]>();
    expect(all.map((x) => x.id)).toContain(d.id);

    // Update
    const patched = await callApp(app, 'PATCH', `/decks/${d.id}`, {
      cookie,
      body: { name: 'Langs', color: 'sky' },
    });
    const pd = await patched.json<{ name: string; color: string }>();
    expect(pd.name).toBe('Langs');
    expect(pd.color).toBe('sky');

    // Delete
    const del = await callApp(app, 'DELETE', `/decks/${d.id}`, { cookie });
    expect(del.status).toBe(200);
    const after = await callApp(app, 'GET', '/decks', { cookie });
    const left = await after.json<{ id: string }[]>();
    expect(left.find((x) => x.id === d.id)).toBeUndefined();
  });

  test('parent delete cascades to children and their cards', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const parent = await (
      await callApp(app, 'POST', '/decks', { cookie, body: { name: 'Langs' } })
    ).json<{ id: string }>();
    const child = await (
      await callApp(app, 'POST', '/decks', {
        cookie,
        body: { name: 'German', parentId: parent.id },
      })
    ).json<{ id: string }>();
    const card = await (
      await callApp(app, 'POST', '/cards', {
        cookie,
        body: { deckId: child.id, front: 'Hund', back: 'dog' },
      })
    ).json<{ id: string }>();

    // Sanity
    expect(parent.id).toBeTruthy();
    expect(child.id).toBeTruthy();
    expect(card.id).toBeTruthy();

    // Delete the root → everything goes.
    const del = await callApp(app, 'DELETE', `/decks/${parent.id}`, { cookie });
    expect(del.status).toBe(200);

    const decks = await (await callApp(app, 'GET', '/decks', { cookie })).json<unknown[]>();
    const cards = await (await callApp(app, 'GET', '/cards', { cookie })).json<{ items: unknown[] }>();
    expect(decks).toEqual([]);
    expect(cards.items).toEqual([]);
  });

  test('cannot set parentId to self (cycle guard)', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const d = await (
      await callApp(app, 'POST', '/decks', { cookie, body: { name: 'D' } })
    ).json<{ id: string }>();
    const res = await callApp(app, 'PATCH', `/decks/${d.id}`, {
      cookie,
      body: { parentId: d.id },
    });
    expect(res.status).toBe(400);
  });

  test('cannot set parentId to a descendant (cycle guard)', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const a = await (
      await callApp(app, 'POST', '/decks', { cookie, body: { name: 'A' } })
    ).json<{ id: string }>();
    const b = await (
      await callApp(app, 'POST', '/decks', {
        cookie,
        body: { name: 'B', parentId: a.id },
      })
    ).json<{ id: string }>();
    const res = await callApp(app, 'PATCH', `/decks/${a.id}`, {
      cookie,
      body: { parentId: b.id },
    });
    expect(res.status).toBe(400);
  });

  test('users cannot see each others decks', async () => {
    const { cookie: aliceCookie } = await signUpAndCookie(app, uniqueEmail('alice'));
    const { cookie: bobCookie } = await signUpAndCookie(app, uniqueEmail('bob'));
    await callApp(app, 'POST', '/decks', {
      cookie: aliceCookie,
      body: { name: 'Alice private' },
    });
    const bobList = await (await callApp(app, 'GET', '/decks', { cookie: bobCookie })).json<
      unknown[]
    >();
    expect(bobList).toEqual([]);
  });
});
