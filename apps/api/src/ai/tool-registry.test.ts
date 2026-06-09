// Pure unit tests for tool registry gating + OpenAI schema mapping + the agent
// system prompt contract. No DB / network — these read no rows.

import { describe, expect, test, afterEach } from 'bun:test';
import { buildToolRegistry, toOpenAiTools } from './tools.ts';
import { __setWebSearchProviderForTests, __resetWebSearchProviderForTests } from './web-search.ts';
import { buildAgentSystemPrompt } from '@neuronexus/shared';

describe('buildToolRegistry — web_search gating', () => {
  afterEach(() => __resetWebSearchProviderForTests());

  test('excludes web_search when disabled', () => {
    const names = buildToolRegistry({ webSearchEnabled: false }).map((t) => t.name);
    expect(names).toEqual(['search_cards']);
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
    expect(off).toEqual(['search_cards']);
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
    expect(specs.map((s) => s.function.name)).toEqual(['search_cards', 'web_search']);
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
