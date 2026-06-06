import { beforeEach, describe, expect, test } from 'bun:test';
import { buildApp } from '../src/app.ts';
import { callApp, resetTestDb, seedBasicCard, signUpAndCookie, uniqueEmail } from './helpers.ts';

const app = buildApp();

async function setupCard(): Promise<{ cookie: string; cardId: string; deckId: string }> {
  const { cookie } = await signUpAndCookie(app, uniqueEmail());
  // Touch /profile so lazy-create runs → streak rollup has somewhere to write.
  await callApp(app, 'GET', '/profile', { cookie });
  const deck = await (
    await callApp(app, 'POST', '/decks', { cookie, body: { name: 'D' } })
  ).json<{ id: string }>();
  // Card content is derived from a note now (note-types M1): seed a Basic note.
  const card = await seedBasicCard(app, cookie, {
    deckId: deck.id,
    front: 'der Hund',
    back: 'the dog',
  });
  return { cookie, cardId: card.id, deckId: deck.id };
}

describe('reviews', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  test('Good grade advances the card and appends a review row', async () => {
    const { cookie, cardId } = await setupCard();
    const res = await callApp(app, 'POST', '/reviews', {
      cookie,
      body: { cardId, rating: 3, durationMs: 2000 },
    });
    expect(res.status).toBe(200);
    const body = await res.json<{
      card: { state: string; reps: number; lapses: number };
      review: { rating: number; durationMs: number };
      profile: { xp: number; streakDays: number; plantStage: number };
      leeched: boolean;
    }>();
    expect(body.card.state).not.toBe('new');
    expect(body.card.reps).toBe(1);
    expect(body.card.lapses).toBe(0);
    expect(body.review.rating).toBe(3);
    expect(body.review.durationMs).toBe(2000);
    // Good = 10 XP, streak starts at 1.
    expect(body.profile.xp).toBe(10);
    expect(body.profile.streakDays).toBe(1);
    expect(body.profile.plantStage).toBe(0);
    expect(body.leeched).toBe(false);
  });

  test('Again on a new card gives 0 XP but still counts toward streak', async () => {
    const { cookie, cardId } = await setupCard();
    const res = await callApp(app, 'POST', '/reviews', {
      cookie,
      body: { cardId, rating: 1 },
    });
    const body = await res.json<{ profile: { xp: number; streakDays: number } }>();
    expect(body.profile.xp).toBe(0);
    expect(body.profile.streakDays).toBe(1);
  });

  test('Easy = 15 XP', async () => {
    const { cookie, cardId } = await setupCard();
    const res = await callApp(app, 'POST', '/reviews', {
      cookie,
      body: { cardId, rating: 4 },
    });
    const body = await res.json<{ profile: { xp: number } }>();
    expect(body.profile.xp).toBe(15);
  });

  test('cannot grade a card that belongs to another user', async () => {
    const { cookie: aCookie } = await signUpAndCookie(app, uniqueEmail('a'));
    const { cookie: bCookie } = await signUpAndCookie(app, uniqueEmail('b'));
    const aDeck = await (
      await callApp(app, 'POST', '/decks', { cookie: aCookie, body: { name: 'A' } })
    ).json<{ id: string }>();
    const aCard = await seedBasicCard(app, aCookie, { deckId: aDeck.id, front: 'x', back: 'y' });
    const res = await callApp(app, 'POST', '/reviews', {
      cookie: bCookie,
      body: { cardId: aCard.id, rating: 3 },
    });
    expect(res.status).toBe(404);
  });

  test('cannot grade a suspended card (409)', async () => {
    const { cookie, cardId } = await setupCard();
    await callApp(app, 'PATCH', `/cards/${cardId}`, { cookie, body: { suspended: true } });
    const res = await callApp(app, 'POST', '/reviews', {
      cookie,
      body: { cardId, rating: 3 },
    });
    expect(res.status).toBe(409);
  });

  test('GET /reviews/count reports totals', async () => {
    const { cookie, cardId } = await setupCard();
    const zero = await (await callApp(app, 'GET', '/reviews/count', { cookie })).json<{
      count: number;
    }>();
    expect(zero.count).toBe(0);

    await callApp(app, 'POST', '/reviews', { cookie, body: { cardId, rating: 3 } });
    const after = await (await callApp(app, 'GET', '/reviews/count', { cookie })).json<{
      count: number;
    }>();
    expect(after.count).toBe(1);
  });

  test('GET /reviews filters by since', async () => {
    const { cookie, cardId } = await setupCard();
    await callApp(app, 'POST', '/reviews', { cookie, body: { cardId, rating: 3 } });
    const future = Date.now() + 60_000;
    const none = await (
      await callApp(app, 'GET', `/reviews?since=${future}`, { cookie })
    ).json<unknown[]>();
    expect(none).toEqual([]);
    const all = await (await callApp(app, 'GET', '/reviews', { cookie })).json<unknown[]>();
    expect(all.length).toBe(1);
  });
});
