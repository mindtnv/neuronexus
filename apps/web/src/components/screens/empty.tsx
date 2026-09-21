'use client';

import React from 'react';
import { AppLink } from '@/components/navigation';
import { State } from 'ts-fsrs';
import { NNBtn, NNIcon } from '@/components/ui';
import { PageSurface } from '@/components/design-system/primitives';
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
      <PageSurface className="reomi-welcome-page">
        <div className="reomi-welcome">
          <div className="reomi-welcome-icon" aria-hidden="true">
            <NNIcon name="garden" size={32}/>
          </div>
          <h1>{t('empty.firstRun.title')}</h1>
          <p className="reomi-welcome-description">
            {t('empty.firstRun.subtitle')}
          </p>
          {/* Three-domain onboarding cards */}
          <div className="reomi-welcome-options">
            {onboarding.map((o) => (
              <AppLink
                key={o.key}
                href={o.href}
                className="reomi-welcome-option"
                style={{ '--welcome-tone': o.tone } as React.CSSProperties}
              >
                <span className="reomi-welcome-option-icon" aria-hidden="true">
                  <NNIcon name={o.icon} size={18} color={o.tone} />
                </span>
                <h2>
                  {t(`empty.firstRun.cards.${o.key}.title`)}
                </h2>
                <p>
                  {t(`empty.firstRun.cards.${o.key}.desc`)}
                </p>
                <span className="reomi-welcome-option-arrow" aria-hidden="true"><NNIcon name="chevr" size={16}/></span>
              </AppLink>
            ))}
          </div>
        </div>
      </PageSurface>
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
