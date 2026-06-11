'use client';

// "Sources" backlink panel — the source passages a card was generated from
// (NotebookLM M3), fed by GET /cards/:id/sources. Mounted in the cards-browser
// edit dock and the reviewer drawer, next to SimilarCardsPanel. Renders NOTHING
// when the card has no provenance (don't clutter hand-authored cards). Plain-text
// snippets only — never raw HTML. Mirrors similar-cards.tsx (module-level cache).

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CardSourceLink } from '@/lib/types';
import { NNBadge, NNIcon } from '@/components/ui';
import { api, ok } from '@/lib/api';
import { useT } from '@/lib/i18n';

interface SourceLinksState {
  items: CardSourceLink[];
  loading: boolean;
}

// Module-level cache: provenance only changes on a new chat-generated card, so a
// session-lived cache per cardId is safe and makes reopening the dock instant.
const cache = new Map<string, CardSourceLink[]>();

export function useCardSources(cardId: string | null): SourceLinksState {
  const [state, setState] = useState<SourceLinksState>({ items: [], loading: false });

  useEffect(() => {
    if (!cardId) {
      setState({ items: [], loading: false });
      return;
    }
    const cached = cache.get(cardId);
    if (cached) {
      setState({ items: cached, loading: false });
      return;
    }
    let cancelled = false;
    setState({ items: [], loading: true });
    (async () => {
      try {
        const body = (await ok(
          await (api as any).cards({ id: cardId }).sources.get(),
        )) as { items: CardSourceLink[] };
        const items = body.items ?? [];
        cache.set(cardId, items);
        if (!cancelled) setState({ items, loading: false });
      } catch {
        if (!cancelled) setState({ items: [], loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  return state;
}

/**
 * Provenance list for a card: each row is a cited source passage (title + page +
 * 2-line snippet). Clicking a non-tombstone row jumps to the notebook workspace
 * reader scrolled to that chunk. Tombstone rows (source deleted ⇒ NULL refs)
 * render muted + inert. Renders null when the card has no provenance.
 */
export const SourceLinksPanel = ({ cardId }: { cardId: string }) => {
  const t = useT();
  const router = useRouter();
  const { items, loading } = useCardSources(cardId);

  if (loading || items.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          marginBottom: 2,
        }}
      >
        {t('notebooks.backlinks.title')}
      </div>
      {items.map((item) => {
        const tombstone = !item.notebookId || !item.sourceId;
        const open = () => {
          if (tombstone || !item.notebookId || !item.sourceId) return;
          const params = new URLSearchParams({ source: item.sourceId });
          if (item.sourceChunkId) params.set('chunk', item.sourceChunkId);
          if (item.position != null) params.set('pos', String(item.position));
          // M4 — a known page opens a PDF source in the native reader at that page.
          if (item.page != null) params.set('page', String(item.page));
          router.push(`/notebooks/${item.notebookId}?${params.toString()}`);
        };
        return (
          <button
            key={item.id}
            type="button"
            disabled={tombstone}
            onClick={open}
            title={tombstone ? undefined : t('notebooks.backlinks.open')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: '8px 10px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              cursor: tombstone ? 'default' : 'pointer',
              textAlign: 'left',
              width: '100%',
              opacity: tombstone ? 0.6 : 1,
            }}
          >
            {tombstone ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <NNIcon name="doc" size={12} color="var(--text-dim)" />
                <span style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                  {t('notebooks.backlinks.tombstone')}
                </span>
              </span>
            ) : (
              <>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <NNIcon name="doc" size={12} color="var(--sky-400)" />
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    {item.sourceTitle ?? t('notebooks.backlinks.untitled')}
                  </span>
                  {item.page != null && (
                    <NNBadge tone="sky" size="xs">
                      {t('notebooks.backlinks.page', { n: item.page })}
                    </NNBadge>
                  )}
                </span>
                {item.snippet && (
                  <span
                    style={{
                      fontSize: 12,
                      lineHeight: 1.45,
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      wordBreak: 'break-word',
                    }}
                  >
                    {item.snippet}
                  </span>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
};
