import { describe, expect, test } from 'bun:test';
import {
  CardQueryError,
  MAX_QUERY_LENGTH,
  MAX_TERM_COUNT,
  parseCardQuery,
  type AndNode,
  type CardQueryNode,
  type GroupNode,
  type NotNode,
  type OrNode,
  type TermNode,
} from './card-query.ts';

// Narrowing helpers keep the assertions readable.
function asTerm(n: CardQueryNode): TermNode {
  expect(n.kind).toBe('term');
  return n as TermNode;
}
function asAnd(n: CardQueryNode): AndNode {
  expect(n.kind).toBe('and');
  return n as AndNode;
}
function asOr(n: CardQueryNode): OrNode {
  expect(n.kind).toBe('or');
  return n as OrNode;
}
function asNot(n: CardQueryNode): NotNode {
  expect(n.kind).toBe('not');
  return n as NotNode;
}
function asGroup(n: CardQueryNode): GroupNode {
  expect(n.kind).toBe('group');
  return n as GroupNode;
}

describe('tokenizer (via parser)', () => {
  test('bareword → text term', () => {
    const t = asTerm(parseCardQuery('hello'));
    expect(t.field).toBe('text');
    expect(t.value).toBe('hello');
    expect(t.quoted).toBe(false);
  });

  test('quoted phrase keeps spaces and is a single text term', () => {
    const t = asTerm(parseCardQuery('"two words"'));
    expect(t.field).toBe('text');
    expect(t.value).toBe('two words');
    expect(t.quoted).toBe(true);
  });

  test('key:"two words" keeps the operand together', () => {
    const t = asTerm(parseCardQuery('deck:"My Deck"'));
    expect(t.field).toBe('deck');
    expect(t.value).toBe('My Deck');
  });

  test('escaped quote inside a quoted string', () => {
    const t = asTerm(parseCardQuery('"say \\"hi\\""'));
    expect(t.value).toBe('say "hi"');
  });

  test('escaped backslash inside a quoted string', () => {
    const t = asTerm(parseCardQuery('"a\\\\b"'));
    expect(t.value).toBe('a\\b');
  });

  test('unbalanced quote degrades to a bareword (consumes to EOI)', () => {
    const t = asTerm(parseCardQuery('"unterminated here'));
    expect(t.kind).toBe('term');
    expect(t.field).toBe('text');
    expect(t.value).toBe('unterminated here');
  });

  test('key:value splits on the first colon', () => {
    const t = asTerm(parseCardQuery('front:cat'));
    expect(t.field).toBe('front');
    expect(t.value).toBe('cat');
  });

  test('unknown key degrades to a text term over the whole literal', () => {
    const t = asTerm(parseCardQuery('foo:bar'));
    expect(t.field).toBe('text');
    expect(t.value).toBe('foo:bar');
  });
});

describe('parser AST structure', () => {
  test('implicit AND on whitespace', () => {
    const and = asAnd(parseCardQuery('cat dog'));
    expect(and.children).toHaveLength(2);
    expect(asTerm(and.children[0]!).value).toBe('cat');
    expect(asTerm(and.children[1]!).value).toBe('dog');
  });

  test('OR has lower precedence than implicit AND', () => {
    // a b OR c  ==  (a AND b) OR c
    const or = asOr(parseCardQuery('a b OR c'));
    expect(or.children).toHaveLength(2);
    const left = asAnd(or.children[0]!);
    expect(asTerm(left.children[0]!).value).toBe('a');
    expect(asTerm(left.children[1]!).value).toBe('b');
    expect(asTerm(or.children[1]!).value).toBe('c');
  });

  test('multiple OR branches flatten into one or node', () => {
    const or = asOr(parseCardQuery('a OR b OR c'));
    expect(or.children).toHaveLength(3);
  });

  test('- prefix negation wraps the next term', () => {
    const not = asNot(parseCardQuery('-cat'));
    expect(asTerm(not.child).value).toBe('cat');
  });

  test('negation combines with implicit AND', () => {
    const and = asAnd(parseCardQuery('cat -dog'));
    expect(asTerm(and.children[0]!).value).toBe('cat');
    const not = asNot(and.children[1]!);
    expect(asTerm(not.child).value).toBe('dog');
  });

  test('nested groups', () => {
    // a (b OR c)
    const and = asAnd(parseCardQuery('a (b OR c)'));
    expect(asTerm(and.children[0]!).value).toBe('a');
    const group = asGroup(and.children[1]!);
    const or = asOr(group.child);
    expect(asTerm(or.children[0]!).value).toBe('b');
    expect(asTerm(or.children[1]!).value).toBe('c');
  });

  test('negated group', () => {
    const not = asNot(parseCardQuery('-(a b)'));
    const group = asGroup(not.child);
    asAnd(group.child);
  });

  test('empty string → empty node (matches everything)', () => {
    expect(parseCardQuery('').kind).toBe('empty');
  });

  test('whitespace-only → empty node', () => {
    expect(parseCardQuery('   \t  ').kind).toBe('empty');
  });

  test('trailing dash is a bareword, not negation', () => {
    const t = asTerm(parseCardQuery('a-'));
    expect(t.value).toBe('a-');
  });

  test('unbalanced paren degrades (no throw)', () => {
    const node = parseCardQuery('(a b');
    expect(node.kind).toBe('group');
  });

  test('stray close paren is ignored', () => {
    const t = asTerm(parseCardQuery('a)'));
    expect(t.value).toBe('a');
  });
});

describe('keyed terms', () => {
  test('deck with quotes (plain deck always resolves the subtree)', () => {
    const t = asTerm(parseCardQuery('deck:"Spanish::Verbs"'));
    expect(t.field).toBe('deck');
    expect(t.value).toBe('Spanish::Verbs');
    expect(t.nested).toBe(true);
  });

  test('deck ::* nesting marker is stripped and flagged', () => {
    const t = asTerm(parseCardQuery('deck:Spanish::*'));
    expect(t.field).toBe('deck');
    expect(t.value).toBe('Spanish');
    expect(t.nested).toBe(true);
  });

  test('tag:none', () => {
    const t = asTerm(parseCardQuery('tag:none'));
    expect(t.field).toBe('tag');
    expect(t.value).toBe('none');
  });

  test('is: lowercases its value', () => {
    const t = asTerm(parseCardQuery('is:DUE'));
    expect(t.field).toBe('is');
    expect(t.value).toBe('due');
  });

  test('variant: lowercases its value', () => {
    const t = asTerm(parseCardQuery('variant:CLOZE'));
    expect(t.field).toBe('variant');
    expect(t.value).toBe('cloze');
  });

  test('added:N keeps the raw number string', () => {
    const t = asTerm(parseCardQuery('added:7'));
    expect(t.field).toBe('added');
    expect(t.value).toBe('7');
  });

  test('empty field: → empty value', () => {
    const t = asTerm(parseCardQuery('front:'));
    expect(t.field).toBe('front');
    expect(t.value).toBe('');
  });
});

describe('prop: comparator parsing', () => {
  const cases: Array<[string, string, string, string]> = [
    // input, prop, op, operand
    ['prop:ivl>=10', 'ivl', '>=', '10'],
    ['prop:reps<5', 'reps', '<', '5'],
    ['prop:lapses>2', 'lapses', '>', '2'],
    ['prop:s<=1.5', 's', '<=', '1.5'],
    ['prop:d!=3', 'd', '!=', '3'],
    ['prop:due=0', 'due', '=', '0'],
    ['prop:reps5', 'reps', '=', '5'], // no comparator → default =
  ];
  for (const [input, prop, op, operand] of cases) {
    test(input, () => {
      const t = asTerm(parseCardQuery(input));
      expect(t.field).toBe('prop');
      expect(t.prop).toBe(prop as TermNode['prop']);
      expect(t.op).toBe(op as TermNode['op']);
      expect(t.value).toBe(operand);
    });
  }
});

describe('safety caps → CardQueryError', () => {
  test('query over max length throws too_long', () => {
    const q = 'a'.repeat(MAX_QUERY_LENGTH + 1);
    expect(() => parseCardQuery(q)).toThrow(CardQueryError);
    try {
      parseCardQuery(q);
    } catch (e) {
      expect((e as CardQueryError).code).toBe('too_long');
    }
  });

  test('query at max length does not throw', () => {
    const q = 'a'.repeat(MAX_QUERY_LENGTH);
    expect(() => parseCardQuery(q)).not.toThrow();
  });

  test('too many terms throws too_many_terms', () => {
    const q = Array.from({ length: MAX_TERM_COUNT + 1 }, (_v, i) => `w${i}`).join(' ');
    expect(() => parseCardQuery(q)).toThrow(CardQueryError);
    try {
      parseCardQuery(q);
    } catch (e) {
      expect((e as CardQueryError).code).toBe('too_many_terms');
    }
  });

  test('exactly max terms does not throw', () => {
    const q = Array.from({ length: MAX_TERM_COUNT }, (_v, i) => `w${i}`).join(' ');
    expect(() => parseCardQuery(q)).not.toThrow();
  });
});
