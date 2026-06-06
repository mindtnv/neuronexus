import { beforeEach, describe, expect, test } from 'bun:test';
import { buildApp } from '../src/app.ts';
import { callApp, resetTestDb, seedBasicCard, signUpAndCookie, uniqueEmail } from './helpers.ts';

const app = buildApp();

describe('profile GDPR', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  test('GET /profile/export returns the full snapshot', async () => {
    const email = uniqueEmail('export');
    const { cookie } = await signUpAndCookie(app, email);
    await callApp(app, 'GET', '/profile', { cookie });
    const deck = await (
      await callApp(app, 'POST', '/decks', { cookie, body: { name: 'D' } })
    ).json<{ id: string }>();
    // Card content is derived from a note now (note-types M1). Seeding a Basic
    // note also creates the user's Basic note-type → both appear in the export.
    await seedBasicCard(app, cookie, { deckId: deck.id, front: 'hi', back: 'hola' });

    const res = await callApp(app, 'GET', '/profile/export', { cookie });
    expect(res.status).toBe(200);
    const body = await res.json<{
      exportedAt: string;
      user: { email: string };
      profile: unknown;
      decks: unknown[];
      noteTypes: unknown[];
      notes: unknown[];
      cards: unknown[];
      reviews: unknown[];
    }>();
    expect(body.exportedAt).toBeTruthy();
    expect(body.user.email).toBe(email);
    expect(body.profile).toBeTruthy();
    expect(body.decks.length).toBe(1);
    // The export now includes the note-types model (notes + note-types).
    expect(body.noteTypes.length).toBe(1);
    expect(body.notes.length).toBe(1);
    expect(body.cards.length).toBe(1);
    expect(Array.isArray(body.reviews)).toBe(true);
  });

  test('DELETE /profile requires matching confirmEmail', async () => {
    const email = uniqueEmail('del');
    const { cookie } = await signUpAndCookie(app, email);
    await callApp(app, 'GET', '/profile', { cookie });

    const wrong = await callApp(app, 'DELETE', '/profile', {
      cookie,
      body: { confirmEmail: 'nope@example.com' },
    });
    expect(wrong.status).toBe(400);
  });

  test('DELETE /profile cascades: decks + cards + profile + session gone', async () => {
    const email = uniqueEmail('bye');
    const { cookie } = await signUpAndCookie(app, email);
    await callApp(app, 'GET', '/profile', { cookie });
    const deck = await (
      await callApp(app, 'POST', '/decks', { cookie, body: { name: 'D' } })
    ).json<{ id: string }>();
    await seedBasicCard(app, cookie, { deckId: deck.id, front: 'a', back: 'b' });

    const del = await callApp(app, 'DELETE', '/profile', {
      cookie,
      body: { confirmEmail: email },
    });
    expect(del.status).toBe(200);

    // Cookie is now stale; any protected call should 401.
    const after = await callApp(app, 'GET', '/profile', { cookie });
    expect(after.status).toBe(401);
    const decksAfter = await callApp(app, 'GET', '/decks', { cookie });
    expect(decksAfter.status).toBe(401);
  });

  test('PATCH /profile switches plant species and persists it (all unlocked by default)', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail('species'));
    await callApp(app, 'GET', '/profile', { cookie });
    const res = await callApp(app, 'PATCH', '/profile', {
      cookie,
      body: { plantSpecies: 'sakura' },
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ plantSpecies: string }>();
    expect(body.plantSpecies).toBe('sakura');
  });

  test('PATCH /profile accepts fern (always unlocked by default)', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail('fern'));
    await callApp(app, 'GET', '/profile', { cookie });
    const res = await callApp(app, 'PATCH', '/profile', {
      cookie,
      body: { plantSpecies: 'fern' },
    });
    expect(res.status).toBe(200);
  });
});
