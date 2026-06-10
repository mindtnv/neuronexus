// Unit tests for the composer @-mention + /slash trigger helpers (D1/D2).

import { describe, expect, test } from 'bun:test';
import {
  applyTrigger,
  detectComposerTrigger,
  filterSlashCommands,
  searchMentions,
  slashTemplate,
  SLASH_COMMANDS,
} from './chat-mentions';

const t = (key: string, params?: Record<string, string | number>): string =>
  params ? `${key}|${JSON.stringify(params)}` : key;

describe('detectComposerTrigger', () => {
  test('@ at the start or after whitespace opens a mention trigger', () => {
    expect(detectComposerTrigger('@ger', 4)).toEqual({ kind: 'mention', query: 'ger', start: 0 });
    expect(detectComposerTrigger('tell me about @mito', 19)).toEqual({
      kind: 'mention',
      query: 'mito',
      start: 14,
    });
  });

  test('@ glued to a word (a@b — emails) is NOT a trigger', () => {
    expect(detectComposerTrigger('mail me a@b', 11)).toBeNull();
  });

  test('mention query may contain spaces (multi-word deck names) but not newlines', () => {
    expect(detectComposerTrigger('@german verbs', 13)).toEqual({
      kind: 'mention',
      query: 'german verbs',
      start: 0,
    });
    expect(detectComposerTrigger('@a\nb', 4)).toBeNull();
  });

  test('overlong query (>40 chars) closes the trigger', () => {
    expect(detectComposerTrigger(`@${'x'.repeat(41)}`, 42)).toBeNull();
  });

  test('slash only at the very start of the draft', () => {
    expect(detectComposerTrigger('/qu', 3)).toEqual({ kind: 'slash', query: 'qu', start: 0 });
    expect(detectComposerTrigger('/', 1)).toEqual({ kind: 'slash', query: '', start: 0 });
    expect(detectComposerTrigger('what about /quiz', 16)).toBeNull();
  });

  test('caret before the trigger char → no trigger', () => {
    expect(detectComposerTrigger('@abc', 0)).toBeNull();
  });
});

describe('applyTrigger', () => {
  test('splices the trigger text out and positions the caret', () => {
    const trigger = detectComposerTrigger('tell me about @mito and more', 19)!;
    const r = applyTrigger('tell me about @mito and more', trigger, 19, '');
    expect(r.value).toBe('tell me about  and more');
    expect(r.caret).toBe(14);
  });

  test('replacement text is inserted at the trigger position', () => {
    const trigger = detectComposerTrigger('/qu', 3)!;
    const r = applyTrigger('/qu', trigger, 3, 'Quiz me!');
    expect(r.value).toBe('Quiz me!');
    expect(r.caret).toBe(8);
  });
});

describe('searchMentions', () => {
  const decks = [
    { id: 'd1', name: 'German' },
    { id: 'd2', name: 'Biology' },
    { id: 'd3', name: 'Algorithms' },
  ];
  const cards = [
    { id: 'c1', front: 'What is mitosis?', deckId: 'd2' },
    { id: 'c2', front: 'Der Hund', deckId: 'd1' },
  ];

  test('case-insensitive substring over deck names + card fronts', () => {
    const r = searchMentions(decks, cards, 'bio');
    expect(r.decks.map((d) => d.id)).toEqual(['d2']);
    expect(r.cards).toHaveLength(0);
    const r2 = searchMentions(decks, cards, 'mito');
    expect(r2.cards.map((c) => c.id)).toEqual(['c1']);
  });

  test('empty query: alphabetical decks + mirror-order cards, caps respected', () => {
    const r = searchMentions(decks, cards, '', { decks: 2, cards: 1 });
    expect(r.decks.map((d) => d.name)).toEqual(['Algorithms', 'Biology']);
    expect(r.cards.map((c) => c.id)).toEqual(['c1']);
  });
});

describe('slash commands', () => {
  test('filterSlashCommands prefixes', () => {
    expect(filterSlashCommands('')).toEqual([...SLASH_COMMANDS]);
    expect(filterSlashCommands('q')).toEqual(['quiz']);
    expect(filterSlashCommands('zzz')).toEqual([]);
  });

  test('slashTemplate interpolates the deck name', () => {
    expect(slashTemplate('quiz', t, 'German')).toBe('chat.slash.quizTemplate|{"deck":"German"}');
    expect(slashTemplate('forecast', t)).toBe('chat.slash.forecastTemplate|{"deck":""}');
  });
});
