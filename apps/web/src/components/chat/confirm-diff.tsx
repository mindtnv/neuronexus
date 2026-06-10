'use client';

// ConfirmDiff (B4/C8) — compact before/after rows for a paused write tool's
// confirm card. edit_card renders rose "−" before-lines + lime "+" after-lines;
// create_card renders after-only proposal rows. Values arrive pre-capped (~300
// chars, whitespace-collapsed) from the server's dryRun. Hand-rolled styles.

import React from 'react';
import type { ConfirmDiffRow } from '@/lib/chat-activity';

type T = (key: string, params?: Record<string, string | number>) => string;

export interface ConfirmDiffProps {
  rows: ConfirmDiffRow[];
  /** True for create_card (after-only proposal — uses the "proposed" heading). */
  proposalOnly: boolean;
  t: T;
}

const lineStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  lineHeight: 1.5,
  padding: '3px 8px',
  borderRadius: 'var(--r-xs)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

export const ConfirmDiff = ({ rows, proposalOnly, t }: ConfirmDiffProps) => {
  if (rows.length === 0) return null;
  // Batch create: rows tagged with cardIndex get a "Card N" divider when the
  // index changes (rows arrive grouped in batch order from confirmDiffRows).
  const isBatch = rows.some((r) => r.cardIndex !== undefined);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {proposalOnly ? t('chat.confirm.proposed') : t('chat.confirm.changes')}
      </span>
      {rows.map((row, i) => (
        <React.Fragment key={`${row.cardIndex ?? ''}:${row.field}:${i}`}>
          {isBatch && (i === 0 || rows[i - 1]!.cardIndex !== row.cardIndex) && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-sans)',
                marginTop: i === 0 ? 0 : 6,
              }}
            >
              {t('chat.confirm.cardN', { n: (row.cardIndex ?? 0) + 1 })}
            </span>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {row.field}
          </span>
          {row.before !== undefined && (
            <div
              style={{
                ...lineStyle,
                color: 'var(--rose-400)',
                background: 'color-mix(in srgb, var(--rose-500) 10%, transparent)',
              }}
            >
              − {row.before}
            </div>
          )}
          {row.after !== undefined && (
            <div
              style={{
                ...lineStyle,
                color: 'var(--lime-400)',
                background: 'color-mix(in srgb, var(--lime-500) 10%, transparent)',
              }}
            >
              + {row.after}
            </div>
          )}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};
