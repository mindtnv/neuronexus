import { describe, expect, test } from 'bun:test';
import { BASIC_NOTE_TYPE } from './builtin-note-types';
import { generateCards } from './template';

describe('search and visible question fidelity', () => {
  for (const Front of ['`Array<T>`', '```ts\nArray<T>\n```']) {
    test(`retains literal code in ${Front}`, () => {
      expect(generateCards(BASIC_NOTE_TYPE, { Front, Back: 'answer' })[0].renderFrontText).toBe('Array<T>');
    });
  }
  test('image-only question survives without indexing the storage token', () => {
    const cards = generateCards(BASIC_NOTE_TYPE, { Front: '![](/m/00000000-0000-0000-0000-000000000001)', Back: 'answer' });
    expect(cards).toHaveLength(1);
    expect(cards[0].renderFrontText).toBe('');
    expect(cards[0].renderText).toBe('answer');
  });
  test('code preserves literal math and entity examples in search', () => {
    const Front = '`\\(x\\) &lt;`';
    expect(generateCards(BASIC_NOTE_TYPE, { Front, Back: '' })[0].renderFrontText).toBe('\\(x\\) &lt;');
  });
});
