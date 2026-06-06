import { beforeEach, describe, expect, test } from 'bun:test';
import { cards, db, decks } from '@neuronexus/db';
import {
  buildCardPredicate,
  parseCardQuery,
  type CardLike,
} from '@neuronexus/shared';
import { buildApp } from '../src/app.ts';
import { callApp, resetTestDb, signUpAndCookie, uniqueEmail } from './helpers.ts';

const app = buildApp();

// A fixed clock shared by the server (via ?now=) and the in-memory predicate so
// time-relative operators (is:due / added / edited / prop:due) are in parity and
// stable. 2026-06-06T12:00:00Z.
const NOW = new Date('2026-06-06T12:00:00.000Z');
const NOW_MS = NOW.getTime();
const DAY = 86_400_000;

type CardSeed = {
  front?: string;
  back?: string;
  clozeText?: string | null;
  tags?: string[];
  variant?: 'basic' | 'cloze' | 'type';
  state?: 'new' | 'learning' | 'review' | 'relearning';
  suspended?: boolean;
  due?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  lapses?: number;
  reps?: number;
  stability?: number;
  difficulty?: number;
  scheduledDays?: number;
};

/** Insert a fully-controlled card row directly (bypasses POST's FSRS defaults). */
async function seedCard(userId: string, deckId: string, seed: CardSeed): Promise<string> {
  const [row] = await db
    .insert(cards)
    .values({
      userId,
      deckId,
      variant: seed.variant ?? 'basic',
      front: seed.front ?? 'front',
      back: seed.back ?? 'back',
      clozeText: seed.clozeText ?? null,
      tags: seed.tags ?? [],
      due: seed.due ?? new Date(NOW_MS + DAY),
      stability: seed.stability ?? 0,
      difficulty: seed.difficulty ?? 0,
      elapsedDays: 0,
      scheduledDays: seed.scheduledDays ?? 0,
      learningSteps: 0,
      reps: seed.reps ?? 0,
      lapses: seed.lapses ?? 0,
      state: seed.state ?? 'new',
      createdAt: seed.createdAt ?? NOW,
      updatedAt: seed.updatedAt ?? NOW,
      suspended: seed.suspended ?? false,
    })
    .returning({ id: cards.id });
  return row!.id;
}

async function freshDeck(userId: string, name: string, parentId?: string): Promise<string> {
  const [row] = await db
    .insert(decks)
    .values({ userId, name, parentId: parentId ?? null })
    .returning({ id: decks.id });
  return row!.id;
}

/** Map a server card row into the CardLike shape the client predicate expects. */
function toCardLike(row: Record<string, unknown>): CardLike {
  return {
    front: row.front as string,
    back: row.back as string,
    clozeText: (row.clozeText as string | null) ?? null,
    tags: row.tags as string[],
    variant: row.variant as CardLike['variant'],
    deckId: row.deckId as string,
    state: row.state as CardLike['state'],
    suspended: row.suspended as boolean,
    due: new Date(row.due as string).getTime(),
    createdAt: new Date(row.createdAt as string).getTime(),
    updatedAt: new Date(row.updatedAt as string).getTime(),
    lapses: row.lapses as number,
    reps: row.reps as number,
    stability: row.stability as number,
    difficulty: row.difficulty as number,
    scheduledDays: row.scheduledDays as number,
  };
}

async function search(
  cookie: string,
  q: string,
  extra = '',
): Promise<{ items: Array<Record<string, unknown>>; nextCursor: string | null }> {
  const res = await callApp(
    app,
    'GET',
    `/cards/search?now=${NOW_MS}&q=${encodeURIComponent(q)}${extra}`,
    { cookie },
  );
  return res.json();
}

function ids(items: Array<Record<string, unknown>>): string[] {
  return items.map((i) => i.id as string).sort();
}

describe('GET /cards/search — operators', () => {
  let cookie: string;
  let userId: string;
  let deckGerman: string;
  let deckB1: string;
  let deckFrench: string;

  // ids by label for assertions
  const C: Record<string, string> = {};

  beforeEach(async () => {
    await resetTestDb();
    const u = await signUpAndCookie(app, uniqueEmail('search'));
    cookie = u.cookie;
    userId = u.userId;

    deckGerman = await freshDeck(userId, 'German');
    deckB1 = await freshDeck(userId, 'B1', deckGerman); // child of German
    deckFrench = await freshDeck(userId, 'French');

    C.hund = await seedCard(userId, deckGerman, {
      front: 'Hund',
      back: 'dog',
      tags: ['noun', 'a1'],
      state: 'review',
      reps: 5,
      lapses: 2,
      stability: 12.5,
      difficulty: 4.2,
      scheduledDays: 10,
      due: new Date(NOW_MS - DAY), // overdue
      createdAt: new Date(NOW_MS - 2 * DAY),
      updatedAt: new Date(NOW_MS - 2 * DAY),
    });
    C.katze = await seedCard(userId, deckB1, {
      front: 'Katze',
      back: 'cat',
      tags: ['noun'],
      state: 'learning',
      reps: 1,
      lapses: 0,
      due: new Date(NOW_MS + 3 * DAY),
    });
    C.bonjour = await seedCard(userId, deckFrench, {
      front: 'Bonjour',
      back: 'hello',
      tags: [],
      state: 'new',
      reps: 0,
      due: new Date(NOW_MS + 10 * DAY),
    });
    C.cloze = await seedCard(userId, deckGerman, {
      front: '',
      back: '',
      clozeText: 'Das ist ein {{c1::Hund}}',
      variant: 'cloze',
      tags: ['cloze', 'a2'],
      state: 'review',
      reps: 3,
      lapses: 8,
      due: new Date(NOW_MS - 2 * DAY),
      createdAt: new Date(NOW_MS - 30 * DAY),
      updatedAt: new Date(NOW_MS - DAY),
    });
    C.suspended = await seedCard(userId, deckFrench, {
      front: 'Merci',
      back: 'thanks',
      tags: ['polite'],
      state: 'review',
      suspended: true,
      due: new Date(NOW_MS - DAY), // would be due but suspended
    });
  });

  test('bareword → substring over front/back/cloze (case-insensitive)', async () => {
    const r = await search(cookie, 'hund');
    // matches front "Hund" and cloze "{{c1::Hund}}"
    expect(ids(r.items)).toEqual([C.hund, C.cloze].sort());
  });

  test('front: substring', async () => {
    const r = await search(cookie, 'front:Kat');
    expect(ids(r.items)).toEqual([C.katze]);
  });

  test('front: wildcard', async () => {
    const r = await search(cookie, 'front:H*d');
    expect(ids(r.items)).toEqual([C.hund]);
  });

  test('back: substring', async () => {
    const r = await search(cookie, 'back:dog');
    expect(ids(r.items)).toEqual([C.hund]);
  });

  test('cloze: substring', async () => {
    const r = await search(cookie, 'cloze:Hund');
    expect(ids(r.items)).toEqual([C.cloze]);
  });

  test('empty front: → field is empty string', async () => {
    const r = await search(cookie, 'front:');
    expect(ids(r.items)).toEqual([C.cloze]); // only the cloze card has empty front
  });

  test('deck: resolves the subtree (German includes B1)', async () => {
    const r = await search(cookie, 'deck:German');
    expect(ids(r.items)).toEqual([C.hund, C.katze, C.cloze].sort());
  });

  test('deck: leaf', async () => {
    const r = await search(cookie, 'deck:French');
    // includes suspended Merci (search does not auto-exclude suspended)
    expect(ids(r.items)).toEqual([C.bonjour, C.suspended].sort());
  });

  test('deck: unknown name → no rows', async () => {
    const r = await search(cookie, 'deck:Nonexistent');
    expect(r.items).toEqual([]);
  });

  test('tag: membership', async () => {
    const r = await search(cookie, 'tag:noun');
    expect(ids(r.items)).toEqual([C.hund, C.katze].sort());
  });

  test('tag:none → cards with no tags', async () => {
    const r = await search(cookie, 'tag:none');
    expect(ids(r.items)).toEqual([C.bonjour]);
  });

  test('tag: prefix wildcard', async () => {
    const r = await search(cookie, 'tag:a*');
    expect(ids(r.items)).toEqual([C.hund, C.cloze].sort()); // a1, a2
  });

  test('is:new', async () => {
    const r = await search(cookie, 'is:new');
    expect(ids(r.items)).toEqual([C.bonjour]);
  });

  test('is:learn covers learning + relearning', async () => {
    const r = await search(cookie, 'is:learn');
    expect(ids(r.items)).toEqual([C.katze]);
  });

  test('is:review', async () => {
    const r = await search(cookie, 'is:review');
    expect(ids(r.items)).toEqual([C.hund, C.cloze, C.suspended].sort());
  });

  test('is:due → due<=now AND not suspended', async () => {
    const r = await search(cookie, 'is:due');
    // hund (overdue), cloze (overdue). suspended Merci excluded though overdue.
    expect(ids(r.items)).toEqual([C.hund, C.cloze].sort());
  });

  test('is:suspended', async () => {
    const r = await search(cookie, 'is:suspended');
    expect(ids(r.items)).toEqual([C.suspended]);
  });

  test('variant:cloze', async () => {
    const r = await search(cookie, 'variant:cloze');
    expect(ids(r.items)).toEqual([C.cloze]);
  });

  test('added:N → created within last N days', async () => {
    const r = await search(cookie, 'added:3');
    // hund (-2d), katze/bonjour/merci (NOW). cloze (-30d) excluded.
    expect(ids(r.items)).toEqual([C.hund, C.katze, C.bonjour, C.suspended].sort());
  });

  test('edited:N → updated within last N days', async () => {
    const r = await search(cookie, 'edited:1');
    // cloze updated -1d (boundary inclusive), katze/bonjour/merci at NOW. hund -2d excluded.
    expect(ids(r.items)).toEqual([C.katze, C.bonjour, C.cloze, C.suspended].sort());
  });

  test('prop:lapses>=8', async () => {
    const r = await search(cookie, 'prop:lapses>=8');
    expect(ids(r.items)).toEqual([C.cloze]);
  });

  test('prop:reps<2', async () => {
    const r = await search(cookie, 'prop:reps<2');
    expect(ids(r.items)).toEqual([C.katze, C.bonjour, C.suspended].sort());
  });

  test('prop:ivl maps to scheduledDays', async () => {
    const r = await search(cookie, 'prop:ivl>5');
    expect(ids(r.items)).toEqual([C.hund]); // scheduledDays 10
  });

  test('prop:s (stability) comparator', async () => {
    const r = await search(cookie, 'prop:s>10');
    expect(ids(r.items)).toEqual([C.hund]); // stability 12.5
  });

  test('prop:d (difficulty) comparator', async () => {
    const r = await search(cookie, 'prop:d>=4');
    expect(ids(r.items)).toEqual([C.hund]); // difficulty 4.2
  });

  test('prop:due relative day offset (due within 3 days)', async () => {
    const r = await search(cookie, 'prop:due<=3');
    // hund(-1d), cloze(-2d), katze(+3d), suspended(-1d). bonjour(+10d) excluded.
    expect(ids(r.items)).toEqual([C.hund, C.cloze, C.katze, C.suspended].sort());
  });

  test('AND (implicit) — tag:noun deck:German', async () => {
    const r = await search(cookie, 'tag:noun deck:German');
    expect(ids(r.items)).toEqual([C.hund, C.katze].sort());
  });

  test('OR', async () => {
    const r = await search(cookie, 'front:Hund OR front:Bonjour');
    expect(ids(r.items)).toEqual([C.hund, C.bonjour].sort());
  });

  test('negation -tag:noun within deck', async () => {
    const r = await search(cookie, 'deck:German -tag:noun');
    expect(ids(r.items)).toEqual([C.cloze]);
  });

  test('grouping ( ) with OR', async () => {
    const r = await search(cookie, 'deck:French (front:Bonjour OR front:Merci)');
    expect(ids(r.items)).toEqual([C.bonjour, C.suspended].sort());
  });

  test('empty q → full list (all cards incl suspended)', async () => {
    const r = await search(cookie, '');
    expect(ids(r.items)).toEqual([C.hund, C.katze, C.bonjour, C.cloze, C.suspended].sort());
  });

  test('whitespace q → full list', async () => {
    const r = await search(cookie, '   ');
    expect(r.items.length).toBe(5);
  });
});

describe('GET /cards/search — sort, cursor, validation', () => {
  let cookie: string;
  let userId: string;

  beforeEach(async () => {
    await resetTestDb();
    const u = await signUpAndCookie(app, uniqueEmail('sort'));
    cookie = u.cookie;
    userId = u.userId;
  });

  test('invalid sort field → 400', async () => {
    const res = await callApp(app, 'GET', `/cards/search?sort=bogus%20asc`, { cookie });
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toBe('bad_sort');
  });

  test('invalid sort dir → 400', async () => {
    const res = await callApp(app, 'GET', `/cards/search?sort=created%20sideways`, { cookie });
    expect(res.status).toBe(400);
  });

  test('query too long → 400 bad_query', async () => {
    const long = 'a'.repeat(1001);
    const res = await callApp(app, 'GET', `/cards/search?q=${long}`, { cookie });
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toBe('bad_query');
  });

  test('default sort is created desc', async () => {
    const deck = await freshDeck(userId, 'D');
    const a = await seedCard(userId, deck, { front: 'a', createdAt: new Date(NOW_MS - 3 * DAY) });
    const b = await seedCard(userId, deck, { front: 'b', createdAt: new Date(NOW_MS - 1 * DAY) });
    const c = await seedCard(userId, deck, { front: 'c', createdAt: new Date(NOW_MS - 2 * DAY) });
    const r = await search(cookie, '');
    expect(r.items.map((i) => i.id)).toEqual([b, c, a]); // newest first
  });

  test('sort=front asc', async () => {
    const deck = await freshDeck(userId, 'D');
    const z = await seedCard(userId, deck, { front: 'zebra' });
    const a = await seedCard(userId, deck, { front: 'apple' });
    const m = await seedCard(userId, deck, { front: 'mango' });
    const r = await search(cookie, '', '&sort=front%20asc');
    expect(r.items.map((i) => i.id)).toEqual([a, m, z]);
  });

  test('tied-lapses keyset pagination has no dupes or drops', async () => {
    const deck = await freshDeck(userId, 'D');
    // 5 cards all with lapses=3 (a hard tie on the sort key).
    const all: string[] = [];
    for (let i = 0; i < 5; i++) {
      all.push(await seedCard(userId, deck, { front: `f${i}`, lapses: 3 }));
    }
    // Add a couple with different lapses to ensure ordering still partitions.
    all.push(await seedCard(userId, deck, { front: 'low', lapses: 1 }));
    all.push(await seedCard(userId, deck, { front: 'high', lapses: 9 }));

    const seen: string[] = [];
    let cursor: string | null = null;
    let guard = 0;
    do {
      const extra = `&sort=lapses%20desc&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const page = await search(cookie, '', extra);
      for (const it of page.items) seen.push(it.id as string);
      cursor = page.nextCursor;
      if (++guard > 20) throw new Error('pagination did not terminate');
    } while (cursor);

    // No drops: every card seen. No dupes: unique count equals total.
    expect(seen.length).toBe(all.length);
    expect(new Set(seen).size).toBe(all.length);
    expect([...seen].sort()).toEqual([...all].sort());
  });

  test('cross-user isolation', async () => {
    const deck = await freshDeck(userId, 'Mine');
    const mine = await seedCard(userId, deck, { front: 'mine' });

    const other = await signUpAndCookie(app, uniqueEmail('other'));
    const otherDeck = await freshDeck(other.userId, 'Theirs');
    await seedCard(other.userId, otherDeck, { front: 'theirs' });

    const r = await search(cookie, '');
    expect(ids(r.items)).toEqual([mine]);
  });
});

// ── AST parity: client predicate (in-memory) vs server SQL (same pinned now) ──

describe('AST parity', () => {
  let cookie: string;
  let userId: string;
  let allRows: Array<Record<string, unknown>>;
  const deckIdByName = new Map<string, string>();
  const deckRows: Array<{ id: string; parentId: string | null; name: string }> = [];

  beforeEach(async () => {
    await resetTestDb();
    const u = await signUpAndCookie(app, uniqueEmail('parity'));
    cookie = u.cookie;
    userId = u.userId;
    deckIdByName.clear();
    deckRows.length = 0;

    const mk = async (name: string, parent?: string) => {
      const id = await freshDeck(userId, name, parent ? deckIdByName.get(parent) : undefined);
      deckIdByName.set(name, id);
      deckRows.push({ id, parentId: parent ? deckIdByName.get(parent)! : null, name });
      return id;
    };
    await mk('Languages');
    await mk('German', 'Languages');
    await mk('Spanish', 'Languages');

    const g = deckIdByName.get('German')!;
    const s = deckIdByName.get('Spanish')!;
    const l = deckIdByName.get('Languages')!;

    // ~14-card fixture spanning states, tags, variants, props, dates.
    await seedCard(userId, g, { front: 'Apfel', back: 'apple', tags: ['noun', 'a1'], state: 'review', reps: 10, lapses: 1, stability: 20, difficulty: 3, scheduledDays: 30, due: new Date(NOW_MS - DAY) });
    await seedCard(userId, g, { front: 'rennen', back: 'to run', tags: ['verb'], state: 'learning', reps: 2, lapses: 0, due: new Date(NOW_MS + DAY) });
    await seedCard(userId, g, { front: 'Buch', back: 'book', tags: ['noun', 'a2'], state: 'new', reps: 0, due: new Date(NOW_MS + 5 * DAY) });
    await seedCard(userId, g, { front: '', back: '', clozeText: 'Ich {{c1::lese}} ein Buch', variant: 'cloze', tags: ['verb', 'cloze'], state: 'review', reps: 4, lapses: 5, due: new Date(NOW_MS - 3 * DAY), createdAt: new Date(NOW_MS - 40 * DAY) });
    await seedCard(userId, s, { front: 'gato', back: 'cat', tags: ['noun'], state: 'review', reps: 7, lapses: 8, stability: 5, due: new Date(NOW_MS - 2 * DAY), suspended: true });
    await seedCard(userId, s, { front: 'correr', back: 'to run', tags: ['verb'], state: 'relearning', reps: 3, lapses: 4, due: new Date(NOW_MS - DAY) });
    await seedCard(userId, s, { front: 'casa', back: 'house', tags: [], variant: 'type', state: 'new', reps: 0, due: new Date(NOW_MS + 2 * DAY) });
    await seedCard(userId, l, { front: 'meta', back: 'top-level', tags: ['meta'], state: 'review', reps: 1, lapses: 0, due: new Date(NOW_MS) });
    await seedCard(userId, g, { front: 'Wasser', back: 'water', tags: ['noun', 'a1'], state: 'review', reps: 6, lapses: 2, scheduledDays: 14, due: new Date(NOW_MS + 7 * DAY), createdAt: new Date(NOW_MS - 5 * DAY), updatedAt: new Date(NOW_MS - 2 * DAY) });
    await seedCard(userId, g, { front: 'Hund', back: 'dog', tags: ['noun'], state: 'learning', reps: 1, lapses: 0, due: new Date(NOW_MS - DAY) });
    await seedCard(userId, s, { front: 'perro', back: 'dog', tags: ['noun', 'a1'], state: 'review', reps: 9, lapses: 3, stability: 40, difficulty: 6, scheduledDays: 60, due: new Date(NOW_MS - 10 * DAY) });
    await seedCard(userId, s, { front: 'libro', back: 'book', tags: ['noun', 'a2'], state: 'new', reps: 0, due: new Date(NOW_MS + 4 * DAY), createdAt: new Date(NOW_MS - DAY) });
    await seedCard(userId, g, { front: 'gehen', back: 'to go', tags: ['verb', 'a1'], state: 'review', reps: 5, lapses: 1, due: new Date(NOW_MS - 4 * DAY), updatedAt: new Date(NOW_MS - 6 * DAY) });
    await seedCard(userId, g, { front: 'Katze', back: 'cat', tags: [], variant: 'basic', state: 'new', reps: 0, due: new Date(NOW_MS + 8 * DAY) });
    // Mixed-case tag: exercises case-insensitive exact-match parity (`tag:noun` /
    // `tag:Noun` must both hit this card on client AND server).
    await seedCard(userId, g, { front: 'Vogel', back: 'bird', tags: ['Noun'], state: 'review', reps: 2, lapses: 0, due: new Date(NOW_MS - DAY) });

    // Fetch the full fixture (use a big limit so the predicate sees every row).
    const r = await search(cookie, '', '&limit=1000');
    allRows = r.items;
    expect(allRows.length).toBe(15);
  });

  function resolveDeckIds(value: string, nested: boolean): string[] {
    const lower = value.toLowerCase();
    const matched = deckRows.filter((d) => d.name.toLowerCase() === lower);
    if (matched.length === 0) return [];
    const descOf = (id: string): string[] => {
      const kids = deckRows.filter((d) => d.parentId === id).map((d) => d.id);
      return kids.flatMap((k) => [k, ...descOf(k)]);
    };
    const out = new Set<string>();
    for (const m of matched) {
      out.add(m.id);
      if (nested) for (const id of descOf(m.id)) out.add(id);
    }
    return [...out];
  }

  const QUERIES = [
    'apple',
    'front:Buch',
    'back:to run',
    'cloze:lese',
    'deck:German',
    'deck:Languages',
    'deck:Spanish',
    'tag:noun',
    'tag:Noun',
    'tag:none',
    'tag:a*',
    'is:new',
    'is:learn',
    'is:review',
    'is:due',
    'is:suspended',
    'variant:cloze',
    'added:6',
    'edited:3',
    'prop:lapses>=3',
    'prop:reps<2',
    'prop:ivl>=14',
    'prop:due<=2',
    'deck:German -tag:noun',
    'tag:noun OR tag:verb',
    'is:review prop:lapses>1',
  ];

  test('each query yields identical id sets across both back-ends', async () => {
    for (const q of QUERIES) {
      // server side: SQL WHERE built from the AST.
      const r = await search(cookie, q, '&limit=1000');
      const serverIds = ids(r.items);

      // client side: in-memory predicate built from the SAME AST + pinned now.
      const pred = buildCardPredicate(parseCardQuery(q), {
        now: NOW_MS,
        resolveDeckIds,
      });
      const clientIds = allRows
        .filter((row) => pred(toCardLike(row)))
        .map((row) => row.id as string)
        .sort();

      expect(clientIds).toEqual(serverIds);
    }
  });
});
