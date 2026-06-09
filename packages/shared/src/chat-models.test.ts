// Unit tests for the CHAT_MODELS allow-list parser (S2 / AC2.1).

import { describe, expect, test } from 'bun:test';
import { isAllowedModel, parseChatModels } from './chat-models.ts';

describe('parseChatModels', () => {
  test('undefined → []', () => {
    expect(parseChatModels(undefined)).toEqual([]);
  });

  test('empty / whitespace-only → []', () => {
    expect(parseChatModels('')).toEqual([]);
    expect(parseChatModels('   ')).toEqual([]);
  });

  test('single id ⇒ label = id, default = true', () => {
    expect(parseChatModels('gpt-4o-mini')).toEqual([
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini', default: true },
    ]);
  });

  test('id|label split', () => {
    expect(parseChatModels('gpt-5.5high|Глубоко')).toEqual([
      { id: 'gpt-5.5high', label: 'Глубоко', default: true },
    ]);
  });

  test('first entry is the ONLY default; order preserved', () => {
    const models = parseChatModels('a|Fast,b|Balanced,c|Deep');
    expect(models).toEqual([
      { id: 'a', label: 'Fast', default: true },
      { id: 'b', label: 'Balanced', default: false },
      { id: 'c', label: 'Deep', default: false },
    ]);
    expect(models.filter((m) => m.default).length).toBe(1);
  });

  test('whitespace around ids and labels is trimmed', () => {
    expect(parseChatModels('  a  |  Fast  ,  b ')).toEqual([
      { id: 'a', label: 'Fast', default: true },
      { id: 'b', label: 'b', default: false },
    ]);
  });

  test('blank entries are dropped (trailing comma, empty segment)', () => {
    expect(parseChatModels('a,,b,')).toEqual([
      { id: 'a', label: 'a', default: true },
      { id: 'b', label: 'b', default: false },
    ]);
  });

  test('duplicate id de-dup — first occurrence (and its label/default) wins', () => {
    expect(parseChatModels('a|First,a|Second,b')).toEqual([
      { id: 'a', label: 'First', default: true },
      { id: 'b', label: 'b', default: false },
    ]);
  });

  test('empty-id entry with a label (|Label) is dropped', () => {
    expect(parseChatModels('|Orphan,a')).toEqual([
      { id: 'a', label: 'a', default: true },
    ]);
  });
});

describe('isAllowedModel', () => {
  const models = parseChatModels('a|Fast,b|Deep');

  test('id present ⇒ true', () => {
    expect(isAllowedModel(models, 'a')).toBe(true);
    expect(isAllowedModel(models, 'b')).toBe(true);
  });

  test('id absent ⇒ false', () => {
    expect(isAllowedModel(models, 'c')).toBe(false);
  });

  test('empty allow-list ⇒ always false', () => {
    expect(isAllowedModel([], 'a')).toBe(false);
  });
});
