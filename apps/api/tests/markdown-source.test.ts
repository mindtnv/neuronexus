import { describe, expect, test } from 'bun:test';
import { sanitizeFieldValues } from '../src/sanitize';

describe('Markdown source persistence', () => {
  for (const source of [
    '```ts\nconst value: Array<T> = [];\n```',
    '`<button onclick="example()">OK</button>`',
    '```html\n<script>alert(1)</script>\n```',
    '5 < 8 && 9 > 2; &lt; is an entity example',
    '<svg onload="example()"><script>example()</script></svg>',
    'Русский\r\n  **café** 👨‍👩‍👧‍👦\n',
  ]) {
    test(`preserves source: ${source.slice(0, 45)}`, () => {
      expect(sanitizeFieldValues({ Front: source, Back: 'answer' })).toEqual({ Front: source, Back: 'answer' });
    });
  }

  test('preserves arbitrary field names without prototype mutation', () => {
    const fields = JSON.parse('{"__proto__":"source","constructor":"example","Front":"question"}');
    const result = sanitizeFieldValues(fields);
    expect(Object.keys(result)).toEqual(Object.keys(fields));
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(result.__proto__).toBe('source');
  });
});
