// L4 §8.4 — markup → Markdown export. A PURE string builder (no DOM, no fetch)
// that assembles the reader's already-loaded marks + ink annotations into a
// single Markdown document, grouped by page in page order:
//
//   # <title> — <author>
//
//   ## Страница N
//   > <highlight quote>
//   > <note quote> — **<note body>**
//   [чернила]: <ink marked_text>
//   …
//   N карточек создано из этого источника
//
// Highlights render as a blockquote; notes append the note body in bold; ink
// marked-text (the geometric extraction under the strokes) renders inline. The
// card-count footer is omitted when zero. Unit-tested directly (arrays in →
// string out) — the download (blob + a.download) is the impure caller's job.

import type { SourceMark } from '@/lib/types';

/** A trimmed ink-annotation row (page + the text under the strokes). */
export interface InkMarkupRow {
  page: number;
  markedText: string | null;
}

export interface MarkupExportInput {
  title: string;
  author?: string | null;
  marks: SourceMark[];
  /** Ink annotations carrying the geometric markedText (empty for scanned PDFs). */
  ink: InkMarkupRow[];
  /** Number of cards created from this source (footer line; omitted when 0). */
  cardCount?: number;
  /** Localized labels — keeps the helper i18n-agnostic (caller passes t()). */
  labels: {
    /** «Страница» — heading per page (formatted `${pageHeading} ${n}`). */
    pageHeading: string;
    /** «[чернила]» — ink marked-text prefix. */
    inkLabel: string;
    /** Footer: a function of count → e.g. «N карточек создано из этого источника». */
    cardsFooter: (n: number) => string;
  };
}

/** Collapse whitespace + trim — quotes/notes/ink text are single-line in MD. */
function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** A blockquote line, escaping any embedded newlines the source text may carry. */
function quoteLine(s: string): string {
  return `> ${clean(s)}`;
}

/**
 * Build the Markdown export string. Pages are emitted in ascending order; within
 * a page, highlights/notes come first (in their array order), then ink passages.
 * A page with neither a mark nor non-empty ink text is skipped entirely.
 */
export function buildMarkupMarkdown(input: MarkupExportInput): string {
  const { title, author, marks, ink, cardCount = 0, labels } = input;

  // Group everything by page.
  interface PageBucket {
    marks: SourceMark[];
    ink: string[];
  }
  const byPage = new Map<number, PageBucket>();
  const bucket = (page: number): PageBucket => {
    let b = byPage.get(page);
    if (!b) {
      b = { marks: [], ink: [] };
      byPage.set(page, b);
    }
    return b;
  };

  for (const m of marks) {
    // Skip card-kind marks (they're the provenance footer's job, not markup).
    if (m.kind === 'card') continue;
    if (!clean(m.quote)) continue;
    bucket(m.page).marks.push(m);
  }
  for (const row of ink) {
    const text = clean(row.markedText ?? '');
    if (!text) continue;
    bucket(row.page).ink.push(text);
  }

  const lines: string[] = [];
  const header = author && clean(author) ? `# ${clean(title)} — ${clean(author)}` : `# ${clean(title)}`;
  lines.push(header);

  const pages = [...byPage.keys()].sort((a, b) => a - b);
  for (const page of pages) {
    const b = byPage.get(page)!;
    lines.push('');
    lines.push(`## ${labels.pageHeading} ${page}`);
    for (const m of b.marks) {
      if (m.kind === 'note' && m.note && clean(m.note)) {
        lines.push(`${quoteLine(m.quote)} — **${clean(m.note)}**`);
      } else {
        lines.push(quoteLine(m.quote));
      }
    }
    for (const text of b.ink) {
      lines.push(`${labels.inkLabel}: ${text}`);
    }
  }

  if (cardCount > 0) {
    lines.push('');
    lines.push(labels.cardsFooter(cardCount));
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Trigger a client-side `.md` download. Impure (touches `document`/`URL`); kept
 * out of the unit-tested core. The filename is the (sanitized) source title.
 */
export function downloadMarkdown(filename: string, markdown: string): void {
  const safe = filename.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) || 'markup';
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click handler has consumed the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
