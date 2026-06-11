// Source parsers (NotebookLM M1, T4 / AC1.4). Drives `parseSource` through the
// injected seams (`__setPdfExtractorForTests`, `__setEpubReaderForTests`, and
// page-reader's `__setPageReaderForTests` for URL) so NO real PDF/EPUB binaries
// or network are needed.
//
//   * pdf  → one SourceUnit per page, 1-based `page`.
//   * epub → one SourceUnit per chapter, with `heading`.
//   * url  → single unit via the injected page reader (text + heading=title).
//   * text → passthrough (collapsed), single unit.
//   * empty parse result → SourceParseError('empty_source').
//   * a thrown extractor → typed SourceParseError (parse_failed / fetch_failed).

import { afterEach, describe, expect, test } from 'bun:test';
import {
  __setEpubReaderForTests,
  __setPdfExtractorForTests,
  parseSource,
  SourceParseError,
} from '../src/ai/source-parsers.ts';
import {
  __resetPageReaderForTests,
  __setPageReaderForTests,
  type PageContent,
} from '../src/ai/page-reader.ts';

const SOME_BYTES = new Uint8Array([1, 2, 3, 4]);

afterEach(() => {
  __setPdfExtractorForTests(null);
  __setEpubReaderForTests(null);
  __resetPageReaderForTests();
});

describe('parseSource — PDF (per-page units)', () => {
  test('one SourceUnit per page with 1-based page numbers', async () => {
    __setPdfExtractorForTests(async () => ['Page one text.', 'Page two text.', 'Page three.']);
    const { units } = await parseSource({ kind: 'pdf', bytes: SOME_BYTES });
    expect(units.length).toBe(3);
    expect(units.map((u) => u.page)).toEqual([1, 2, 3]);
    expect(units[0]!.text).toContain('Page one text.');
    expect(units[2]!.text).toContain('Page three.');
    // PDF pages carry no heading.
    expect(units[0]!.heading).toBeUndefined();
  });

  test('blank pages are dropped but numbering of REAL pages is preserved (filtered after map)', async () => {
    // page 2 is blank → dropped; the kept pages retain their original 1-based nums.
    __setPdfExtractorForTests(async () => ['Real one.', '   ', 'Real three.']);
    const { units } = await parseSource({ kind: 'pdf', bytes: SOME_BYTES });
    expect(units.length).toBe(2);
    expect(units.map((u) => u.page)).toEqual([1, 3]);
  });

  test('an all-blank PDF → empty_source', async () => {
    __setPdfExtractorForTests(async () => ['', '   ', '\n\n']);
    await expect(parseSource({ kind: 'pdf', bytes: SOME_BYTES })).rejects.toMatchObject({
      code: 'empty_source',
    });
  });

  test('a thrown extractor → SourceParseError(parse_failed)', async () => {
    __setPdfExtractorForTests(async () => {
      throw new Error('corrupt pdf');
    });
    const err = await parseSource({ kind: 'pdf', bytes: SOME_BYTES }).catch((e) => e);
    expect(err).toBeInstanceOf(SourceParseError);
    expect((err as SourceParseError).code).toBe('parse_failed');
  });

  test('missing bytes → empty_source (requireBytes)', async () => {
    await expect(parseSource({ kind: 'pdf' })).rejects.toMatchObject({ code: 'empty_source' });
  });
});

describe('parseSource — EPUB (chapter units with heading)', () => {
  test('one SourceUnit per chapter with heading preserved', async () => {
    __setEpubReaderForTests(async () => [
      { text: 'Intro chapter body.', heading: 'Introduction' },
      { text: 'First chapter body.', heading: 'Chapter 1' },
    ]);
    const { units } = await parseSource({ kind: 'epub', bytes: SOME_BYTES });
    expect(units.length).toBe(2);
    expect(units.map((u) => u.heading)).toEqual(['Introduction', 'Chapter 1']);
    expect(units[0]!.text).toContain('Intro chapter body.');
    // EPUB units carry no page number.
    expect(units[0]!.page).toBeUndefined();
  });

  test('chapters with empty text are dropped', async () => {
    __setEpubReaderForTests(async () => [
      { text: '   ', heading: 'Empty' },
      { text: 'Has content.', heading: 'Kept' },
    ]);
    const { units } = await parseSource({ kind: 'epub', bytes: SOME_BYTES });
    expect(units.length).toBe(1);
    expect(units[0]!.heading).toBe('Kept');
  });

  test('a thrown reader → SourceParseError(parse_failed)', async () => {
    __setEpubReaderForTests(async () => {
      throw new Error('bad zip');
    });
    const err = await parseSource({ kind: 'epub', bytes: SOME_BYTES }).catch((e) => e);
    expect(err).toBeInstanceOf(SourceParseError);
    expect((err as SourceParseError).code).toBe('parse_failed');
  });
});

describe('parseSource — URL (via page-reader seam)', () => {
  test('single unit: page text + heading=title', async () => {
    __setPageReaderForTests({
      async read(url: string): Promise<PageContent> {
        return { url, title: 'Article Title', text: 'The article body text.', links: [] };
      },
    });
    const { units } = await parseSource({ kind: 'url', url: 'https://example.com/article' });
    expect(units.length).toBe(1);
    expect(units[0]!.text).toContain('The article body text.');
    expect(units[0]!.heading).toBe('Article Title');
  });

  test('a reader failure → SourceParseError(fetch_failed)', async () => {
    __setPageReaderForTests({
      async read(): Promise<PageContent> {
        throw new Error('network down');
      },
    });
    const err = await parseSource({ kind: 'url', url: 'https://example.com/x' }).catch((e) => e);
    expect(err).toBeInstanceOf(SourceParseError);
    expect((err as SourceParseError).code).toBe('fetch_failed');
  });

  test('empty url → fetch_failed', async () => {
    const err = await parseSource({ kind: 'url', url: '' }).catch((e) => e);
    expect(err).toBeInstanceOf(SourceParseError);
    expect((err as SourceParseError).code).toBe('fetch_failed');
  });
});

describe('parseSource — text passthrough', () => {
  test('single unit, whitespace collapsed', async () => {
    const { units } = await parseSource({
      kind: 'text',
      text: 'Some    inline\n\n\ntext   here.',
    });
    expect(units.length).toBe(1);
    // collapseText normalizes runs of whitespace.
    expect(units[0]!.text).toContain('Some');
    expect(units[0]!.text).toContain('text');
    expect(units[0]!.text).not.toMatch(/ {2,}/);
    expect(units[0]!.page).toBeUndefined();
    expect(units[0]!.heading).toBeUndefined();
  });

  test('empty / whitespace-only text → empty_source', async () => {
    await expect(parseSource({ kind: 'text', text: '   \n\n ' })).rejects.toMatchObject({
      code: 'empty_source',
    });
  });
});

describe('parseSource — unknown kind', () => {
  test('an unsupported kind → unsupported_mime', async () => {
    const err = await parseSource({ kind: 'docx' as never, bytes: SOME_BYTES }).catch((e) => e);
    expect(err).toBeInstanceOf(SourceParseError);
    expect((err as SourceParseError).code).toBe('unsupported_mime');
  });
});
