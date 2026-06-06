import { describe, expect, test } from 'bun:test';
import { CLOZE_RE, likeToRegex, stripCloze, wildcardToSqlLike } from './card-query-match.ts';

describe('likeToRegex', () => {
  test('* matches zero-or-more chars', () => {
    const re = likeToRegex('ca*t');
    expect(re.test('cat')).toBe(true);
    expect(re.test('caaat')).toBe(true);
    expect(re.test('ct')).toBe(false); // anchored: needs the literal a before *? no — `ca*t`
  });

  test('* spans multiple chars at the end', () => {
    const re = likeToRegex('cat*');
    expect(re.test('cat')).toBe(true);
    expect(re.test('cats')).toBe(true);
    expect(re.test('ca')).toBe(false);
  });

  test('_ matches exactly one char', () => {
    const re = likeToRegex('c_t');
    expect(re.test('cat')).toBe(true);
    expect(re.test('cot')).toBe(true);
    expect(re.test('ct')).toBe(false);
    expect(re.test('caat')).toBe(false);
  });

  test('is anchored (full match)', () => {
    const re = likeToRegex('cat');
    expect(re.test('cat')).toBe(true);
    expect(re.test('catalog')).toBe(false);
    expect(re.test('a cat')).toBe(false);
  });

  test('is case-insensitive', () => {
    expect(likeToRegex('Cat').test('cAt')).toBe(true);
  });

  test('escapes regex metacharacters in the literal', () => {
    const re = likeToRegex('a.b(c)');
    expect(re.test('a.b(c)')).toBe(true);
    expect(re.test('axbXc')).toBe(false); // `.` is literal, not any-char
  });

  test('substring usage via implicit wildcards', () => {
    const re = likeToRegex('*cat*');
    expect(re.test('a catalog')).toBe(true);
    expect(re.test('dog')).toBe(false);
  });
});

describe('wildcardToSqlLike', () => {
  test('* → %', () => {
    expect(wildcardToSqlLike('cat*')).toBe('cat%');
  });

  test('_ stays _', () => {
    expect(wildcardToSqlLike('c_t')).toBe('c_t');
  });

  test('escapes literal % and \\', () => {
    expect(wildcardToSqlLike('100%')).toBe('100\\%');
    expect(wildcardToSqlLike('a\\b')).toBe('a\\\\b');
  });

  test('mixed wildcard + literal metachar', () => {
    // user wants prefix "50%" → SQL `50\%%`
    expect(wildcardToSqlLike('50%*')).toBe('50\\%%');
  });

  test('plain text is unchanged', () => {
    expect(wildcardToSqlLike('hello')).toBe('hello');
  });
});

describe('stripCloze', () => {
  test('prompt mode blanks out the answer', () => {
    expect(stripCloze('The capital is {{c1::Paris}}.', 'prompt')).toBe('The capital is […].');
  });

  test('answer mode fills in the answer', () => {
    expect(stripCloze('The capital is {{c1::Paris}}.', 'answer')).toBe('The capital is Paris.');
  });

  test('handles multiple clozes and multi-digit indices', () => {
    const text = '{{c1::a}} and {{c12::b}}';
    expect(stripCloze(text, 'prompt')).toBe('[…] and […]');
    expect(stripCloze(text, 'answer')).toBe('a and b');
  });

  test('text without clozes is unchanged', () => {
    expect(stripCloze('plain text', 'prompt')).toBe('plain text');
    expect(stripCloze('plain text', 'answer')).toBe('plain text');
  });

  test('CLOZE_RE is exported and reusable (fresh lastIndex per construction)', () => {
    const re = new RegExp(CLOZE_RE.source, 'g');
    const matches = [...'{{c1::x}}{{c2::y}}'.matchAll(re)].map((m) => m[1]);
    expect(matches).toEqual(['x', 'y']);
  });
});
