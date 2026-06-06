import { beforeEach, describe, expect, test } from 'bun:test';
import { buildApp } from '../src/app.ts';
import { callApp, resetTestDb, signUpAndCookie, uniqueEmail } from './helpers.ts';

const app = buildApp();

// A full, valid preset body for the POST endpoint.
function presetBody(over: Record<string, unknown> = {}) {
  return {
    name: 'Default',
    newPerDay: 20,
    reviewsPerDay: 200,
    learningSteps: ['1m', '10m'],
    relearningSteps: ['10m'],
    desiredRetention: 0.9,
    leechThreshold: 8,
    maximumInterval: 36500,
    ...over,
  };
}

async function makeDeck(cookie: string, name: string): Promise<string> {
  const res = await callApp(app, 'POST', '/decks', { cookie, body: { name } });
  const d = await res.json<{ id: string }>();
  return d.id;
}

describe('deck-options (presets)', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  test('CRUD roundtrip', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());

    // Create
    const created = await callApp(app, 'POST', '/deck-options', {
      cookie,
      body: presetBody({ name: 'Fast', newPerDay: 5, learningSteps: ['1d', '3d'] }),
    });
    expect(created.status).toBe(200);
    const p = await created.json<{
      id: string;
      name: string;
      newPerDay: number;
      learningSteps: string[];
      desiredRetention: number | null;
    }>();
    expect(p.name).toBe('Fast');
    expect(p.newPerDay).toBe(5);
    expect(p.learningSteps).toEqual(['1d', '3d']);
    expect(p.desiredRetention).toBe(0.9);

    // List
    const list = await callApp(app, 'GET', '/deck-options', { cookie });
    const all = await list.json<{ id: string }[]>();
    expect(all.map((x) => x.id)).toContain(p.id);

    // Update
    const patched = await callApp(app, 'PATCH', `/deck-options/${p.id}`, {
      cookie,
      body: { name: 'Faster', newPerDay: 3, desiredRetention: null },
    });
    expect(patched.status).toBe(200);
    const pp = await patched.json<{ name: string; newPerDay: number; desiredRetention: number | null }>();
    expect(pp.name).toBe('Faster');
    expect(pp.newPerDay).toBe(3);
    expect(pp.desiredRetention).toBeNull();

    // Delete (no decks bound)
    const del = await callApp(app, 'DELETE', `/deck-options/${p.id}`, { cookie });
    expect(del.status).toBe(200);
    const delBody = await del.json<{ ok: boolean; affectedDecks: number }>();
    expect(delBody.ok).toBe(true);
    expect(delBody.affectedDecks).toBe(0);

    const after = await callApp(app, 'GET', '/deck-options', { cookie });
    const left = await after.json<{ id: string }[]>();
    expect(left.find((x) => x.id === p.id)).toBeUndefined();
  });

  test('null desiredRetention is accepted (inherit profile/default)', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const res = await callApp(app, 'POST', '/deck-options', {
      cookie,
      body: presetBody({ desiredRetention: null }),
    });
    expect(res.status).toBe(200);
    const p = await res.json<{ desiredRetention: number | null }>();
    expect(p.desiredRetention).toBeNull();
  });

  // ── validation ──────────────────────────────────────────────────────────────

  test('steps grammar rejects malformed / empty arrays → 400', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());

    const banana = await callApp(app, 'POST', '/deck-options', {
      cookie,
      body: presetBody({ learningSteps: ['banana'] }),
    });
    expect(banana.status).toBe(400);

    const blank = await callApp(app, 'POST', '/deck-options', {
      cookie,
      body: presetBody({ learningSteps: [''] }),
    });
    expect(blank.status).toBe(400);

    const empty = await callApp(app, 'POST', '/deck-options', {
      cookie,
      body: presetBody({ learningSteps: [] }),
    });
    expect(empty.status).toBe(400);

    const badRelearn = await callApp(app, 'POST', '/deck-options', {
      cookie,
      body: presetBody({ relearningSteps: ['10x'] }),
    });
    expect(badRelearn.status).toBe(400);
  });

  test('desiredRetention out of 0.7–0.99 → 400', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());

    const low = await callApp(app, 'POST', '/deck-options', {
      cookie,
      body: presetBody({ desiredRetention: 0.5 }),
    });
    expect(low.status).toBe(400);

    const high = await callApp(app, 'POST', '/deck-options', {
      cookie,
      body: presetBody({ desiredRetention: 0.999 }),
    });
    expect(high.status).toBe(400);

    // boundaries are inclusive
    const okLow = await callApp(app, 'POST', '/deck-options', {
      cookie,
      body: presetBody({ desiredRetention: 0.7 }),
    });
    expect(okLow.status).toBe(200);
    const okHigh = await callApp(app, 'POST', '/deck-options', {
      cookie,
      body: presetBody({ desiredRetention: 0.99 }),
    });
    expect(okHigh.status).toBe(200);
  });

  test('PATCH re-validates provided fields → 400 on bad steps', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const p = await (
      await callApp(app, 'POST', '/deck-options', { cookie, body: presetBody() })
    ).json<{ id: string }>();
    const bad = await callApp(app, 'PATCH', `/deck-options/${p.id}`, {
      cookie,
      body: { learningSteps: ['nope'] },
    });
    expect(bad.status).toBe(400);
    const badRet = await callApp(app, 'PATCH', `/deck-options/${p.id}`, {
      cookie,
      body: { desiredRetention: 0.4 },
    });
    expect(badRet.status).toBe(400);
  });

  // ── user scoping ──────────────────────────────────────────────────────────

  test('user B cannot read/patch/delete/bind user A preset', async () => {
    const { cookie: aCookie } = await signUpAndCookie(app, uniqueEmail('alice'));
    const { cookie: bCookie } = await signUpAndCookie(app, uniqueEmail('bob'));

    const aPreset = await (
      await callApp(app, 'POST', '/deck-options', { cookie: aCookie, body: presetBody() })
    ).json<{ id: string }>();

    // GET — B's list never includes A's preset
    const bList = await (await callApp(app, 'GET', '/deck-options', { cookie: bCookie })).json<
      { id: string }[]
    >();
    expect(bList.find((x) => x.id === aPreset.id)).toBeUndefined();

    // PATCH — 404
    const patch = await callApp(app, 'PATCH', `/deck-options/${aPreset.id}`, {
      cookie: bCookie,
      body: { name: 'hijack' },
    });
    expect(patch.status).toBe(404);

    // DELETE — 404
    const del = await callApp(app, 'DELETE', `/deck-options/${aPreset.id}`, { cookie: bCookie });
    expect(del.status).toBe(404);

    // BIND — B binding A's preset to B's deck → 404
    const bDeck = await makeDeck(bCookie, 'B deck');
    const bind = await callApp(app, 'PATCH', `/decks/${bDeck}`, {
      cookie: bCookie,
      body: { presetId: aPreset.id },
    });
    expect(bind.status).toBe(404);

    // A's preset still intact + still unbound on B's deck
    const stillThere = await (
      await callApp(app, 'GET', '/deck-options', { cookie: aCookie })
    ).json<{ id: string }[]>();
    expect(stillThere.map((x) => x.id)).toContain(aPreset.id);
  });

  // ── deck binding via PATCH /decks/:id ───────────────────────────────────────

  test('PATCH /decks { presetId } binds and unbinds (own preset)', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const preset = await (
      await callApp(app, 'POST', '/deck-options', { cookie, body: presetBody() })
    ).json<{ id: string }>();
    const deckId = await makeDeck(cookie, 'D');

    // bind
    const bound = await callApp(app, 'PATCH', `/decks/${deckId}`, {
      cookie,
      body: { presetId: preset.id },
    });
    expect(bound.status).toBe(200);
    expect((await bound.json<{ presetId: string | null }>()).presetId).toBe(preset.id);

    // unbind (null)
    const unbound = await callApp(app, 'PATCH', `/decks/${deckId}`, {
      cookie,
      body: { presetId: null },
    });
    expect(unbound.status).toBe(200);
    expect((await unbound.json<{ presetId: string | null }>()).presetId).toBeNull();
  });

  // ── DELETE surfaces affected-deck count + SET NULL unbinds ──────────────────

  test('DELETE returns affectedDecks count and SET NULLs bound decks', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const preset = await (
      await callApp(app, 'POST', '/deck-options', { cookie, body: presetBody() })
    ).json<{ id: string }>();

    // bind the preset to 2 decks via the API
    const d1 = await makeDeck(cookie, 'D1');
    const d2 = await makeDeck(cookie, 'D2');
    expect(
      (await callApp(app, 'PATCH', `/decks/${d1}`, { cookie, body: { presetId: preset.id } }))
        .status,
    ).toBe(200);
    expect(
      (await callApp(app, 'PATCH', `/decks/${d2}`, { cookie, body: { presetId: preset.id } }))
        .status,
    ).toBe(200);

    // DELETE reports 2 affected decks
    const del = await callApp(app, 'DELETE', `/deck-options/${preset.id}`, { cookie });
    expect(del.status).toBe(200);
    const body = await del.json<{ ok: boolean; affectedDecks: number }>();
    expect(body.affectedDecks).toBe(2);

    // both decks now read presetId: null (FK ON DELETE SET NULL)
    const decksAfter = await (await callApp(app, 'GET', '/decks', { cookie })).json<
      { id: string; presetId: string | null }[]
    >();
    const a = decksAfter.find((x) => x.id === d1);
    const b = decksAfter.find((x) => x.id === d2);
    expect(a?.presetId).toBeNull();
    expect(b?.presetId).toBeNull();
  });

  test('unauthenticated requests are rejected', async () => {
    const list = await callApp(app, 'GET', '/deck-options', {});
    expect(list.status).toBe(401);
    const create = await callApp(app, 'POST', '/deck-options', { body: presetBody() });
    expect(create.status).toBe(401);
  });
});
