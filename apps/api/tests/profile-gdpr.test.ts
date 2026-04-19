import { beforeEach, describe, expect, test } from 'bun:test';
import { buildApp } from '../src/app.ts';
import { callApp, resetTestDb, signUpAndCookie, uniqueEmail } from './helpers.ts';

const app = buildApp();

describe('profile GDPR', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  test('GET /profile/export returns the full snapshot', async () => {
    const email = uniqueEmail('export');
    const { cookie } = await signUpAndCookie(app, email);
    const deck = await (
      await callApp(app, 'POST', '/decks', { cookie, body: { name: 'D' } })
    ).json<{ id: string }>();
    await callApp(app, 'POST', '/cards', {
      cookie,
      body: { deckId: deck.id, front: 'hi', back: 'hola' },
    });

    const res = await callApp(app, 'GET', '/profile/export', { cookie });
    expect(res.status).toBe(200);
    const body = await res.json<{
      exportedAt: string;
      user: { email: string };
      profile: unknown;
      decks: unknown[];
      cards: unknown[];
      reviews: unknown[];
      achievements: unknown[];
    }>();
    expect(body.exportedAt).toBeTruthy();
    expect(body.user.email).toBe(email);
    expect(body.profile).toBeTruthy();
    expect(body.decks.length).toBe(1);
    expect(body.cards.length).toBe(1);
    expect(Array.isArray(body.reviews)).toBe(true);
    expect(Array.isArray(body.achievements)).toBe(true);
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
    await callApp(app, 'POST', '/cards', {
      cookie,
      body: { deckId: deck.id, front: 'a', back: 'b' },
    });

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

  test('PATCH /profile refuses species that is not unlocked', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail('species'));
    const res = await callApp(app, 'PATCH', '/profile', {
      cookie,
      body: { plantSpecies: 'sakura' },
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('species_locked');
  });

  test('PATCH /profile accepts fern (always unlocked by default)', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail('fern'));
    const res = await callApp(app, 'PATCH', '/profile', {
      cookie,
      body: { plantSpecies: 'fern' },
    });
    expect(res.status).toBe(200);
  });
});
