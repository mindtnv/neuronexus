import { beforeEach, describe, expect, test } from 'bun:test';
import { buildApp } from '../src/app.ts';
import { callApp, resetTestDb, signUpAndCookie, uniqueEmail } from './helpers.ts';

const app = buildApp();

async function freshDeck(cookie: string, name = 'Test'): Promise<string> {
  const res = await callApp(app, 'POST', '/decks', { cookie, body: { name } });
  return (await res.json<{ id: string }>()).id;
}

describe('cards', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  test('POST /cards requires a deck that belongs to the user', async () => {
    const { cookie: aCookie } = await signUpAndCookie(app, uniqueEmail('a'));
    const { cookie: bCookie } = await signUpAndCookie(app, uniqueEmail('b'));
    const bDeck = await freshDeck(bCookie, 'Bob');
    const res = await callApp(app, 'POST', '/cards', {
      cookie: aCookie,
      body: { deckId: bDeck, front: 'x', back: 'y' },
    });
    expect(res.status).toBe(400);
  });

  test('new card starts in state=new with default fsrs counters', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const deck = await freshDeck(cookie);
    const res = await callApp(app, 'POST', '/cards', {
      cookie,
      body: { deckId: deck, front: 'Hund', back: 'dog', tags: ['a1', 'noun'] },
    });
    expect(res.status).toBe(200);
    const card = await res.json<{
      state: string;
      reps: number;
      lapses: number;
      suspended: boolean;
      tags: string[];
    }>();
    expect(card.state).toBe('new');
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.suspended).toBe(false);
    expect(card.tags).toEqual(['a1', 'noun']);
  });

  test('suspended cards are hidden from default /cards, shown with includeSuspended', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const deck = await freshDeck(cookie);
    const { id } = await (
      await callApp(app, 'POST', '/cards', {
        cookie,
        body: { deckId: deck, front: 'a', back: 'b' },
      })
    ).json<{ id: string }>();

    await callApp(app, 'PATCH', `/cards/${id}`, { cookie, body: { suspended: true } });

    const plain = await (await callApp(app, 'GET', '/cards', { cookie })).json<{
      items: unknown[];
      nextCursor: string | null;
    }>();
    expect(plain.items).toEqual([]);
    expect(plain.nextCursor).toBeNull();

    const withSuspended = await (
      await callApp(app, 'GET', '/cards?includeSuspended=true', { cookie })
    ).json<{ items: { id: string }[] }>();
    expect(withSuspended.items.find((c) => c.id === id)).toBeTruthy();
  });

  test('/cards/queue returns due + capped new with suspended excluded', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const deck = await freshDeck(cookie);

    // 3 new cards
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const c = await (
        await callApp(app, 'POST', '/cards', {
          cookie,
          body: { deckId: deck, front: `front-${i}`, back: `back-${i}` },
        })
      ).json<{ id: string }>();
      ids.push(c.id);
    }

    // Suspend one
    await callApp(app, 'PATCH', `/cards/${ids[0]}`, { cookie, body: { suspended: true } });

    const q = await (
      await callApp(app, 'GET', '/cards/queue?newLimit=10', { cookie })
    ).json<{ new: { id: string }[]; due: unknown[]; total: number }>();
    expect(q.due).toEqual([]);
    expect(q.new.length).toBe(2);
    expect(q.new.find((c) => c.id === ids[0])).toBeUndefined();
    expect(q.total).toBe(2);
  });

  test('/cards/queue respects newLimit', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const deck = await freshDeck(cookie);
    for (let i = 0; i < 5; i++) {
      await callApp(app, 'POST', '/cards', {
        cookie,
        body: { deckId: deck, front: `f${i}`, back: `b${i}` },
      });
    }
    const q = await (
      await callApp(app, 'GET', '/cards/queue?newLimit=2', { cookie })
    ).json<{ new: unknown[]; total: number }>();
    expect(q.new.length).toBe(2);
    expect(q.total).toBe(2);
  });

  test('/cards/queue returns classified 404 for a missing deck', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail('queue-missing'));
    const res = await callApp(
      app,
      'GET',
      '/cards/queue?deckId=00000000-0000-0000-0000-000000000000',
      {
        cookie,
        headers: { 'x-request-id': 'queue-missing-rid' },
      },
    );
    expect(res.status).toBe(404);
    const body = await res.json<{
      requestId: string;
      error: { code: string; message: string };
    }>();
    expect(body.requestId).toBe('queue-missing-rid');
    expect(body.error.code).toBe('QUEUE_DECK_NOT_FOUND');
  });

  test('/cards/queue scopes deckId to the selected deck subtree', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail('tree'));
    const rootDeck = await freshDeck(cookie, 'Root');
    const childDeck = await (
      await callApp(app, 'POST', '/decks', {
        cookie,
        body: { name: 'Child', parentId: rootDeck },
      })
    ).json<{ id: string }>();
    const siblingDeck = await freshDeck(cookie, 'Sibling');

    await callApp(app, 'POST', '/cards', {
      cookie,
      body: { deckId: childDeck.id, front: 'child-front', back: 'child-back' },
    });
    await callApp(app, 'POST', '/cards', {
      cookie,
      body: { deckId: siblingDeck, front: 'sibling-front', back: 'sibling-back' },
    });

    const scoped = await (
      await callApp(app, 'GET', `/cards/queue?deckId=${encodeURIComponent(rootDeck)}&newLimit=10`, {
        cookie,
      })
    ).json<{ new: { front: string }[]; total: number }>();

    expect(scoped.new.map((card) => card.front)).toEqual(['child-front']);
    expect(scoped.total).toBe(1);
  });

  test('DELETE /cards/:id removes the card and leaves the deck', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const deck = await freshDeck(cookie);
    const c = await (
      await callApp(app, 'POST', '/cards', { cookie, body: { deckId: deck, front: 'x', back: 'y' } })
    ).json<{ id: string }>();
    const del = await callApp(app, 'DELETE', `/cards/${c.id}`, { cookie });
    expect(del.status).toBe(200);
    const decks = await (await callApp(app, 'GET', '/decks', { cookie })).json<unknown[]>();
    expect(decks.length).toBe(1);
    const cardsBody = await (await callApp(app, 'GET', '/cards', { cookie })).json<{
      items: unknown[];
    }>();
    expect(cardsBody.items).toEqual([]);
  });

  test('GET /cards paginates via limit + cursor', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail('page'));
    const deck = await freshDeck(cookie);
    // Create 5 cards. Server orders by createdAt DESC so card-4 is the newest.
    for (let i = 0; i < 5; i++) {
      await callApp(app, 'POST', '/cards', {
        cookie,
        body: { deckId: deck, front: `f${i}`, back: `b${i}` },
      });
    }

    // First page — 3 items, cursor set.
    const page1 = await (
      await callApp(app, 'GET', '/cards?limit=3', { cookie })
    ).json<{ items: { front: string; createdAt: string }[]; nextCursor: string | null }>();
    expect(page1.items.length).toBe(3);
    expect(page1.nextCursor).toBeTruthy();

    // Second page — remaining 2, cursor null.
    const page2 = await (
      await callApp(app, 'GET', `/cards?limit=3&cursor=${encodeURIComponent(page1.nextCursor!)}`, {
        cookie,
      })
    ).json<{ items: { front: string }[]; nextCursor: string | null }>();
    expect(page2.items.length).toBe(2);
    expect(page2.nextCursor).toBeNull();

    // No overlap between the two pages.
    const fronts1 = new Set(page1.items.map((c) => c.front));
    const overlap = page2.items.some((c) => fronts1.has(c.front));
    expect(overlap).toBe(false);
  });

  test('GET /cards includes x-request-id response header', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail('rid'));
    const incoming = 'rid-test-abcdef';
    const res = await callApp(app, 'GET', '/cards', {
      cookie,
      headers: { 'x-request-id': incoming },
    });
    expect(res.headers['x-request-id']).toBe(incoming);
  });

  test('GET /health generates a request-id if upstream did not provide one', async () => {
    const res = await callApp(app, 'GET', '/health');
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test('GET /health exposes stable component status and latency', async () => {
    const res = await callApp(app, 'GET', '/health', {
      headers: { 'x-request-id': 'health-rid' },
    });
    expect(res.status).toBe(200);
    const body = await res.json<{
      ok: boolean;
      components: {
        api: { status: string; latencyMs: number };
        db: { status: string; latencyMs: number };
      };
      db: { ok: boolean; latencyMs: number };
    }>();
    expect(body.ok).toBe(true);
    expect(body.components.api.status).toBe('ok');
    expect(body.components.api.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.components.db.status).toBe('ok');
    expect(body.components.db.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.db.ok).toBe(true);
  });
});
