import { describe, expect, test } from 'bun:test';
import { buildRagPrompt } from './rag-prompt.ts';
import type { RagChunk, RagHistoryMessage } from './rag-prompt.ts';

const CARD_ID_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const CARD_ID_B = 'bbbbbbbb-0000-0000-0000-000000000001';

const chunk = (cardId: string, text: string, deckName?: string): RagChunk => ({
  cardId,
  text,
  deckName,
});

// ── system prompt — grounding contract ─────────────────────────────────────

describe('buildRagPrompt — system prompt grounding contract', () => {
  const { system } = buildRagPrompt({
    query: 'What is a cell?',
    chunks: [chunk(CARD_ID_A, 'The cell is the basic unit of life.')],
    history: [],
  });

  test('system prompt mandates card-only grounding', () => {
    expect(system.toLowerCase()).toMatch(/answer only/i);
  });

  test('system prompt encodes honest "not in your cards" instruction', () => {
    expect(system).toMatch(/not in your cards/i);
  });

  test('system prompt requires explicit general-knowledge labeling', () => {
    // Must instruct the model to label outside-cards additions explicitly.
    expect(system).toMatch(/outside your cards/i);
  });

  test('system prompt requires [card:<cardId>] citation tokens', () => {
    expect(system).toMatch(/\[card:<cardId>\]|\[card:<id>\]|\[card:.*\]/i);
  });
});

// ── context block — card ids appear in messages ────────────────────────────

describe('buildRagPrompt — context injection', () => {
  test('card ids appear in messages when chunks are provided', () => {
    const { messages } = buildRagPrompt({
      query: 'Tell me about cells.',
      chunks: [
        chunk(CARD_ID_A, 'Cells are the building blocks of life.', 'Biology'),
        chunk(CARD_ID_B, 'The nucleus contains the DNA.'),
      ],
      history: [],
    });
    const allContent = messages.map((m) => m.content).join('\n');
    expect(allContent).toContain(CARD_ID_A);
    expect(allContent).toContain(CARD_ID_B);
  });

  test('chunk text appears in messages', () => {
    const text = 'Photosynthesis converts light to energy.';
    const { messages } = buildRagPrompt({
      query: 'How do plants make food?',
      chunks: [chunk(CARD_ID_A, text)],
      history: [],
    });
    const allContent = messages.map((m) => m.content).join('\n');
    expect(allContent).toContain(text);
  });

  test('deckName is included in context when provided', () => {
    const { messages } = buildRagPrompt({
      query: 'q',
      chunks: [chunk(CARD_ID_A, 'some text', 'Chemistry Deck')],
      history: [],
    });
    const allContent = messages.map((m) => m.content).join('\n');
    expect(allContent).toContain('Chemistry Deck');
  });
});

// ── empty context — "not in your cards" system ────────────────────────────

describe('buildRagPrompt — empty context branch', () => {
  const result = buildRagPrompt({ query: 'What is dark matter?', chunks: [], history: [] });

  test('uses the not-found system prompt when no chunks', () => {
    expect(result.system).toMatch(/not in your cards/i);
  });

  test('not-found system prompt tells model not to use general knowledge', () => {
    expect(result.system.toLowerCase()).toMatch(/not.*in your cards|general knowledge|outside knowledge/);
  });

  test('not-found system prompt allows natural small-talk replies (no robotic "not in cards" for greetings)', () => {
    expect(result.system.toLowerCase()).toMatch(/small talk|greeting/);
  });

  test('not-found system prompt still forbids fabricating card content', () => {
    expect(result.system.toLowerCase()).toMatch(/fabricate|outside knowledge|not answer factual/);
  });

  test('no card-context block injected when chunks is empty', () => {
    const allContent = result.messages.map((m) => m.content).join('\n');
    expect(allContent).not.toContain('<card_context>');
  });

  test('user query is still the last message', () => {
    const last = result.messages[result.messages.length - 1];
    expect(last.role).toBe('user');
    expect(last.content).toBe('What is dark matter?');
  });
});

// ── history threading ──────────────────────────────────────────────────────

describe('buildRagPrompt — history threading', () => {
  const history: RagHistoryMessage[] = [
    { role: 'user', content: 'First question' },
    { role: 'assistant', content: 'First answer' },
  ];

  test('history turns appear before the current query', () => {
    const { messages } = buildRagPrompt({
      query: 'Second question',
      chunks: [chunk(CARD_ID_A, 'Some card text.')],
      history,
    });

    const roles = messages.map((m) => m.role);
    const contents = messages.map((m) => m.content);

    // history messages exist
    expect(contents).toContain('First question');
    expect(contents).toContain('First answer');

    // current query is last
    expect(contents[contents.length - 1]).toBe('Second question');
    expect(roles[roles.length - 1]).toBe('user');
  });

  test('history is threaded in the correct role order', () => {
    const { messages } = buildRagPrompt({
      query: 'Second question',
      chunks: [chunk(CARD_ID_A, 'text')],
      history,
    });

    // Find the two history messages
    const historyMsgs = messages.filter(
      (m) => m.content === 'First question' || m.content === 'First answer',
    );
    expect(historyMsgs[0].role).toBe('user');
    expect(historyMsgs[1].role).toBe('assistant');
  });

  test('empty history produces only context + current query', () => {
    const { messages } = buildRagPrompt({
      query: 'Question',
      chunks: [chunk(CARD_ID_A, 'card text')],
      history: [],
    });

    // system context message + user query = 2 messages
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });
});

// ── result shape ───────────────────────────────────────────────────────────

describe('buildRagPrompt — result shape', () => {
  test('returns system string and messages array', () => {
    const result = buildRagPrompt({ query: 'q', chunks: [], history: [] });
    expect(typeof result.system).toBe('string');
    expect(Array.isArray(result.messages)).toBe(true);
  });

  test('current query is always the last message', () => {
    const query = 'Test query';
    for (const chunks of [
      [],
      [chunk(CARD_ID_A, 'text')],
    ]) {
      const { messages } = buildRagPrompt({ query, chunks, history: [] });
      const last = messages[messages.length - 1];
      expect(last.role).toBe('user');
      expect(last.content).toBe(query);
    }
  });
});
