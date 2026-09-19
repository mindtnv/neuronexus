import { describe, expect, test } from 'bun:test';
import { BASIC_NOTE_TYPE } from './builtin-note-types';
import { generateCards } from './template';

describe('renderable question validation', () => {
  test('an unsupported image with alt text does not create an invisible question', () => {
    expect(generateCards(BASIC_NOTE_TYPE, { Front: '![hidden](https://example.test/image.png)', Back: 'answer' })).toEqual([]);
  });
  test('a sole raw HTML image gives an explicit format error without rewriting source', () => {
    expect(() => generateCards(BASIC_NOTE_TYPE, { Front: '<img src="/m/00000000-0000-0000-0000-000000000001">', Back: 'answer' }))
      .toThrow('html_image_requires_markdown');
  });
  test('a valid Markdown media-only question survives with an empty search front', () => {
    const cards = generateCards(BASIC_NOTE_TYPE, { Front: '![](/m/00000000-0000-0000-0000-000000000001)', Back: 'answer' });
    expect(cards).toHaveLength(1); expect(cards[0].renderFrontText).toBe('');
  });
});

describe('typed answers', () => {
  test('Markdown formatting is not part of the expected answer', () => {
    expect(fieldPlainText('**Paris**')).toBe('Paris');
    expect(fieldPlainText('[Paris](https://example.test)')).toBe('Paris');
    expect(fieldPlainText('`x < 2`')).toBe('x < 2');
  });
  test('explicit aliases match exactly, allowing only case, NFC and edge whitespace', () => {
    expect(typedAnswerTarget('  PARIS  ', 'Paris')).toBe('Paris');
    expect(typedAnswerTarget('Lutetia', 'Paris', ['Lutetia'])).toBe('Lutetia');
    expect(typedAnswerTarget('Lutetio', 'Paris', ['Lutetia'])).toBe('Paris');
    expect(typedAnswerTarget('e\u0301', 'é')).toBe('é');
    expect(acceptedAnswerVariants([' Paris ', 'PARIS', 'Lutetia'])).toEqual(['PARIS', 'Lutetia']);
    expect(() => acceptedAnswerVariants([''])).toThrow('invalid_accepted_answers');
  });
  test('custom questions can use a later field while the first field is empty', () => {
    const def = { ...BASIC_NOTE_TYPE, fields: [{ name: 'Extra', ord: 0 }, { name: 'Question', ord: 1 }],
      templates: [{ name: 'Card', ord: 0, frontTemplate: '{{Question}}', backTemplate: '{{Extra}}' }] };
    expect(generateCards(def, { Extra: '', Question: 'Visible question' })).toHaveLength(1);
  });
});
import { fieldPlainText } from './template';
import { acceptedAnswerVariants, typedAnswerTarget } from './note-content';

test('prototype-named answer fields only accept actual stored text', () => {
  const def = { ...BASIC_NOTE_TYPE, kind: 'typein' as const, fields: [{ name: 'Front', ord: 0 }, { name: 'constructor', ord: 1, typeinAnswer: true }],
    templates: [{ name: 'Card', ord: 0, frontTemplate: '{{Front}}', backTemplate: '{{constructor}}' }] };
  expect(() => generateCards(def, { Front: 'Question' })).toThrow('typein_answer_required');
  expect(generateCards(def, Object.fromEntries([['Front', 'Question'], ['constructor', '**Answer**']]))[0].renderBackText).toBe('Answer');
});


test('template content removed by the display sanitizer cannot become a phantom question', () => {
  for (const tag of ['script', 'style', 'svg', 'math', 'iframe', 'template', 'title', 'video']) {
    const def = { ...BASIC_NOTE_TYPE, templates: [{ ...BASIC_NOTE_TYPE.templates[0], frontTemplate: `<${tag}>hidden</${tag}>` }] };
    expect(() => generateCards(def, { Front: 'Question', Back: 'Answer' })).toThrow('invalid_template');
  }
  const comment = { ...BASIC_NOTE_TYPE, templates: [{ ...BASIC_NOTE_TYPE.templates[0], frontTemplate: '<!-- <script>not displayed</script> -->{{Front}}' }] };
  expect(generateCards(comment, { Front: 'Question', Back: 'Answer' })[0].renderFrontText).toBe('Question');
  const wrapper = { ...BASIC_NOTE_TYPE, templates: [{ ...BASIC_NOTE_TYPE.templates[0], frontTemplate: '<section><a href="https://example.test/?q=<script>">{{Front}}</a></section>' }] };
  expect(generateCards(wrapper, { Front: 'Question', Back: 'Answer' })).toHaveLength(1);
});
