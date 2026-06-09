// Pure unit tests for tool registry gating + OpenAI schema mapping + the agent
// system prompt contract + the count-neutral write/SRS dryRun impact (Phase B).
// No DB / network — these read no rows.

import { describe, expect, test, afterEach } from 'bun:test';
import { buildToolRegistry, toOpenAiTools, type Tool } from './tools.ts';
import { __setWebSearchProviderForTests, __resetWebSearchProviderForTests } from './web-search.ts';
import { buildAgentSystemPrompt } from '@neuronexus/shared';

// The write/SRS tools always present in Phase B (no extra env gate).
const WRITE_SRS_TOOLS = ['create_card', 'edit_card', 'suspend', 'set_due', 'forget'];

describe('buildToolRegistry — web_search gating', () => {
  afterEach(() => __resetWebSearchProviderForTests());

  test('excludes web_search when disabled (write/SRS still present)', () => {
    const names = buildToolRegistry({ webSearchEnabled: false }).map((t) => t.name);
    expect(names).toEqual(['search_cards', ...WRITE_SRS_TOOLS]);
  });

  test('includes web_search when enabled', () => {
    const names = buildToolRegistry({ webSearchEnabled: true }).map((t) => t.name);
    expect(names).toContain('search_cards');
    expect(names).toContain('web_search');
  });

  test('a test-injected provider flips the tool on via isWebSearchEnabled()', () => {
    __setWebSearchProviderForTests({ async search() { return []; } });
    const names = buildToolRegistry().map((t) => t.name); // no explicit flag → reads isWebSearchEnabled
    expect(names).toContain('web_search');
    __setWebSearchProviderForTests(null);
    const off = buildToolRegistry().map((t) => t.name);
    expect(off).toEqual(['search_cards', ...WRITE_SRS_TOOLS]);
  });
});

describe('buildToolRegistry — write/SRS tools (Phase B)', () => {
  test('write/SRS tools are ALWAYS present (no extra gate beyond chatEnabled)', () => {
    const reg = buildToolRegistry({ webSearchEnabled: false });
    for (const name of WRITE_SRS_TOOLS) {
      expect(reg.map((t) => t.name)).toContain(name);
    }
  });

  test('write/SRS tools declare the correct kind + carry a dryRun', () => {
    const byName = new Map(buildToolRegistry({ webSearchEnabled: false }).map((t) => [t.name, t]));
    expect(byName.get('create_card')!.kind).toBe('write');
    expect(byName.get('edit_card')!.kind).toBe('write');
    expect(byName.get('suspend')!.kind).toBe('srs');
    expect(byName.get('set_due')!.kind).toBe('srs');
    expect(byName.get('forget')!.kind).toBe('srs');
    for (const name of WRITE_SRS_TOOLS) {
      expect(typeof byName.get(name)!.dryRun).toBe('function');
    }
  });

  test('read tools (search_cards/web_search) declare kind:read + omit dryRun', () => {
    const byName = new Map(buildToolRegistry({ webSearchEnabled: true }).map((t) => [t.name, t]));
    expect(byName.get('search_cards')!.kind).toBe('read');
    expect(byName.get('search_cards')!.dryRun).toBeUndefined();
    expect(byName.get('web_search')!.kind).toBe('read');
    expect(byName.get('web_search')!.dryRun).toBeUndefined();
  });
});

describe('SRS dryRun — count-neutral (no DB, returns {})', () => {
  const ctx = { userId: 'u', log: console as never };
  const byName = new Map(buildToolRegistry({ webSearchEnabled: false }).map((t) => [t.name, t]));

  test.each(['suspend', 'set_due', 'forget'])(
    '%s.dryRun → empty impact (no willCreate/willDelete)',
    async (name) => {
      const tool = byName.get(name) as Tool;
      const impact = await tool.dryRun!(ctx, { cardId: 'c1', due: '2030-01-01T00:00:00Z', suspended: true });
      expect(impact).toEqual({});
    },
  );

  test('create_card.dryRun with invalid/empty args → empty impact (no throw)', async () => {
    const tool = byName.get('create_card') as Tool;
    // Missing deckId/fieldValues short-circuits before any DB access.
    await expect(tool.dryRun!(ctx, {})).resolves.toEqual({});
  });

  test('edit_card.dryRun for a deck-move/suspend-only edit → count-neutral {}', async () => {
    const tool = byName.get('edit_card') as Tool;
    // No fieldValues/tags → no regeneration → no DB read, empty impact.
    const impact = await tool.dryRun!(ctx, { cardId: 'c1', deckId: 'd2', suspended: true });
    expect(impact).toEqual({});
  });
});

describe('toOpenAiTools — gateway schema shape', () => {
  test('maps each tool to {type:function, function:{name,description,parameters}}', () => {
    const specs = toOpenAiTools(buildToolRegistry({ webSearchEnabled: true }));
    for (const s of specs) {
      expect(s.type).toBe('function');
      expect(typeof s.function.name).toBe('string');
      expect(typeof s.function.description).toBe('string');
      expect(s.function.parameters).toBeDefined();
    }
    expect(specs.map((s) => s.function.name)).toEqual([
      'search_cards',
      'web_search',
      ...WRITE_SRS_TOOLS,
    ]);
  });
});

describe('buildAgentSystemPrompt — behavioral contract', () => {
  test('instructs tool-use on-topic + direct answer for meta/small-talk', () => {
    const p = buildAgentSystemPrompt({ webSearchEnabled: true });
    expect(p).toContain('search_cards');
    expect(p).toMatch(/meta|small talk|what did/i);
    expect(p).toContain('web_search');
    expect(p).toMatch(/\[card:<cardId>\]/);
  });

  test('omits web_search guidance when not offered', () => {
    const p = buildAgentSystemPrompt({ webSearchEnabled: false });
    expect(p).toContain('search_cards');
    expect(p).toMatch(/NO web access/i);
  });
});
