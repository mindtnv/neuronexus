import { describe, expect, test } from 'bun:test';
import { stripCloze } from './card-query-match';
import { generateCards } from './template';
import { CLOZE_NOTE_TYPE } from './builtin-note-types';
import { ClozeSyntaxError } from './cloze';

describe('structured cloze', () => {
  test('hints are separate from the revealed answer', () => {
    expect(stripCloze('{{c1::Paris::city}}', 'prompt')).toBe('[city]');
    expect(stripCloze('{{c1::Paris::city}}', 'answer')).toBe('Paris');
  });
  test('braces in formulas are balanced', () => {
    expect(stripCloze('{{c1::x^{2}}}', 'prompt')).toBe('[…]');
    expect(stripCloze('{{c1::x^{2}}}', 'answer')).toBe('x^{2}');
  });
  test('nested clozes retain their context', () => {
    expect(stripCloze('{{c1::outer {{c2::inner}} text}}', 'answer')).toBe('outer inner text');
  });
  test('different numbers generate independent questions and repeated numbers group together', () => {
    const cards = generateCards(CLOZE_NOTE_TYPE, { Text: '{{c1::Paris::city}} is in {{c2::France}}, {{c1::Europe}}', Extra: '' });
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ clozeNumber: 1, renderFrontText: '[city] is in France, […]' });
    expect(cards[1]).toMatchObject({ clozeNumber: 2, renderFrontText: 'Paris is in […], Europe' });
  });
  test('code examples do not create cloze cards', () => {
    expect(generateCards(CLOZE_NOTE_TYPE, { Text: '`{{c1::example}}`\n\n```text\n{{c2::example}}\n```' })).toEqual([]);
  });
  test('only groups on the question side generate cards', () => {
    expect(generateCards(CLOZE_NOTE_TYPE, { Text: '{{c1::Question}}', Extra: '{{c2::Extra}}' }).map((card) => card.clozeNumber)).toEqual([1]);
  });
  test('template HTML cannot manufacture cloze numbers', () => {
    const type = { ...CLOZE_NOTE_TYPE, templates: [{ ...CLOZE_NOTE_TYPE.templates[0], frontTemplate: '<span data-nn-cloze="99"></span>{{Text}}' }] };
    expect(generateCards(type, { Text: '{{c1::Real}}' }).map((card) => card.clozeNumber)).toEqual([1]);
  });
  test('nested groups and code inside an answer are distinguished', () => {
    const cards = generateCards(CLOZE_NOTE_TYPE, { Text: '{{c1::outer {{c2::inner}} `{{c3::example}}`}}' });
    expect(cards.map((card) => card.clozeNumber)).toEqual([1, 2]);
    expect(cards[1].renderFrontText).toBe('outer […] {{c3::example}}');
  });
  test('cloze within math does not expose the answer on the question side', () => {
    const [card] = generateCards(CLOZE_NOTE_TYPE, { Text: '\\(x={{c1::\\frac{1}{2}::fraction}}\\)' });
    expect(card.clozeNumber).toBe(1);
    expect(card.renderFrontText).not.toContain('frac{1}');
    expect(card.renderBackText).toContain('frac{1}{2}');
  });
  for (const Text of ['{{c0::bad}}', '{{c2147483648::bad}}', '{{c1::}}', '{{c1::unclosed', '{{c1::x}} {{c2:bad}}', '{{c1::'.repeat(9) + 'deep' + '}}'.repeat(9)]) {
    test(`invalid source is rejected: ${Text.slice(0, 25)}`, () => {
      expect(() => generateCards(CLOZE_NOTE_TYPE, { Text })).toThrow(ClozeSyntaxError);
    });
  }
  test('too many generated questions fails explicitly instead of truncating', () => {
    expect(() => generateCards(CLOZE_NOTE_TYPE, { Text: Array.from({ length: 129 }, (_, i) => `{{c${i + 1}::answer}}`).join(' ') })).toThrow('too_many_cloze_cards');
  });
  test('legacy zero-number syntax remains readable without becoming a new numbered question', () => {
    expect(generateCards(CLOZE_NOTE_TYPE, { Text: '{{c0::Legacy}}' }, { legacyCloze: true })[0])
      .toMatchObject({ clozeNumber: 0, renderFrontText: '[…]', renderBackText: 'Legacy' });
    expect(generateCards(CLOZE_NOTE_TYPE, { Text: '{{c10000::Large number}}' })[0].clozeNumber).toBe(10000);
  });
  test('math and code-like characters cannot bypass the total nesting limit', () => {
    const nested = '{{c2::'.repeat(8) + '`value`' + '}}'.repeat(8);
    expect(() => generateCards(CLOZE_NOTE_TYPE, { Text: `{{c1::\\(${nested}\\)}}` })).toThrow(ClozeSyntaxError);
  });
});
