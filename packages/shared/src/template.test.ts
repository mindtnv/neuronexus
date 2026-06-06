import { describe, expect, test } from 'bun:test';
import {
  escapeHtml,
  extractMath,
  generateCards,
  renderTemplate,
  renderTextFor,
  stripMath,
} from './template.ts';
import type { NoteTypeDef } from './note-type.ts';

describe('escapeHtml', () => {
  test('escapes all 5 HTML-significant chars', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  test('escapes ampersand before other entities (no double-encode)', () => {
    expect(escapeHtml('a&b<c')).toBe('a&amp;b&lt;c');
  });

  test('leaves a plain string untouched', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('renderTemplate — substitution', () => {
  test('substitutes a known field verbatim', () => {
    expect(renderTemplate('{{Front}}', { Front: '<b>Hi</b>' })).toBe('<b>Hi</b>');
  });

  test('unknown field renders as empty string', () => {
    expect(renderTemplate('a{{Missing}}b', { Front: 'x' })).toBe('ab');
  });

  test('tolerates whitespace inside the tag', () => {
    expect(renderTemplate('{{  Front  }}', { Front: 'ok' })).toBe('ok');
  });

  test('multiple fields + literal text', () => {
    expect(renderTemplate('{{Front}}<hr>{{Back}}', { Front: 'Q', Back: 'A' })).toBe('Q<hr>A');
  });
});

describe('renderTemplate — conditional + inverted sections', () => {
  const fields = { Extra: 'note', Empty: '   ' };

  test('{{#Field}} renders block when field is non-empty', () => {
    expect(renderTemplate('{{#Extra}}<hr>{{Extra}}{{/Extra}}', fields)).toBe('<hr>note');
  });

  test('{{#Field}} skips block when field is empty/whitespace', () => {
    expect(renderTemplate('{{#Empty}}X{{/Empty}}', fields)).toBe('');
  });

  test('{{#Field}} skips block when field is missing', () => {
    expect(renderTemplate('{{#Nope}}X{{/Nope}}', fields)).toBe('');
  });

  test('{{^Field}} renders block when field is empty/missing', () => {
    expect(renderTemplate('{{^Empty}}fallback{{/Empty}}', fields)).toBe('fallback');
    expect(renderTemplate('{{^Nope}}fallback{{/Nope}}', fields)).toBe('fallback');
  });

  test('{{^Field}} skips block when field is non-empty', () => {
    expect(renderTemplate('{{^Extra}}fallback{{/Extra}}', fields)).toBe('');
  });

  test('nested sections render correctly', () => {
    const tpl = '{{#Extra}}A{{#Inner}}B{{/Inner}}C{{/Extra}}';
    expect(renderTemplate(tpl, { Extra: 'x', Inner: 'y' })).toBe('ABC');
    expect(renderTemplate(tpl, { Extra: 'x' })).toBe('AC');
  });
});

describe('renderTemplate — cloze prompt vs answer', () => {
  const fields = { Text: 'The {{c1::mitochondria}} is the {{c2::powerhouse}}.' };

  test('front side renders cloze blanks', () => {
    expect(renderTemplate('{{Text}}', fields, { side: 'front', cloze: true })).toBe(
      'The […] is the […].',
    );
  });

  test('back side renders revealed answers', () => {
    expect(renderTemplate('{{Text}}', fields, { side: 'back', cloze: true })).toBe(
      'The mitochondria is the powerhouse.',
    );
  });

  test('without cloze opt, markup passes through untouched', () => {
    expect(renderTemplate('{{Text}}', fields)).toBe(
      'The {{c1::mitochondria}} is the {{c2::powerhouse}}.',
    );
  });
});

const clozeType: NoteTypeDef = {
  name: 'Cloze',
  isBuiltin: true,
  kind: 'cloze',
  styling: '',
  fields: [
    { name: 'Text', ord: 0 },
    { name: 'Extra', ord: 1 },
  ],
  templates: [
    { name: 'Cloze', ord: 0, frontTemplate: '{{Text}}', backTemplate: '{{Text}}{{#Extra}}<hr>{{Extra}}{{/Extra}}' },
  ],
};

const basicType: NoteTypeDef = {
  name: 'Basic',
  isBuiltin: true,
  kind: 'basic',
  styling: '',
  fields: [
    { name: 'Front', ord: 0 },
    { name: 'Back', ord: 1 },
  ],
  templates: [
    { name: 'Card 1', ord: 0, frontTemplate: '{{Front}}', backTemplate: '{{Front}}<hr>{{Back}}' },
  ],
};

describe('extractMath / stripMath — math markers', () => {
  test('extracts an inline span (display:false)', () => {
    expect(extractMath('a \\(x^2\\) b')).toEqual([{ source: 'x^2', display: false }]);
  });

  test('extracts a display span (display:true)', () => {
    expect(extractMath('\\[\\frac12\\]')).toEqual([{ source: '\\frac12', display: true }]);
  });

  test('extracts both kinds in document order', () => {
    expect(extractMath('\\(a\\) text \\[b\\] \\(c\\)')).toEqual([
      { source: 'a', display: false },
      { source: 'b', display: true },
      { source: 'c', display: false },
    ]);
  });

  test('no math → empty array', () => {
    expect(extractMath('plain text, no math here')).toEqual([]);
  });

  test('escaped opener \\\\( is NOT a math span', () => {
    expect(extractMath('cost is \\\\(5 dollars')).toEqual([]);
  });

  test('non-greedy: adjacent inline spans do not merge', () => {
    expect(extractMath('\\(a\\)\\(b\\)')).toEqual([
      { source: 'a', display: false },
      { source: 'b', display: false },
    ]);
  });

  test('stripMath replaces inline with its source', () => {
    expect(stripMath('area = \\(\\pi r^2\\) units')).toBe('area = \\pi r^2 units');
  });

  test('stripMath replaces display with its source', () => {
    expect(stripMath('\\[E=mc^2\\]')).toBe('E=mc^2');
  });

  test('stripMath leaves an escaped opener untouched', () => {
    expect(stripMath('\\\\(not math')).toBe('\\\\(not math');
  });

  test('stripMath leaves a string with no math untouched', () => {
    expect(stripMath('nothing to see')).toBe('nothing to see');
  });
});

describe('renderTextFor — plaintext extraction', () => {
  test('strips HTML tags from a basic note', () => {
    const r = renderTextFor(basicType, { Front: '<b>Bonjour</b>', Back: '<i>Hello</i>' });
    expect(r.renderFrontText).toBe('Bonjour');
    expect(r.renderBackText).toBe('Bonjour Hello');
    expect(r.renderText).toBe('Bonjour Bonjour Hello');
  });

  test('emits math formula SOURCE so search matches the formula', () => {
    const r = renderTextFor(basicType, { Front: 'Pythagoras \\(a^2+b^2\\)', Back: '\\[c^2\\]' });
    expect(r.renderFrontText).toBe('Pythagoras a^2+b^2');
    // back template is {{Front}}<hr>{{Back}} → both fields' math sources appear
    expect(r.renderBackText).toBe('Pythagoras a^2+b^2 c^2');
  });

  test('emits <img> alt text and drops the tag', () => {
    const r = renderTextFor(basicType, {
      Front: 'see <img src="/m/x" alt="a red apple">',
      Back: 'plain',
    });
    expect(r.renderFrontText).toBe('see a red apple');
  });

  test('drops an <img> with no alt (no leftover markup)', () => {
    const r = renderTextFor(basicType, {
      Front: 'before <img src="/m/x"> after',
      Back: 'b',
    });
    expect(r.renderFrontText).toBe('before after');
  });

  test('math + img + tags coexist in one field', () => {
    const r = renderTextFor(basicType, {
      Front: '<b>Energy</b> <img src="/m/y" alt="diagram"> \\(E=mc^2\\)',
      Back: 'b',
    });
    expect(r.renderFrontText).toBe('Energy diagram E=mc^2');
  });

  test('unwraps cloze to revealed answers on both sides for cloze types', () => {
    const r = renderTextFor(clozeType, {
      Text: 'The {{c1::sun}} is a star.',
      Extra: 'fact',
    });
    // Front side is the cloze PROMPT, but plaintext search reveals via stripCloze
    // (front uses 'prompt' mode → blanks; back uses 'answer' mode → revealed).
    expect(r.renderFrontText).toBe('The […] is a star.');
    expect(r.renderBackText).toBe('The sun is a star. fact');
    expect(r.renderText).toBe('The […] is a star. The sun is a star. fact');
  });
});

describe('generateCards', () => {
  const twoTemplate: NoteTypeDef = {
    name: 'Basic (and reversed)',
    isBuiltin: true,
    kind: 'basic',
    styling: '',
    fields: [
      { name: 'Front', ord: 0 },
      { name: 'Back', ord: 1 },
    ],
    templates: [
      { name: 'Forward', ord: 0, frontTemplate: '{{Front}}', backTemplate: '{{Back}}' },
      { name: 'Reverse', ord: 1, frontTemplate: '{{Back}}', backTemplate: '{{Front}}' },
    ],
  };

  test('a 2-template note generates 2 cards', () => {
    const cards = generateCards(twoTemplate, { Front: 'Q', Back: 'A' });
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.templateOrd)).toEqual([0, 1]);
    expect(cards[0].renderFrontText).toBe('Q');
    expect(cards[1].renderFrontText).toBe('A');
  });

  test('skips a template whose rendered front is empty (optional reverse)', () => {
    const cards = generateCards(twoTemplate, { Front: 'Q', Back: '' });
    expect(cards).toHaveLength(1);
    expect(cards[0].templateOrd).toBe(0);
    expect(cards[0].renderFrontText).toBe('Q');
  });

  test('orders cards by template ord regardless of array order', () => {
    const reordered: NoteTypeDef = {
      ...twoTemplate,
      templates: [
        { name: 'Reverse', ord: 1, frontTemplate: '{{Back}}', backTemplate: '{{Front}}' },
        { name: 'Forward', ord: 0, frontTemplate: '{{Front}}', backTemplate: '{{Back}}' },
      ],
    };
    const cards = generateCards(reordered, { Front: 'Q', Back: 'A' });
    expect(cards.map((c) => c.templateOrd)).toEqual([0, 1]);
  });

  test('propagates the note-type renderKind onto each card', () => {
    const cards = generateCards(clozeType, { Text: 'The {{c1::sky}} is blue.', Extra: '' });
    expect(cards).toHaveLength(1);
    expect(cards[0].renderKind).toBe('cloze');
    expect(cards[0].renderFrontText).toBe('The […] is blue.');
    expect(cards[0].renderBackText).toBe('The sky is blue.');
  });

  test('renderText is front+back plaintext concatenation', () => {
    const cards = generateCards(basicType, { Front: 'Front side', Back: 'Back side' });
    expect(cards[0].renderText).toBe('Front side Front side Back side');
  });
});

describe('determinism', () => {
  test('repeated renders are byte-identical (no Date.now/random)', () => {
    const a = generateCards(basicType, { Front: 'X', Back: 'Y' });
    const b = generateCards(basicType, { Front: 'X', Back: 'Y' });
    expect(a).toEqual(b);
    expect(renderTextFor(basicType, { Front: 'X', Back: 'Y' })).toEqual(
      renderTextFor(basicType, { Front: 'X', Back: 'Y' }),
    );
  });
});

describe('math regex — ReDoS hardening (M2 validation fix)', () => {
  // A 64 KiB field of UNTERMINATED math openers used to drive the lazy-body +
  // lookbehind grammar quadratic (~17 s stall on `POST /notes` via generateCards
  // → stripTags). The linear-time grammar + the 32 KiB search-text cap must keep
  // the whole strip pass well under 100 ms.
  const evilInline = '\\('.repeat(32768); // 64 KiB of `\(`
  const evilDisplay = '\\['.repeat(32768); // 64 KiB of `\[`

  test('generateCards on 64 KiB of unterminated openers completes in <100ms', () => {
    const start = performance.now();
    generateCards(basicType, { Front: evilInline, Back: '' });
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(100);
  });

  test('renderTextFor on 64 KiB of unterminated display openers completes in <100ms', () => {
    const start = performance.now();
    renderTextFor(basicType, { Front: evilDisplay, Back: evilInline });
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(100);
  });

  test('stripMath / extractMath on 64 KiB of unterminated openers stay linear (<100ms)', () => {
    const start = performance.now();
    stripMath(evilInline);
    extractMath(evilInline);
    stripMath(evilDisplay);
    extractMath(evilDisplay);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(100);
  });

  test('a LITERAL paren / backslash command inside a formula still extracts', () => {
    // The linear body must not regress real LaTeX: literal parens, backslash
    // commands, and \left(…\right) all belong to the formula source.
    expect(extractMath('\\((a+b)^2\\)')).toEqual([{ source: '(a+b)^2', display: false }]);
    expect(extractMath('\\(\\left(x\\right)\\)')).toEqual([
      { source: '\\left(x\\right)', display: false },
    ]);
    expect(extractMath('\\[[0,1]\\]')).toEqual([{ source: '[0,1]', display: true }]);
    expect(stripMath('\\(\\frac{1}{2}\\)')).toBe('\\frac{1}{2}');
  });
});
