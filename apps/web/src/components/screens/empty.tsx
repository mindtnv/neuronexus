'use client';

import React from 'react';
import { AppLink } from '@/components/navigation';
import { State } from 'ts-fsrs';
import { NNBtn, NNIcon, NNPlant } from '@/components/ui';
import { useNN } from '@/lib/store';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';
import type { IconName } from '@/components/ui';

export const NNEmpty = ({ kind = 'first-run' }: { kind?: 'first-run' | 'done' | 'graph' }) => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const cards = useNN((s) => s.cards);

  if (kind === 'first-run') {
    // Three onboarding cards — one per product domain (P3.4). Cards/library/chat.
    const onboarding: { key: string; href: string; icon: IconName; tone: string }[] = [
      { key: 'deck', href: '/decks', icon: 'stack', tone: 'var(--lime-400)' },
      { key: 'library', href: '/library', icon: 'book', tone: 'var(--sky-400)' },
      { key: 'chat', href: '/chat', icon: 'sparkle', tone: 'var(--violet-400)' },
    ];
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '24px 14px' : 40 }}>
        <div style={{ textAlign: 'center', maxWidth: 640, width: '100%' }}>
          <div style={{ width: isMobile ? 96 : 120, height: isMobile ? 96 : 120, borderRadius: 24, background: 'color-mix(in srgb, var(--lime-400) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--lime-400) 15%, transparent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <NNPlant stage={1} size={isMobile ? 72 : 90}/>
          </div>
          <h1 className="nn-h1">{t('empty.firstRun.title')}</h1>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>
            {t('empty.firstRun.subtitle')}
          </div>
          {/* Three-domain onboarding cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
              gap: isMobile ? 10 : 14,
              marginTop: isMobile ? 22 : 28,
              textAlign: 'left',
            }}
          >
            {onboarding.map((o) => (
              <AppLink
                key={o.key}
                href={o.href}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: 18,
                  borderRadius: 14,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'inherit',
                  textDecoration: 'none',
                  transition: 'border-color 120ms ease, transform 120ms ease',
                }}
              >
                <span
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `color-mix(in srgb, ${o.tone} 14%, transparent)`,
                  }}
                >
                  <NNIcon name={o.icon} size={18} color={o.tone} />
                </span>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                  {t(`empty.firstRun.cards.${o.key}.title`)}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                  {t(`empty.firstRun.cards.${o.key}.desc`)}
                </div>
              </AppLink>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (kind === 'done') {
    const newCount = cards.filter((c) => (c.fsrs.state as unknown as State) === State.New).length;
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '24px 14px' : 40 }}>
        <div style={{ textAlign: 'center', maxWidth: 420, width: '100%' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'color-mix(in srgb, var(--lime-400) 10%, transparent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <NNIcon name="check" size={38} color="var(--lime-400)" strokeWidth={2.2}/>
          </div>
          <h1 className="nn-h1">{t('empty.done.title')}</h1>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>
            {t('empty.done.subtitle')}
          </div>
          <div style={{ display: 'flex', gap: isMobile ? 7 : 10, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            {newCount > 0 && (
              <AppLink href="/review"><NNBtn size="lg" variant="soft" icon="bolt">{t('empty.done.learnNew', { n: newCount })}</NNBtn></AppLink>
            )}
            <AppLink href="/graph"><NNBtn size="lg" variant="ghost" icon="graph">{t('empty.done.exploreGraph')}</NNBtn></AppLink>
          </div>
        </div>
      </div>
    );
  }
  // empty graph
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '24px 14px' : 40 }}>
      <div style={{ textAlign: 'center', maxWidth: 440, width: '100%' }}>
        {/* floating nodes */}
        <svg width="160" height="120" style={{ marginBottom: 16, maxWidth: '100%' }}>
          <circle cx="30" cy="40" r="8" fill="var(--surface-3)"/>
          <circle cx="90" cy="25" r="6" fill="var(--surface-3)"/>
          <circle cx="140" cy="60" r="10" fill="var(--surface-3)"/>
          <circle cx="60" cy="90" r="7" fill="var(--surface-3)"/>
          <circle cx="110" cy="100" r="5" fill="var(--surface-3)"/>
          <line x1="30" y1="40" x2="90" y2="25" stroke="var(--border-2)" strokeDasharray="2 3"/>
          <line x1="90" y1="25" x2="140" y2="60" stroke="var(--border-2)" strokeDasharray="2 3"/>
          <line x1="60" y1="90" x2="110" y2="100" stroke="var(--border-2)" strokeDasharray="2 3"/>
        </svg>
        <h1 className="nn-h1">{t('empty.graph.title')}</h1>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>
          {t('empty.graph.subtitlePrefix')} <span style={{ color: 'var(--text)' }} className="mono">{cards.length}</span>.
          {' '}{t('empty.graph.subtitleSuffix')}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 24 }}>
          <AppLink href="/editor"><NNBtn size="lg" variant="primary" icon="plus">{t('empty.graph.addCards')}</NNBtn></AppLink>
        </div>
      </div>
    </div>
  );
};
