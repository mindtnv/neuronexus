'use client';

// Feature #1 — «провал → источник». A lightweight reviewer surface, fed by the
// SAME `useCardSources` hook the SourceLinksPanel uses, but tuned for the in-flow
// reveal/grade loop (NOT a backlink list):
//
//   • SourcePeekChip   — a quiet, non-intrusive chip shown AFTER reveal for any
//     grade («↗ из: «{title}», стр. {n}»). First cited source only.
//   • SourcePeekPanel  — shown on a lapse (Again): instantly renders the cited
//     snippet, then a «раскрыть полностью» button dotts the FULL chunk text via
//     store.getSourceChunks(sourceId,{from:position,limit:1}). Source content is
//     rendered as plain, whitespace-preserved TEXT — never raw HTML.
//
// Only renders when the card HAS provenance (`useCardSources(id).items.length>0`)
// — hand-authored cards stay clean. The single navigation (open in the library)
// is an explicit secondary action; it never fires implicitly (navigating away
// rebuilds the review queue and kills the session).

import React, { useCallback, useState } from 'react';
import type { CardSourceLink } from '@/lib/types';
import { NNBadge, NNBtn, NNIcon } from '@/components/ui';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { useCardSources } from '@/components/source-links';

type Tr = (key: string, params?: Record<string, string | number>) => string;

/** The first cited source for a card (the one the peek surfaces), or null. */
export function useFirstCardSource(cardId: string | null): CardSourceLink | null {
  const { items } = useCardSources(cardId);
  // Prefer a non-tombstone source (sourceId present) so the chip/panel can act.
  return items.find((it) => it.sourceId) ?? items[0] ?? null;
}

/** Build the library deep-link query (?chunk=&pos=&page=) — same shape as
 *  SourceLinksPanel.open(). Returns '' when the source is a tombstone. */
function libraryHref(item: CardSourceLink): string | null {
  if (!item.sourceId) return null;
  const params = new URLSearchParams();
  if (item.sourceChunkId) params.set('chunk', item.sourceChunkId);
  if (item.position != null) params.set('pos', String(item.position));
  if (item.page != null) params.set('page', String(item.page));
  const qs = params.toString();
  return `/library/${item.sourceId}${qs ? `?${qs}` : ''}`;
}

function originLabel(item: CardSourceLink, t: Tr): string {
  const title = item.sourceTitle?.trim();
  if (!title) return t('review.peek.fromUntitled');
  return item.page != null
    ? t('review.peek.fromPage', { title, n: item.page })
    : t('review.peek.from', { title });
}

/**
 * The quiet provenance chip shown after reveal (any grade). Click is an explicit
 * jump into the library reader; for a tombstone source it's inert. Renders null
 * with no provenance.
 */
export const SourcePeekChip = ({
  item,
  onOpen,
}: {
  item: CardSourceLink | null;
  onOpen: (href: string) => void;
}) => {
  const t = useT();
  if (!item) return null;
  const href = libraryHref(item);
  return (
    <button
      type="button"
      disabled={!href}
      onClick={() => href && onOpen(href)}
      title={href ? t('review.peek.openInLibrary') : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        maxWidth: '100%',
        padding: '4px 9px',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-pill)',
        cursor: href ? 'pointer' : 'default',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-sans)',
        fontSize: 11.5,
        lineHeight: 1.2,
      }}
    >
      <NNIcon name="doc" size={12} color="var(--sky-400)" />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {originLabel(item, t)}
      </span>
    </button>
  );
};

/**
 * The lapse passage panel. Shows the cited snippet immediately; «раскрыть
 * полностью» dotts the full chunk text. `compact` trims padding for the inline
 * (non-overlay) placement. The optional `onOpenLibrary`/`onDismiss` render the
 * secondary actions row.
 */
export const SourcePeekPanel = ({
  item,
  onOpenLibrary,
  onDismiss,
}: {
  item: CardSourceLink;
  onOpenLibrary?: (href: string) => void;
  onDismiss?: () => void;
}) => {
  const t = useT();
  const getSourceChunks = useNN((s) => s.getSourceChunks);
  const [fullText, setFullText] = useState<string | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const href = libraryHref(item);

  const expand = useCallback(async () => {
    if (fullText != null || loadingFull) return;
    if (!item.sourceId || item.position == null) return;
    setLoadingFull(true);
    try {
      const page = await getSourceChunks(item.sourceId, item.position, 1);
      const text = page.items[0]?.text ?? null;
      setFullText(text ?? item.snippet ?? '');
    } catch {
      // Degrade to the snippet (already shown) — no error toast for a peek.
      setFullText(item.snippet ?? '');
    } finally {
      setLoadingFull(false);
    }
  }, [fullText, loadingFull, item.sourceId, item.position, item.snippet, getSourceChunks]);

  // The body text: full chunk once dotted, else the snippet. Plain TEXT only
  // (whitespace preserved) — this is source content, rendered safely without HTML.
  const body = fullText ?? item.snippet ?? '';
  const canExpand = fullText == null && item.sourceId != null && item.position != null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <NNIcon name="doc" size={13} color="var(--sky-400)" />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
            flex: 1,
          }}
        >
          {item.sourceTitle?.trim() || t('review.peek.fromUntitled')}
        </span>
        {item.page != null && (
          <NNBadge tone="sky" size="xs">
            {t('notebooks.backlinks.page', { n: item.page })}
          </NNBadge>
        )}
      </div>

      {body && (
        <div
          className="nn-scroll"
          style={{
            fontSize: 13,
            lineHeight: 1.55,
            color: 'var(--text-muted)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 220,
            overflowY: 'auto',
            padding: '8px 10px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
          }}
        >
          {body}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {canExpand && (
          <NNBtn size="sm" variant="ghost" icon="chevd" onClick={() => void expand()} disabled={loadingFull}>
            {loadingFull ? t('review.peek.loading') : t('review.peek.expand')}
          </NNBtn>
        )}
        {href && onOpenLibrary && (
          <NNBtn size="sm" variant="ghost" icon="link" onClick={() => onOpenLibrary(href)}>
            {t('review.peek.openInLibrary')}
          </NNBtn>
        )}
        <div style={{ flex: 1 }} />
        {onDismiss && (
          <NNBtn size="sm" variant="soft" onClick={onDismiss}>
            {t('review.peek.dismiss')}
          </NNBtn>
        )}
      </div>
    </div>
  );
};
