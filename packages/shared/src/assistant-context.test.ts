import { describe, expect, test } from 'bun:test';
import {
  ASSISTANT_CONTEXT_LIMITS,
  assistantRefKey,
  mergeAssistantSnapshots,
  parseAssistantContext,
} from './assistant-context';

const id = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;

describe('assistant context admission', () => {
  test('a narrower message selection replaces its pinned notebook context in every surface',()=>{
    const pin={ref:{kind:'notebook' as const,id:id(1),sourceIds:[id(2)]},label:'Book',available:true};
    const empty={...pin,ref:{...pin.ref,sourceIds:[]}};
    expect(mergeAssistantSnapshots([pin],[empty])).toEqual([empty]);
    expect(pin.ref.sourceIds).toEqual([id(2)]);
  });
  test('defaults to focus and preserves an explicit empty strict selection', () => {
    expect(parseAssistantContext({ version: 1, refs: [] })).toEqual({ version: 1, policy: 'focus', refs: [] });
    expect(parseAssistantContext({ version: 1, policy: 'strict', refs: [{ kind: 'notebook', id: id(1), sourceIds: [] }] }).refs[0])
      .toEqual({ kind: 'notebook', id: id(1), sourceIds: [] });
  });

  test('deduplicates before the effective ref limit without merging distinct passages', () => {
    const source = { kind: 'source' as const, id: id(1) };
    expect(parseAssistantContext({ version: 1, refs: Array(30).fill(source) }).refs).toEqual([source]);
    const a = { kind: 'source_passage' as const, id: id(1), locator: { chunkId: id(2), quote: 'Pod' } };
    const b = { ...a, locator: { ...a.locator, quote: 'Deployment' } };
    expect(assistantRefKey(a)).not.toBe(assistantRefKey(b));
    expect(parseAssistantContext({ version: 1, refs: [a, b, a] }).refs).toEqual([a, b]);
  });

  test('rejects unknown types, versions, forged metadata, and malformed IDs', () => {
    for (const ref of [
      { kind: 'token', id: id(1) }, { kind: 'card', id: 'not-an-id' },
      { kind: 'card', id: id(1), label: 'pretend trusted title' },
      { kind: 'card', id: id(1), sourceIds: [] },
      { kind: 'source_passage', id: id(1), locator: { page: -1 } },
      { kind: 'source_passage', id: id(1), locator: { chunkId: id(2), start: 9, end: 2 } },
    ]) expect(() => parseAssistantContext({ version: 1, refs: [ref] })).toThrow();
    expect(() => parseAssistantContext({ version: 2, refs: [] })).toThrow();
  });

  test('rejects over-budget objects and excerpts rather than truncating', () => {
    expect(() => parseAssistantContext({ version: 1, refs: Array.from({ length: 17 }, (_, n) => ({ kind: 'card', id: id(n) })) }))
      .toThrow('context_too_many_refs');
    const passage = (n: number, quote: string) => ({ kind: 'source_passage', id: id(n), locator: { quote } });
    expect(() => parseAssistantContext({ version: 1, refs: [passage(1, 'a'.repeat(4001))] })).toThrow('context_excerpt_too_large');
    expect(() => parseAssistantContext({ version: 1, refs: Array.from({ length: 7 }, (_, n) => passage(n, 'a'.repeat(4000))) }))
      .toThrow('context_payload_too_large');
    expect(ASSISTANT_CONTEXT_LIMITS.refs).toBe(16);
  });

  test('normalizes notebook membership order and bounds passage locators', () => {
    const a = { kind: 'notebook' as const, id: id(1), sourceIds: [id(3), id(2), id(3)] };
    const b = { ...a, sourceIds: [id(2), id(3)] };
    expect(parseAssistantContext({ version: 1, refs: [a, b] }).refs).toEqual([b]);
    expect(() => parseAssistantContext({ version: 1, refs: [{ kind: 'source_passage', id: id(1), locator: {} }] })).toThrow();
    expect(() => parseAssistantContext({ version: 1, refs: [{ kind: 'source_passage', id: id(1), locator: { page: 1.5 } }] })).toThrow();
  });
});
