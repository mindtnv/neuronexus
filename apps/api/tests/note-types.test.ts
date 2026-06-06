// Note-types CRUD integration tests (Milestone 1, Phase 4).
//
// Covers: scoped GET (own + builtins), create, clone-on-edit for builtins,
// owned PATCH, scoped DELETE (cascade), ordinal validation, and the note-type
// PATCH → mass re-render path (FSRS intact) on derived cards.

import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { noteTypes } from '@neuronexus/db';
import { db } from '@neuronexus/db/client';
import { BASIC_NOTE_TYPE } from '@neuronexus/shared';
import { buildApp } from '../src/app.ts';
import { callApp, resetTestDb, signUpAndCookie, uniqueEmail } from './helpers.ts';

const app = buildApp();

/** Insert a global builtin note-type (userId NULL) for the visibility tests. */
async function seedBuiltin(name = 'Basic') {
  const [row] = await db
    .insert(noteTypes)
    .values({
      userId: null,
      name,
      fields: BASIC_NOTE_TYPE.fields,
      templates: BASIC_NOTE_TYPE.templates,
      styling: '',
      kind: 'basic',
      isBuiltin: true,
    })
    .returning();
  return row!;
}

const customBody = {
  name: 'My Type',
  fields: [
    { name: 'Q', ord: 0 },
    { name: 'A', ord: 1 },
  ],
  templates: [{ name: 'Card 1', ord: 0, frontTemplate: '{{Q}}', backTemplate: '{{Q}}<hr>{{A}}' }],
  kind: 'custom' as const,
};

describe('note-types CRUD', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  test('GET returns own rows + global builtins, not other users rows', async () => {
    const builtin = await seedBuiltin();
    const { cookie: a } = await signUpAndCookie(app, uniqueEmail('a'));
    const { cookie: b } = await signUpAndCookie(app, uniqueEmail('b'));

    // b creates a private type
    await callApp(app, 'POST', '/note-types', { cookie: b, body: customBody });

    const res = await callApp(app, 'GET', '/note-types', { cookie: a });
    const rows = await res.json<Array<{ id: string; isBuiltin: boolean; userId: string | null }>>();
    expect(res.status).toBe(200);
    // a sees the builtin but NOT b's private type.
    expect(rows.some((r) => r.id === builtin.id)).toBe(true);
    expect(rows.every((r) => r.userId === null || r.isBuiltin)).toBe(true);
  });

  test('POST creates a user-owned type', async () => {
    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
    const res = await callApp(app, 'POST', '/note-types', { cookie, body: customBody });
    expect(res.status).toBe(200);
    const row = await res.json<{ userId: string; isBuiltin: boolean; name: string }>();
    expect(row.userId).toBe(userId);
    expect(row.isBuiltin).toBe(false);
    expect(row.name).toBe('My Type');
  });

  test('POST rejects non-dense field ordinals', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const res = await callApp(app, 'POST', '/note-types', {
      cookie,
      body: { ...customBody, fields: [{ name: 'Q', ord: 0 }, { name: 'A', ord: 5 }] },
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toBe('bad_field_ords');
  });

  test('PATCH on a builtin CLONES (does not mutate the global)', async () => {
    const builtin = await seedBuiltin();
    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());

    const res = await callApp(app, 'PATCH', `/note-types/${builtin.id}`, {
      cookie,
      body: { name: 'My Basic' },
    });
    expect(res.status).toBe(200);
    const clone = await res.json<{ id: string; userId: string; isBuiltin: boolean; name: string }>();
    // A NEW row, user-owned, not a builtin.
    expect(clone.id).not.toBe(builtin.id);
    expect(clone.userId).toBe(userId);
    expect(clone.isBuiltin).toBe(false);
    expect(clone.name).toBe('My Basic');

    // The global builtin is untouched.
    const [stillGlobal] = await db
      .select()
      .from(noteTypes)
      .where(eq(noteTypes.id, builtin.id));
    expect(stillGlobal!.name).toBe('Basic');
    expect(stillGlobal!.userId).toBeNull();
  });

  test('PATCH on an owned type mutates in place', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const created = await (
      await callApp(app, 'POST', '/note-types', { cookie, body: customBody })
    ).json<{ id: string }>();

    const res = await callApp(app, 'PATCH', `/note-types/${created.id}`, {
      cookie,
      body: { name: 'Renamed' },
    });
    expect(res.status).toBe(200);
    const updated = await res.json<{ id: string; name: string }>();
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Renamed');
  });

  test('DELETE removes own type; refuses foreign / builtin', async () => {
    const builtin = await seedBuiltin();
    const { cookie: a } = await signUpAndCookie(app, uniqueEmail('a'));
    const { cookie: b } = await signUpAndCookie(app, uniqueEmail('b'));

    const created = await (
      await callApp(app, 'POST', '/note-types', { cookie: a, body: customBody })
    ).json<{ id: string }>();

    // b cannot delete a's type.
    const foreign = await callApp(app, 'DELETE', `/note-types/${created.id}`, { cookie: b });
    expect(foreign.status).toBe(404);

    // nobody can delete a builtin (userId NULL never matches the owned scope).
    const builtinDel = await callApp(app, 'DELETE', `/note-types/${builtin.id}`, { cookie: a });
    expect(builtinDel.status).toBe(404);

    // a deletes its own.
    const ok = await callApp(app, 'DELETE', `/note-types/${created.id}`, { cookie: a });
    expect(ok.status).toBe(200);
  });

  test('DELETE cascades to notes + cards', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const deck = await (
      await callApp(app, 'POST', '/decks', { cookie, body: { name: 'D' } })
    ).json<{ id: string }>();
    const nt = await (
      await callApp(app, 'POST', '/note-types', { cookie, body: customBody })
    ).json<{ id: string }>();
    await callApp(app, 'POST', '/notes', {
      cookie,
      body: { noteTypeId: nt.id, fieldValues: { Q: 'q', A: 'a' }, deckId: deck.id },
    });

    // sanity: a card exists
    const before = await (await callApp(app, 'GET', '/cards', { cookie })).json<{
      items: unknown[];
    }>();
    expect(before.items.length).toBe(1);

    await callApp(app, 'DELETE', `/note-types/${nt.id}`, { cookie });

    const after = await (await callApp(app, 'GET', '/cards', { cookie })).json<{
      items: unknown[];
    }>();
    expect(after.items.length).toBe(0);
  });

  test('note-type PATCH → mass re-render of derived cards, FSRS preserved', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const deck = await (
      await callApp(app, 'POST', '/decks', { cookie, body: { name: 'D' } })
    ).json<{ id: string }>();
    const nt = await (
      await callApp(app, 'POST', '/note-types', { cookie, body: customBody })
    ).json<{ id: string }>();
    const noteRes = await (
      await callApp(app, 'POST', '/notes', {
        cookie,
        body: { noteTypeId: nt.id, fieldValues: { Q: 'Hund', A: 'dog' }, deckId: deck.id },
      })
    ).json<{ cards: Array<{ id: string; renderFrontText: string }> }>();
    const cardId = noteRes.cards[0]!.id;

    // grade the card so it carries non-default FSRS state
    await callApp(app, 'POST', '/reviews', { cookie, body: { cardId, rating: 3 } });
    const graded = await (await callApp(app, 'GET', '/cards?includeSuspended=true', { cookie })).json<{
      items: Array<{ id: string; reps: number; state: string; renderFrontText: string }>;
    }>();
    const beforeCard = graded.items.find((c) => c.id === cardId)!;
    expect(beforeCard.reps).toBe(1);

    // edit the note-type template — render output changes (prefix on front).
    const patch = await callApp(app, 'PATCH', `/note-types/${nt.id}`, {
      cookie,
      body: {
        templates: [
          { name: 'Card 1', ord: 0, frontTemplate: 'Q: {{Q}}', backTemplate: '{{Q}}<hr>{{A}}' },
        ],
      },
    });
    expect(patch.status).toBe(200);

    const after = await (await callApp(app, 'GET', '/cards?includeSuspended=true', { cookie })).json<{
      items: Array<{ id: string; reps: number; state: string; renderFrontText: string }>;
    }>();
    const afterCard = after.items.find((c) => c.id === cardId)!;
    // render column refreshed …
    expect(afterCard.renderFrontText).toBe('Q: Hund');
    // … FSRS state preserved.
    expect(afterCard.reps).toBe(1);
    expect(afterCard.state).toBe(beforeCard.state);
  });
});
