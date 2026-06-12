'use client';

// CoverageBars («Блокноты 2.0» N3, Р9) — the «Покрытие карточками» block in the
// Overview tab. SQL-only (GET …/coverage) — works WITHOUT a chat key; only the
// gap prefill buttons are gated by chatEnabled.
//
//  • Aggregate header: a notebook-wide progress bar (pct) + «N/M фрагментов · K
//    карточек».
//  • Per-source rows: title + bar + «N/M фрагментов · K карточек».
//  • Gaps («Непокрытые темы»): heading (or «без заголовка») + uncovered count +
//    an arrow that prefills the chat composer («Сделай карточки по разделу …»).
//  • Empty: no cards anywhere → a hint to ask the agent for cards.

import { NNBtn, NNIcon } from '@/components/ui';
import { buildGapPrompt } from '@/lib/notebook-coverage';
import type { NotebookCoverage, NotebookCoverageGap } from '@/lib/types';

type Tfn = (key: string, params?: Record<string, string | number>) => string;

export interface CoverageBarsProps {
  coverage: NotebookCoverage;
  /** Gate the gap prefill buttons (they drive the chat). The bars render either way. */
  chatEnabled: boolean;
  /** A gap's arrow was clicked — prefill the chat composer with its prompt. */
  onAskGap: (prompt: string) => void;
  t: Tfn;
}

export const CoverageBars = ({ coverage, chatEnabled, onAskGap, t }: CoverageBarsProps) => {
  const { items, aggregate, gaps } = coverage;
  const hasAnyCards = aggregate.cardCount > 0;

  if (items.length === 0) {
    return (
      <p style={{ fontSize: 11.5, color: 'var(--text-dim)', margin: 0 }}>
        {t('notebooks.coverage.noSources')}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Aggregate */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
            {safePct(aggregate.pct)}%
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
            {t('notebooks.coverage.aggregate', {
              covered: aggregate.coveredChunks,
              total: aggregate.totalChunks,
              cards: aggregate.cardCount,
            })}
          </span>
        </div>
        <CoverageBar pct={aggregate.pct} large />
      </div>

      {!hasAnyCards ? (
        <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0, lineHeight: 1.5 }}>
          {t('notebooks.coverage.emptyHint')}
        </p>
      ) : (
        <>
          {/* Per-source rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((s) => (
              <div key={s.sourceId} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 12.5,
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={s.title}
                  >
                    {s.title}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
                    {safePct(s.pct)}%
                  </span>
                </div>
                <CoverageBar pct={s.pct} />
                <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>
                  {t('notebooks.coverage.sourceMeta', {
                    covered: s.coveredChunks,
                    total: s.totalChunks,
                    cards: s.cardCount,
                  })}
                </span>
              </div>
            ))}
          </div>

          {/* Gaps */}
          {gaps.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span
                className="nn-chrome"
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-dim)',
                }}
              >
                {t('notebooks.coverage.gapsHeading')}
              </span>
              {gaps.map((g, i) => (
                <GapRow
                  key={`${g.sourceId}:${g.heading ?? ''}:${i}`}
                  gap={g}
                  chatEnabled={chatEnabled}
                  onAsk={() =>
                    onAskGap(
                      buildGapPrompt(g, {
                        template: t('notebooks.coverage.gapPrompt'),
                        noHeadingLabel: t('notebooks.coverage.noHeading'),
                      }),
                    )
                  }
                  t={t}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

/** Clamp a percentage into 0..100, mapping a non-finite value (NaN/∞) to 0. */
const safePct = (pct: number): number =>
  Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;

const CoverageBar = ({ pct, large = false }: { pct: number; large?: boolean }) => (
  <div className="nn-coverage-bar" style={{ height: large ? 8 : 5 }}>
    <div
      className="nn-coverage-bar-fill"
      style={{ width: `${Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0}%` }}
    />
  </div>
);

const GapRow = ({
  gap,
  chatEnabled,
  onAsk,
  t,
}: {
  gap: NotebookCoverageGap;
  chatEnabled: boolean;
  onAsk: () => void;
  t: Tfn;
}) => (
  <div className="nn-coverage-gap">
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={gap.heading ?? t('notebooks.coverage.noHeading')}
      >
        {gap.heading ?? t('notebooks.coverage.noHeading')}
      </span>
      <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>
        {t('notebooks.coverage.gapMeta', { count: gap.uncovered, source: gap.sourceTitle })}
      </span>
    </div>
    {chatEnabled && (
      <NNBtn
        variant="ghost"
        size="sm"
        icon="chevr"
        ariaLabel={t('notebooks.coverage.gapAction')}
        title={t('notebooks.coverage.gapAction')}
        onClick={onAsk}
      />
    )}
  </div>
);
