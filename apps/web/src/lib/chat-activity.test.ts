// Unit tests for the pure chat-activity helpers (Codex-like redesign, S1).
// Pure-logic `bun test` — this repo has no chat component-render harness, so all
// testable behavior (labels, elapsed format, repeated-call grouping,
// reconstruction-to-feed, header state, apply summary, trailing-exchange trim)
// is proven here.

import { describe, expect, test } from 'bun:test';
import {
  applySummaryFrom,
  buildCardSelections,
  confirmDiffRows,
  createCardDraft,
  dayKey,
  dropTrailingExchange,
  formatDayLabel,
  formatElapsed,
  formatToolArgs,
  groupHeaderState,
  hasPendingConfirmation,
  nextUndecidedIndex,
  needsDaySeparator,
  PLURAL_TOOL_NAMES,
  reconstructMessages,
  summarizeSteps,
  TOOL_ICON_KEY,
  TOOL_LABEL_KEY,
  toolIcon,
  toolLabel,
  usageTotal,
  type MessageVM,
  type PersistedMessageRow,
} from './chat-activity';

// A predictable `t` that echoes key + params so assertions can inspect both.
const t = (key: string, params?: Record<string, string | number>): string =>
  params ? `${key}|${JSON.stringify(params)}` : key;

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// ── toolLabel (AC2.1/2.2) ──────────────────────────────────────────────────────

describe('toolLabel', () => {
  const fullId = '11111111-2222-3333-4444-555555555555';

  test('get_card resolves the card front, never a UUID/JSON', () => {
    const r = toolLabel('get_card', { cardId: fullId }, { resolveCardFront: () => 'Bonjour' });
    expect(r.labelKey).toBe('chat.tool.get_card');
    expect(r.params.front).toBe('Bonjour');
    expect(UUID_RE.test(JSON.stringify(r))).toBe(false);
    expect(r.argMono).toBeUndefined();
  });

  test('get_card falls back to a SHORT id (8 chars) when unresolved — never the full UUID', () => {
    const r = toolLabel('get_card', { cardId: fullId }, {});
    expect(r.params.front).toBe('11111111');
    expect(UUID_RE.test(String(r.params.front))).toBe(false);
  });

  test('card_progress uses the same front-resolution as get_card', () => {
    const r = toolLabel('card_progress', { cardId: fullId }, { resolveCardFront: () => 'Atom' });
    expect(r.labelKey).toBe('chat.tool.card_progress');
    expect(r.params.front).toBe('Atom');
  });

  test('browse_cards prefers the query (as argMono), falls back to the deck name', () => {
    const q = toolLabel('browse_cards', { query: 'deck:French' }, {});
    expect(q.labelKey).toBe('chat.tool.browse_cards');
    expect(q.params.query).toBe('deck:French');
    expect(q.argMono).toBe('deck:French');

    const d = toolLabel('browse_cards', { deckId: 'd1' }, { deckName: () => 'French' });
    expect(d.params.query).toBe('French');
    expect(d.argMono).toBeUndefined();
  });

  test('list_decks is label-only (no params, no UUID)', () => {
    const r = toolLabel('list_decks', {}, {});
    expect(r.labelKey).toBe('chat.tool.list_decks');
    expect(r.params).toEqual({});
    expect(r.argMono).toBeUndefined();
  });

  test('study_stats interpolates the scope (deck name when present, else scope)', () => {
    const g = toolLabel('study_stats', { scope: 'global' }, {});
    expect(g.params.scope).toBe('global');
    const d = toolLabel('study_stats', { scope: 'deck', deckId: 'd1' }, { deckName: () => 'Verbs' });
    expect(d.params.scope).toBe('Verbs');
  });

  test('search_cards / web_search surface the query string as argMono', () => {
    const s = toolLabel('search_cards', { query: 'photosynthesis' }, {});
    expect(s.labelKey).toBe('chat.tool.search_cards');
    expect(s.params.query).toBe('photosynthesis');
    expect(s.argMono).toBe('photosynthesis');

    const w = toolLabel('web_search', { query: 'who is ada lovelace' }, {});
    expect(w.labelKey).toBe('chat.tool.web_search');
    expect(w.argMono).toBe('who is ada lovelace');
  });

  test('unknown tool emits a bare label key with no raw args leaked', () => {
    const r = toolLabel('mystery_tool', { secret: fullId }, {});
    expect(r.labelKey).toBe('chat.tool.mystery_tool');
    expect(UUID_RE.test(JSON.stringify(r))).toBe(false);
  });

  test('no UUID leaks for ANY known tool, even with a full-UUID arg present', () => {
    for (const name of Object.keys(TOOL_LABEL_KEY)) {
      const r = toolLabel(name, { cardId: fullId, deckId: fullId, query: 'q' }, {});
      expect(UUID_RE.test(JSON.stringify(r))).toBe(false);
    }
  });
});

// ── formatElapsed (AC1.5) ──────────────────────────────────────────────────────

describe('formatElapsed', () => {
  test('sub-second (0ms, 400ms, 999ms) → workedSub', () => {
    expect(formatElapsed(0, t)).toBe('chat.activity.workedSub');
    expect(formatElapsed(400, t)).toBe('chat.activity.workedSub');
    expect(formatElapsed(999, t)).toBe('chat.activity.workedSub');
  });

  test('1s and 59s → workedSeconds {count}', () => {
    expect(formatElapsed(1000, t)).toBe('chat.activity.workedSeconds|{"count":1}');
    expect(formatElapsed(59_000, t)).toBe('chat.activity.workedSeconds|{"count":59}');
  });

  test('60s → "1m 0s", 125s → "2m 5s"', () => {
    expect(formatElapsed(60_000, t)).toBe('chat.activity.workedMinutes|{"m":1,"s":0}');
    expect(formatElapsed(125_000, t)).toBe('chat.activity.workedMinutes|{"m":2,"s":5}');
  });

  test('3600s → capped hours form; 7412s → "2h 3m" (no raw seconds)', () => {
    expect(formatElapsed(3_600_000, t)).toBe('chat.activity.workedHours|{"h":1,"m":0}');
    const runaway = formatElapsed(7_412_000, t);
    expect(runaway).toBe('chat.activity.workedHours|{"h":2,"m":3}');
    expect(runaway).not.toContain('7412');
  });

  test('NaN/negative collapses to sub-second', () => {
    expect(formatElapsed(Number.NaN, t)).toBe('chat.activity.workedSub');
    expect(formatElapsed(-100, t)).toBe('chat.activity.workedSub');
  });
});

// ── summarizeSteps (AC2.2 / Assumption 4) ──────────────────────────────────────

describe('summarizeSteps', () => {
  test('no steps → empty', () => {
    expect(summarizeSteps([])).toEqual([]);
  });

  test('7 contiguous get_card → one group of 7', () => {
    const steps = Array.from({ length: 7 }, () => ({ name: 'get_card' }));
    const g = summarizeSteps(steps);
    expect(g).toEqual([{ name: 'get_card', count: 7, firstIndex: 0 }]);
    // The summed total equals the raw step count (header "N steps" never under-counts).
    expect(g.reduce((sum, x) => sum + x.count, 0)).toBe(steps.length);
  });

  test('interleaved A,A,B,A stays [A×2, B, A×1] — never merges across B', () => {
    const steps = [
      { name: 'get_card' },
      { name: 'get_card' },
      { name: 'study_stats' },
      { name: 'get_card' },
    ];
    const g = summarizeSteps(steps);
    expect(g).toEqual([
      { name: 'get_card', count: 2, firstIndex: 0 },
      { name: 'study_stats', count: 1, firstIndex: 2 },
      { name: 'get_card', count: 1, firstIndex: 3 },
    ]);
    expect(g.reduce((sum, x) => sum + x.count, 0)).toBe(4);
  });
});

// ── groupHeaderState (AC1.2/1.3 / Change 5) ─────────────────────────────────────

describe('groupHeaderState', () => {
  const S = (status: 'running' | 'ok' | 'error') => ({ status });

  test('status: any error → error; any running (no error) → running; else done', () => {
    expect(
      groupHeaderState([S('ok'), S('error'), S('running')], {
        streaming: true,
        answerStarted: false,
        singleStepAutoOpen: false,
      }).status,
    ).toBe('error');
    expect(
      groupHeaderState([S('ok'), S('running')], {
        streaming: true,
        answerStarted: false,
        singleStepAutoOpen: false,
      }).status,
    ).toBe('running');
    expect(
      groupHeaderState([S('ok'), S('ok')], {
        streaming: false,
        answerStarted: true,
        singleStepAutoOpen: false,
      }).status,
    ).toBe('done');
  });

  test('live mirrors streaming && !answerStarted', () => {
    expect(
      groupHeaderState([S('running')], {
        streaming: true,
        answerStarted: false,
        singleStepAutoOpen: false,
      }).live,
    ).toBe(true);
    // Answer started → no longer live (collapse-on-answer).
    expect(
      groupHeaderState([S('ok')], {
        streaming: true,
        answerStarted: true,
        singleStepAutoOpen: false,
      }).live,
    ).toBe(false);
    // Not streaming → not live.
    expect(
      groupHeaderState([S('ok')], {
        streaming: false,
        answerStarted: false,
        singleStepAutoOpen: false,
      }).live,
    ).toBe(false);
  });

  test('single-step group auto-opens (initialOpen true); multi-step collapses on answer (initialOpen false)', () => {
    const single = groupHeaderState([S('ok')], {
      streaming: false,
      answerStarted: true,
      singleStepAutoOpen: true,
    });
    expect(single.initialOpen).toBe(true);

    const multi = groupHeaderState([S('ok'), S('ok')], {
      streaming: false,
      answerStarted: true,
      singleStepAutoOpen: false,
    });
    expect(multi.initialOpen).toBe(false);
    expect(multi.live).toBe(false); // collapsed once the answer landed
  });

  test('[HIGH] multi-step group with a pending-confirmation step stays open (initialOpen=false, live=false, anyAwaiting=true → open)', () => {
    // A read-then-write turn: search_cards auto-executed, create_card now paused.
    // streaming=false (await_confirmation closes the stream), answerStarted=false,
    // singleStepAutoOpen=false (>1 step) — without anyAwaiting the group would
    // collapse and hide the Apply/Reject controls. With anyAwaiting=true it must
    // force initialOpen so the effective open = manualOpen ?? (initialOpen || live || anyAwaiting) is true.
    const result = groupHeaderState([S('ok'), S('running')], {
      streaming: false,
      answerStarted: false,
      singleStepAutoOpen: false,
      anyAwaiting: true,
    });
    // initialOpen is forced true by anyAwaiting — the component open expression
    // `manualOpen ?? (initialOpen || live || anyAwaiting)` evaluates to true with
    // manualOpen=null, initialOpen=true, live=false.
    expect(result.initialOpen).toBe(true);
    expect(result.live).toBe(false); // not streaming
  });

  test('anyAwaiting=false does NOT force initialOpen for a multi-step done group', () => {
    const result = groupHeaderState([S('ok'), S('ok')], {
      streaming: false,
      answerStarted: true,
      singleStepAutoOpen: false,
      anyAwaiting: false,
    });
    expect(result.initialOpen).toBe(false);
  });
});

// ── TOOL_ICON_KEY completeness (AC3.1) ──────────────────────────────────────────

describe('TOOL_ICON_KEY', () => {
  test('every tool in TOOL_LABEL_KEY has an icon', () => {
    for (const name of Object.keys(TOOL_LABEL_KEY)) {
      expect(TOOL_ICON_KEY[name]).toBeDefined();
    }
  });

  test('toolIcon falls back to bolt for an unknown tool', () => {
    expect(toolIcon('mystery_tool')).toBe('bolt');
    expect(toolIcon('get_card')).toBe('brain');
  });
});

// ── PLURAL_TOOL_NAMES completeness (AC2.2 / single-source fix) ─────────────────
// Every name in PLURAL_TOOL_NAMES must have a `chat.tool.<name>_n` key in both
// the en and ru locale dicts. Import both so drift between the sets is caught.

describe('PLURAL_TOOL_NAMES', () => {
  // Dynamically import so this test fails at the assertion, not at module load.
  test('every name in PLURAL_TOOL_NAMES has a _n key in the en locale', async () => {
    const { default: en } = await import('./messages/en/chat');
    for (const name of PLURAL_TOOL_NAMES) {
      const key = `${name}_n` as keyof typeof en.tool;
      expect(en.tool[key]).toBeDefined();
    }
  });

  test('every name in PLURAL_TOOL_NAMES has a _n key in the ru locale', async () => {
    const { default: ru } = await import('./messages/ru/chat');
    for (const name of PLURAL_TOOL_NAMES) {
      const key = `${name}_n` as keyof typeof ru.tool;
      expect(ru.tool[key]).toBeDefined();
    }
  });
});

// ── applySummaryFrom (AC5.1) ────────────────────────────────────────────────────

describe('applySummaryFrom', () => {
  test('create_card → {kind:create, count, deckId}', () => {
    expect(applySummaryFrom('create_card', { deckId: 'd1' })).toEqual({
      kind: 'create',
      count: 1,
      deckId: 'd1',
    });
    expect(applySummaryFrom('create_card', { deckId: 'd1', cardIds: ['a', 'b', 'c'] })).toEqual({
      kind: 'create',
      count: 3,
      deckId: 'd1',
    });
  });

  test('create_card batch (cards: [...]) counts the batch entries', () => {
    const cards = [{ fieldValues: { Front: 'a' } }, { fieldValues: { Front: 'b' } }];
    expect(applySummaryFrom('create_card', { deckId: 'd1', cards })).toEqual({
      kind: 'create',
      count: 2,
      deckId: 'd1',
    });
  });

  test('edit_card → {kind:edit, cardId}', () => {
    expect(applySummaryFrom('edit_card', { cardId: 'c9' })).toEqual({
      kind: 'edit',
      cardId: 'c9',
    });
  });

  test('reject/other tool → null', () => {
    expect(applySummaryFrom('search_cards', { query: 'x' })).toBeNull();
    expect(applySummaryFrom('suspend', { cardId: 'c1' })).toBeNull();
  });
});

// ── dropTrailingExchange (B1 fallback helper) ──────────────────────────────────

describe('dropTrailingExchange', () => {
  const mk = (id: string, role: MessageVM['role']): MessageVM => ({
    id,
    role,
    content: id,
    citations: [],
  });

  test('trailing user only → drops the user', () => {
    const msgs = [mk('a', 'assistant'), mk('u', 'user')];
    expect(dropTrailingExchange(msgs).map((m) => m.id)).toEqual(['a']);
  });

  test('trailing user + assistant → drops both', () => {
    const msgs = [mk('u0', 'user'), mk('a0', 'assistant'), mk('u1', 'user'), mk('a1', 'assistant')];
    expect(dropTrailingExchange(msgs).map((m) => m.id)).toEqual(['u0', 'a0']);
  });

  test('empty list → empty', () => {
    expect(dropTrailingExchange([])).toEqual([]);
  });
});

// ── reconstructMessages → grouped feed (REQUIRED — Change 4 / AC-X1) ────────────

describe('reconstructMessages — reload parity (timing absent)', () => {
  test('folds tool rows into the host; no standalone tool bubble; timing undefined', () => {
    const rows: PersistedMessageRow[] = [
      { id: 'u1', role: 'user', content: 'how am I doing?' },
      {
        id: 'a1',
        role: 'assistant',
        content: '', // tool_calls sentinel
        toolCalls: [
          { id: 'tc1', name: 'study_stats', arguments: JSON.stringify({ scope: 'global' }) },
          { id: 'tc2', name: 'get_card', arguments: JSON.stringify({ cardId: 'c1' }) },
        ],
      },
      { id: 'r1', role: 'tool', content: 'You reviewed 40 cards.', toolCallId: 'tc1' },
      {
        id: 'r2',
        role: 'tool',
        content: JSON.stringify({ ok: false, error: 'card not found' }),
        toolCallId: 'tc2',
      },
      { id: 'a2', role: 'assistant', content: 'You are doing great!' },
    ];

    const vms = reconstructMessages(rows);

    // (a) the host assistant VM carries toolCalls[] folded correctly.
    const host = vms.find((m) => m.id === 'a1')!;
    expect(host.role).toBe('assistant');
    expect(host.toolCalls?.length).toBe(2);
    expect(host.toolCalls![0]!.status).toBe('ok');
    expect(host.toolCalls![0]!.result).toBe('You reviewed 40 cards.');
    // The failed tool flips to error with its error summary.
    expect(host.toolCalls![1]!.status).toBe('error');
    expect(host.toolCalls![1]!.result).toBe('card not found');

    // (b) a role:'tool' row is NEVER a standalone bubble, and the whole turn
    // (tool_calls rows + the final prose row) merges into ONE assistant VM —
    // the same shape the live streaming path builds.
    expect(vms.some((m) => m.role === 'tool')).toBe(false);
    expect(vms.map((m) => m.id)).toEqual(['u1', 'a1']);
    expect(host.content).toBe('You are doing great!');

    // (d) timing fields are UNDEFINED on reload (no Date.now() deltas).
    for (const m of vms) {
      expect(m.turnStartedAt).toBeUndefined();
      expect(m.elapsedMs).toBeUndefined();
      for (const tc of m.toolCalls ?? []) {
        expect(tc.startedAt).toBeUndefined();
        expect(tc.durationMs).toBeUndefined();
      }
    }
  });

  test('(c) unresolved write/SRS tool → awaitingConfirmation; unresolved read tool → error', () => {
    const rows: PersistedMessageRow[] = [
      { id: 'u1', role: 'user', content: 'add a card' },
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'w1', name: 'create_card', arguments: JSON.stringify({ deckId: 'd1' }) },
          { id: 's1', name: 'search_cards', arguments: JSON.stringify({ query: 'q' }) },
        ],
      },
      // No role:'tool' rows follow → both calls are unresolved.
    ];

    const host = reconstructMessages(rows).find((m) => m.id === 'a1')!;
    const write = host.toolCalls!.find((c) => c.id === 'w1')!;
    const read = host.toolCalls!.find((c) => c.id === 's1')!;
    expect(write.awaitingConfirmation).toBe(true);
    expect(read.status).toBe('error');
  });
});

// ── Agentic-environment additions (B2/B4/B5/B6/D4) ────────────────────────────

describe('formatToolArgs (B5)', () => {
  test('object args render as compact key: value pairs — never [object Object]', () => {
    const s = formatToolArgs({ deckId: 'd1', fieldValues: { Front: 'Q' }, tags: ['a', 'b'] });
    expect(s).toBe('deckId: d1; fieldValues: {…}; tags: a, b');
    expect(s).not.toContain('[object Object]');
  });

  test('long strings truncate with an ellipsis', () => {
    const s = formatToolArgs({ query: 'x'.repeat(100) })!;
    expect(s.length).toBeLessThan(60);
    expect(s).toContain('…');
  });

  test('large arrays collapse to [N]; pair overflow collapses to …', () => {
    expect(formatToolArgs({ ids: [1, 2, 3, 4, 5] })).toBe('ids: [5]');
    const s = formatToolArgs({ a: 1, b: 2, c: 3, d: 4, e: 5 })!;
    expect(s.endsWith('…')).toBe(true);
  });

  test('null/undefined values skipped; empty object → undefined; non-object → String()', () => {
    expect(formatToolArgs({ a: null, b: undefined })).toBeUndefined();
    expect(formatToolArgs({})).toBeUndefined();
    expect(formatToolArgs(undefined)).toBeUndefined();
    expect(formatToolArgs('raw-string')).toBe('raw-string');
    expect(formatToolArgs(42)).toBe('42');
  });
});

describe('write-tool labels (B5)', () => {
  const fullId = '11111111-2222-3333-4444-555555555555';

  test('every write/SRS tool has a label key and an icon', () => {
    for (const name of ['create_card', 'edit_card', 'suspend', 'set_due', 'forget']) {
      expect(TOOL_LABEL_KEY[name]).toBe(`chat.tool.${name}`);
      expect(TOOL_ICON_KEY[name]).toBeDefined();
    }
  });

  test('edit_card/suspend/set_due/forget resolve the card front — never a UUID', () => {
    for (const name of ['edit_card', 'suspend', 'set_due', 'forget']) {
      const r = toolLabel(name, { cardId: fullId }, { resolveCardFront: () => 'Front text' });
      expect(r.labelKey).toBe(`chat.tool.${name}`);
      expect(r.params.front).toBe('Front text');
      expect(UUID_RE.test(JSON.stringify(r))).toBe(false);
    }
  });

  test('create_card resolves the deck name', () => {
    const r = toolLabel('create_card', { deckId: fullId }, { deckName: () => 'German' });
    expect(r.params.deck).toBe('German');
    expect(UUID_RE.test(JSON.stringify(r))).toBe(false);
  });

  test('create_card batch → the _batch label with a count (±deck)', () => {
    const cards = [{ fieldValues: {} }, { fieldValues: {} }, { fieldValues: {} }];
    const withDeck = toolLabel('create_card', { deckId: fullId, cards }, { deckName: () => 'German' });
    expect(withDeck.labelKey).toBe('chat.tool.create_card_batch');
    expect(withDeck.params).toEqual({ count: 3, deck: 'German' });
    const noDeck = toolLabel('create_card', { deckId: fullId, cards }, {});
    expect(noDeck.labelKey).toBe('chat.tool.create_card_batch_nodeck');
    expect(noDeck.params).toEqual({ count: 3 });
    // A single-entry "batch" keeps the singular phrasing.
    const single = toolLabel('create_card', { deckId: fullId, cards: cards.slice(0, 1) }, {});
    expect(single.labelKey).toBe('chat.tool.create_card_nodeck');
  });

  test('unknown tool gets a compact argMono line, never raw JSON', () => {
    const r = toolLabel('mystery_tool', { foo: 'bar', n: 3 }, {});
    expect(r.labelKey).toBe('chat.tool.mystery_tool');
    expect(r.argMono).toBe('foo: bar; n: 3');
  });

  test('fetch_page shows a compact URL (scheme/www stripped, truncated)', () => {
    const r = toolLabel('fetch_page', { url: 'https://www.docs.example.com/guide/intro' }, {});
    expect(r.labelKey).toBe('chat.tool.fetch_page');
    expect(r.argMono).toBe('docs.example.com/guide/intro');
    const long = toolLabel(
      'fetch_page',
      { url: `https://docs.example.com/${'x'.repeat(100)}` },
      {},
    );
    expect(long.argMono!.length).toBeLessThanOrEqual(61); // 60 + ellipsis
    expect(long.argMono!.endsWith('…')).toBe(true);
  });
});

describe('confirmDiffRows (B4/C8)', () => {
  test('edit_card: fieldDiffs + tagsChange become before/after rows', () => {
    const rows = confirmDiffRows('edit_card', {
      fieldDiffs: [{ field: 'Front', before: 'Old', after: 'New' }],
      tagsChange: { before: ['a'], after: ['b', 'c'] },
    });
    expect(rows).toEqual([
      { field: 'Front', before: 'Old', after: 'New' },
      { field: 'tags', before: 'a', after: 'b, c' },
    ]);
  });

  test('create_card: proposedFields become after-only rows', () => {
    const rows = confirmDiffRows('create_card', {
      willCreateCards: 1,
      proposedFields: [{ field: 'Front', value: 'Q' }],
    });
    expect(rows).toEqual([{ field: 'Front', after: 'Q' }]);
  });

  test('create_card batch: proposedCards become cardIndex-tagged rows in batch order', () => {
    const rows = confirmDiffRows('create_card', {
      willCreateCards: 2,
      proposedCards: [
        { fields: [{ field: 'Front', value: 'Q1' }, { field: 'Back', value: 'A1' }] },
        { fields: [{ field: 'Front', value: 'Q2' }] },
      ],
    });
    expect(rows).toEqual([
      { field: 'Front', after: 'Q1', cardIndex: 0 },
      { field: 'Back', after: 'A1', cardIndex: 0 },
      { field: 'Front', after: 'Q2', cardIndex: 1 },
    ]);
  });

  test('missing/old payloads degrade to []', () => {
    expect(confirmDiffRows('edit_card', undefined)).toEqual([]);
    expect(confirmDiffRows('edit_card', { willDeleteCards: 1 })).toEqual([]);
    expect(confirmDiffRows('suspend', { fieldDiffs: [] })).toEqual([]);
  });
});

describe('createCardDraft + buildCardSelections (per-card confirm editor)', () => {
  test('batch args → one draft per card; single fieldValues → one entry', () => {
    const batch = createCardDraft({
      deckId: 'd1',
      cards: [
        { fieldValues: { Front: 'Q1', Back: 'A1' } },
        { fieldValues: { Front: 'Q2', Back: 'A2' }, tags: ['t'] },
      ],
    });
    expect(batch).toEqual([
      { fieldValues: { Front: 'Q1', Back: 'A1' } },
      { fieldValues: { Front: 'Q2', Back: 'A2' } },
    ]);
    const single = createCardDraft({ deckId: 'd1', fieldValues: { Front: 'Q', Back: 'A' } });
    expect(single).toEqual([{ fieldValues: { Front: 'Q', Back: 'A' } }]);
  });

  test('malformed args degrade to null (read-only preview)', () => {
    expect(createCardDraft(null)).toBeNull();
    expect(createCardDraft({ deckId: 'd1' })).toBeNull();
    expect(createCardDraft({ deckId: 'd1', cards: [{ fieldValues: 'nope' }] })).toBeNull();
    expect(createCardDraft({ deckId: 'd1', cards: [] })).toBeNull();
  });

  test('selections carry ONLY excluded or actually-edited cards', () => {
    const draft = [
      { fieldValues: { Front: 'Q1', Back: 'A1' } },
      { fieldValues: { Front: 'Q2', Back: 'A2' } },
      { fieldValues: { Front: 'Q3', Back: 'A3' } },
    ];
    const state = [
      { include: true, fieldValues: { Front: 'Q1', Back: 'A1' } }, // untouched → omitted
      { include: false, fieldValues: { Front: 'Q2', Back: 'A2' } }, // excluded
      { include: true, fieldValues: { Front: 'Q3 edited', Back: 'A3' } }, // edited
    ];
    expect(buildCardSelections(draft, state)).toEqual([
      { index: 1, include: false },
      { index: 2, include: true, fieldValues: { Front: 'Q3 edited', Back: 'A3' } },
    ]);
    // Nothing touched → empty payload (apply exactly as proposed).
    expect(
      buildCardSelections(draft, draft.map((d) => ({ include: true, fieldValues: { ...d.fieldValues } }))),
    ).toEqual([]);
  });
});

describe('nextUndecidedIndex (confirm wizard navigation)', () => {
  test('advances to the next undecided card, wrapping past the end', () => {
    expect(nextUndecidedIndex([null, null, null], 0)).toBe(1);
    expect(nextUndecidedIndex(['accepted', null, null], 0)).toBe(1);
    // Wrap: deciding the last card jumps back to the still-undecided first one.
    expect(nextUndecidedIndex([null, 'accepted', 'excluded'], 2)).toBe(0);
    // Re-deciding an earlier card skips the already-decided neighbours.
    expect(nextUndecidedIndex(['accepted', 'excluded', null], 0)).toBe(2);
  });

  test('returns -1 when every card is decided (→ review step)', () => {
    expect(nextUndecidedIndex(['accepted', 'excluded'], 1)).toBe(-1);
    expect(nextUndecidedIndex(['accepted'], 0)).toBe(-1);
    expect(nextUndecidedIndex([], 0)).toBe(-1);
  });
});

describe('usageTotal (B6)', () => {
  test('prefers totalTokens, falls back to prompt+completion, guards NaN', () => {
    expect(usageTotal({ promptTokens: 10, completionTokens: 20, totalTokens: 30 })).toBe(30);
    expect(usageTotal({ promptTokens: 10, completionTokens: 20, totalTokens: NaN })).toBe(30);
    expect(usageTotal(undefined)).toBe(0);
    expect(usageTotal({ promptTokens: NaN, completionTokens: NaN, totalTokens: NaN })).toBe(0);
  });
});

describe('day separators (B2)', () => {
  test('dayKey uses LOCAL calendar days; invalid/missing → null', () => {
    expect(dayKey('not-a-date')).toBeNull();
    expect(dayKey(undefined)).toBeNull();
    const d = new Date(2026, 5, 10, 9, 30); // local June 10
    expect(dayKey(d.toISOString())).toBe('2026-06-10');
  });

  test('needsDaySeparator: first dated message yes, same-day no, cross-day yes', () => {
    const morning = new Date(2026, 5, 10, 9, 0).toISOString();
    const evening = new Date(2026, 5, 10, 21, 0).toISOString();
    const nextDay = new Date(2026, 5, 11, 1, 0).toISOString();
    expect(needsDaySeparator(undefined, morning)).toBe(true);
    expect(needsDaySeparator(morning, evening)).toBe(false);
    expect(needsDaySeparator(evening, nextDay)).toBe(true);
    expect(needsDaySeparator(morning, undefined)).toBe(false);
  });

  test('formatDayLabel: today/yesterday via i18n keys, older via locale date', () => {
    const now = new Date(2026, 5, 10, 12, 0);
    const today = new Date(2026, 5, 10, 8, 0).toISOString();
    const yesterday = new Date(2026, 5, 9, 8, 0).toISOString();
    const older = new Date(2026, 4, 1, 8, 0).toISOString();
    expect(formatDayLabel(today, 'en', t, now)).toBe('chat.stream.today');
    expect(formatDayLabel(yesterday, 'en', t, now)).toBe('chat.stream.yesterday');
    expect(formatDayLabel(older, 'en', t, now)).toContain('May');
    const lastYear = new Date(2025, 0, 15, 8, 0).toISOString();
    expect(formatDayLabel(lastYear, 'en', t, now)).toContain('2025');
  });
});

describe('hasPendingConfirmation (D4)', () => {
  test('true only while an undecided awaiting tool exists', () => {
    const base: MessageVM = { id: 'a', role: 'assistant', content: '', citations: [] };
    expect(hasPendingConfirmation([base])).toBe(false);
    const awaiting: MessageVM = {
      ...base,
      toolCalls: [{ id: 'w', name: 'create_card', args: {}, status: 'running', awaitingConfirmation: true }],
    };
    expect(hasPendingConfirmation([awaiting])).toBe(true);
    const decided: MessageVM = {
      ...base,
      toolCalls: [
        {
          id: 'w',
          name: 'create_card',
          args: {},
          status: 'running',
          awaitingConfirmation: true,
          decision: 'apply',
        },
      ],
    };
    expect(hasPendingConfirmation([decided])).toBe(false);
  });
});

describe('reconstructMessages — usage/model/mentions (C1/C7)', () => {
  test('assistant rows carry usage+model; user rows carry mentions', () => {
    const rows: PersistedMessageRow[] = [
      {
        id: 'u1',
        role: 'user',
        content: 'about this card',
        mentions: [{ cardId: 'c1', front: 'Front snap', deckName: 'Bio' }],
      },
      {
        id: 'a1',
        role: 'assistant',
        content: 'Answer.',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'm-deep',
      },
    ];
    const [user, answer] = reconstructMessages(rows);
    expect(user!.mentions).toEqual([{ cardId: 'c1', front: 'Front snap', deckName: 'Bio' }]);
    expect(answer!.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    expect(answer!.model).toBe('m-deep');
  });
});
