// L4 §8.4 — unit tests for the PURE markup→Markdown builder (no DOM / no fetch).
// Arrays in → string out: page grouping/order, highlight/note/ink rendering,
// card-count footer, header with/without author, whitespace collapsing, and the
// card-kind-mark skip.

import { describe, expect, test } from 'bun:test';
import { buildMarkupMarkdown, type MarkupExportInput } from './markup-export';
import type { SourceMark } from '@/lib/types';

const labels: MarkupExportInput['labels'] = {
  pageHeading: 'Страница',
  inkLabel: '[чернила]',
  cardsFooter: (n) => `${n} карточек создано из этого источника`,
};

function mark(partial: Partial<SourceMark> & { page: number; quote: string }): SourceMark {
  return {
    id: partial.id ?? crypto.randomUUID(),
    sourceId: 's',
    page: partial.page,
    kind: partial.kind ?? 'highlight',
    quote: partial.quote,
    rects: partial.rects ?? [],
    color: partial.color ?? 'lime',
    note: partial.note ?? null,
    cardId: partial.cardId ?? null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('buildMarkupMarkdown', () => {
  test('header includes author when present', () => {
    const md = buildMarkupMarkdown({
      title: 'Book',
      author: 'Author',
      marks: [mark({ page: 1, quote: 'q' })],
      ink: [],
      labels,
    });
    expect(md.startsWith('# Book — Author\n')).toBe(true);
  });

  test('header omits the em-dash when no author', () => {
    const md = buildMarkupMarkdown({
      title: 'Book',
      author: null,
      marks: [mark({ page: 1, quote: 'q' })],
      ink: [],
      labels,
    });
    expect(md.startsWith('# Book\n')).toBe(true);
    expect(md.includes('# Book —')).toBe(false);
  });

  test('highlight renders as a blockquote under its page heading', () => {
    const md = buildMarkupMarkdown({
      title: 'B',
      marks: [mark({ page: 3, quote: 'a quote' })],
      ink: [],
      labels,
    });
    expect(md).toContain('## Страница 3');
    expect(md).toContain('> a quote');
  });

  test('note appends the body in bold', () => {
    const md = buildMarkupMarkdown({
      title: 'B',
      marks: [mark({ page: 1, quote: 'the text', kind: 'note', note: 'my thought' })],
      ink: [],
      labels,
    });
    expect(md).toContain('> the text — **my thought**');
  });

  test('note with empty body renders as a plain quote', () => {
    const md = buildMarkupMarkdown({
      title: 'B',
      marks: [mark({ page: 1, quote: 'the text', kind: 'note', note: '   ' })],
      ink: [],
      labels,
    });
    expect(md).toContain('> the text');
    expect(md).not.toContain('** ');
  });

  test('ink marked-text renders with its label', () => {
    const md = buildMarkupMarkdown({
      title: 'B',
      marks: [],
      ink: [{ page: 2, markedText: 'underlined words' }],
      labels,
    });
    expect(md).toContain('## Страница 2');
    expect(md).toContain('[чернила]: underlined words');
  });

  test('pages are emitted in ascending order', () => {
    const md = buildMarkupMarkdown({
      title: 'B',
      marks: [
        mark({ page: 5, quote: 'five' }),
        mark({ page: 2, quote: 'two' }),
        mark({ page: 9, quote: 'nine' }),
      ],
      ink: [],
      labels,
    });
    const i2 = md.indexOf('Страница 2');
    const i5 = md.indexOf('Страница 5');
    const i9 = md.indexOf('Страница 9');
    expect(i2).toBeLessThan(i5);
    expect(i5).toBeLessThan(i9);
  });

  test('highlights + ink on the same page share one heading, marks before ink', () => {
    const md = buildMarkupMarkdown({
      title: 'B',
      marks: [mark({ page: 4, quote: 'hl' })],
      ink: [{ page: 4, markedText: 'ink text' }],
      labels,
    });
    expect(md.match(/## Страница 4/g)?.length).toBe(1);
    expect(md.indexOf('> hl')).toBeLessThan(md.indexOf('[чернила]: ink text'));
  });

  test('card footer appears only when cardCount > 0', () => {
    const withCards = buildMarkupMarkdown({
      title: 'B',
      marks: [mark({ page: 1, quote: 'q' })],
      ink: [],
      cardCount: 3,
      labels,
    });
    expect(withCards).toContain('3 карточек создано из этого источника');

    const noCards = buildMarkupMarkdown({
      title: 'B',
      marks: [mark({ page: 1, quote: 'q' })],
      ink: [],
      cardCount: 0,
      labels,
    });
    expect(noCards).not.toContain('создано из этого источника');
  });

  test('card-kind marks are skipped (provenance, not markup)', () => {
    const md = buildMarkupMarkdown({
      title: 'B',
      marks: [mark({ page: 1, quote: 'card front', kind: 'card', cardId: 'c1' })],
      ink: [],
      labels,
    });
    expect(md).not.toContain('card front');
    // No page section at all → only the header line.
    expect(md.trim()).toBe('# B');
  });

  test('empty ink markedText is skipped', () => {
    const md = buildMarkupMarkdown({
      title: 'B',
      marks: [],
      ink: [{ page: 1, markedText: null }, { page: 1, markedText: '   ' }],
      labels,
    });
    expect(md).not.toContain('Страница 1');
    expect(md.trim()).toBe('# B');
  });

  test('whitespace in quotes is collapsed to one line', () => {
    const md = buildMarkupMarkdown({
      title: 'B',
      marks: [mark({ page: 1, quote: 'line one\n\n  line two\t' })],
      ink: [],
      labels,
    });
    expect(md).toContain('> line one line two');
  });

  test('output ends with a trailing newline', () => {
    const md = buildMarkupMarkdown({ title: 'B', marks: [], ink: [], labels });
    expect(md.endsWith('\n')).toBe(true);
  });
});
