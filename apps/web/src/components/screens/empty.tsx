'use client';

import React from 'react';
import Link from 'next/link';
import { NNBtn, NNIcon, NNPlant } from '@/components/ui';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';

export const NNEmpty = ({ kind = 'first-run' }: { kind?: 'first-run' | 'done' | 'graph' }) => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  if (kind === 'first-run') {
    const starterDecks: { key: string; label: string }[] = [
      { key: 'top1000', label: t('empty.firstRun.starter.top1000') },
      { key: 'usStates', label: t('empty.firstRun.starter.usStates') },
      { key: 'basicFrench', label: t('empty.firstRun.starter.basicFrench') },
      { key: 'pythonSyntax', label: t('empty.firstRun.starter.pythonSyntax') },
      { key: 'chemistry101', label: t('empty.firstRun.starter.chemistry101') },
    ];
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '24px 14px' : 40 }}>
        <div style={{ textAlign: 'center', maxWidth: 480, width: '100%' }}>
          <div style={{ width: isMobile ? 96 : 120, height: isMobile ? 96 : 120, borderRadius: 24, background: 'rgba(154,209,85,0.06)', border: '1px solid rgba(154,209,85,0.15)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <NNPlant stage={1} size={isMobile ? 72 : 90}/>
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: isMobile ? 32 : 38, lineHeight: 1.1, letterSpacing: -1 }}>
            {t('empty.firstRun.title')}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>
            {t('empty.firstRun.subtitle')}
          </div>
          <div style={{ display: 'flex', gap: isMobile ? 7 : 10, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            <Link href="/decks"><NNBtn size="lg" variant="primary" icon="plus">{t('empty.firstRun.newDeck')}</NNBtn></Link>
          </div>
          {/* sample decks */}
          <div style={{ marginTop: isMobile ? 22 : 32, paddingTop: isMobile ? 16 : 24, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>{t('empty.firstRun.starterLabel')}</div>
            <div style={{ display: 'flex', gap: isMobile ? 6 : 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {starterDecks.map(d => (
                <span key={d.key} style={{ padding: '6px 12px', fontSize: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, color: 'var(--text-muted)' }}>{d.label}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (kind === 'done') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '24px 14px' : 40 }}>
        <div style={{ textAlign: 'center', maxWidth: 420, width: '100%' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(154,209,85,0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <NNIcon name="check" size={38} color="var(--lime-400)" strokeWidth={2.2}/>
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: isMobile ? 28 : 34, lineHeight: 1.1, letterSpacing: -0.8 }}>
            {t('empty.done.title')}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>
            {t('empty.done.subtitlePrefix')} <span className="mono" style={{ color: 'var(--lime-400)' }}>6h 14m</span>.
            {' '}{t('empty.done.subtitleSuffix')}
          </div>
          <div style={{ display: 'flex', gap: isMobile ? 7 : 10, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            <Link href="/review"><NNBtn size="lg" variant="soft" icon="bolt">{t('empty.done.learnNew', { n: 12 })}</NNBtn></Link>
            <Link href="/graph"><NNBtn size="lg" variant="ghost" icon="graph">{t('empty.done.exploreGraph')}</NNBtn></Link>
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
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: isMobile ? 26 : 30, lineHeight: 1.1, letterSpacing: -0.6 }}>
          {t('empty.graph.title')}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>
          {t('empty.graph.subtitlePrefix')} <span style={{ color: 'var(--text)' }} className="mono">6</span>.
          {' '}{t('empty.graph.subtitleSuffix')}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 24 }}>
          <Link href="/editor"><NNBtn size="lg" variant="primary" icon="plus">{t('empty.graph.addCards')}</NNBtn></Link>
        </div>
      </div>
    </div>
  );
};
