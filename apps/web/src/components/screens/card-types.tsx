'use client';

import React from 'react';
import { NNBadge, NNKbd } from '@/components/ui';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';

const CardTypeCloze = () => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const isDesktop = bp === 'desktop';
  return (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '24px 14px' : 40, background: 'radial-gradient(ellipse at top, rgba(167,136,255,0.04), transparent 60%)' }}>
    <div style={{ width: isMobile ? '100%' : 640, maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <NNBadge tone="violet" size="sm" icon="sparkle">{t('cards.cloze.badge')}</NNBadge>
        <NNBadge tone="neutral" size="sm">{t('cards.cloze.subBadge')}</NNBadge>
        <div style={{ flex: 1 }}/>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }} className="mono">c{'{'}{'{'}c1{'}'}{'}'}</span>
      </div>
      <div style={{ padding: isMobile ? 24 : 48, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--border-2)', minHeight: isMobile ? 220 : 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: isMobile ? 22 : 32, lineHeight: 1.4, textAlign: 'center', maxWidth: 520 }}>
          {t('cards.cloze.samplePrefix')} <span style={{
            padding: '4px 18px', background: 'rgba(167,136,255,0.15)',
            border: '1.5px dashed var(--violet-400)', borderRadius: 8,
            color: 'var(--violet-400)', fontStyle: 'italic', fontSize: isMobile ? 18 : 24,
            verticalAlign: 'middle', margin: '0 4px',
          }}>[ ... ]</span> {t('cards.cloze.sampleMiddle')} <span style={{ color: 'var(--violet-400)' }}>1648</span>{t('cards.cloze.sampleComma')} <span style={{ color: 'var(--text-muted)' }}>{t('cards.cloze.sampleWar')}</span>.
        </div>
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'center' }}>
        <NNKbd>Space</NNKbd>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', alignSelf: 'center' }}>{t('cards.cloze.revealHint')}</span>
      </div>
    </div>
  </div>
  );
};

const CardTypeImageOcclusion = () => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const isDesktop = bp === 'desktop';
  return (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '24px 14px' : 40 }}>
    <div style={{ width: isMobile ? '100%' : 640, maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <NNBadge tone="sky" size="sm" icon="image">{t('cards.occlusion.badge')}</NNBadge>
        <NNBadge tone="neutral" size="sm">{t('cards.occlusion.subBadge')}</NNBadge>
        <div style={{ flex: 1 }}/>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }} className="mono">{t('cards.occlusion.maskOf', { current: 2, total: 5 })}</span>
      </div>
      {/* Fake anatomical image */}
      <div style={{ padding: isMobile ? 14 : 20, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--border-2)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, textAlign: 'center' }}>{t('cards.occlusion.question')}</div>
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', aspectRatio: '16/10', background: '#2a1f18' }}>
          {/* sketched heart diagram */}
          <svg viewBox="0 0 640 400" style={{ width: '100%', height: '100%', display: 'block' }}>
            <defs>
              <radialGradient id="hbg" cx="50%" cy="50%">
                <stop offset="0" stopColor="#3a2818"/>
                <stop offset="1" stopColor="#1a0f08"/>
              </radialGradient>
            </defs>
            <rect width="640" height="400" fill="url(#hbg)"/>
            {/* chambers */}
            <path d="M 200 100 Q 180 180 220 240 L 280 240 L 280 100 Z" fill="#6b2b2b" stroke="#9a3c3c" strokeWidth="2"/>
            <path d="M 280 100 L 280 240 L 360 240 Q 400 180 380 100 Z" fill="#8a3a3a" stroke="#9a3c3c" strokeWidth="2"/>
            <path d="M 200 240 Q 180 300 220 340 L 280 340 L 280 240 Z" fill="#c44848" stroke="#da6060" strokeWidth="2"/>
            <path d="M 280 240 L 280 340 L 360 340 Q 400 300 380 240 Z" fill="#a23a3a" stroke="#da6060" strokeWidth="2"/>
            {/* arteries */}
            <path d="M 220 100 Q 220 50 280 30 Q 340 50 340 100" fill="none" stroke="#da8080" strokeWidth="12"/>
            <path d="M 260 100 Q 260 60 300 50" fill="none" stroke="#6a8ebc" strokeWidth="10"/>
            {/* masks */}
            <rect x="250" y="140" width="90" height="50" rx="6" fill="rgba(85,196,214,0.4)" stroke="var(--sky-400)" strokeWidth="2" strokeDasharray="4 3"/>
            <text x="295" y="172" fontSize="18" fill="var(--sky-400)" textAnchor="middle" fontFamily="var(--font-mono)" fontWeight="600">?</text>
            <rect x="210" y="260" width="80" height="40" rx="6" fill="rgba(120,120,140,0.25)" stroke="rgba(200,200,210,0.4)" strokeWidth="1.5"/>
            <rect x="300" y="260" width="80" height="40" rx="6" fill="rgba(120,120,140,0.25)" stroke="rgba(200,200,210,0.4)" strokeWidth="1.5"/>
          </svg>
          {/* toggle pills */}
          <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 6 }}>
            {[1,2,3,4,5].map(n => (
              <div key={n} style={{
                width: 24, height: 24, borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono)',
                background: n === 2 ? 'var(--sky-500)' : 'rgba(255,255,255,0.08)',
                color: n === 2 ? '#0a0b0d' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600,
              }}>{n}</div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <NNKbd>Space</NNKbd>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', alignSelf: 'center' }}>{t('cards.occlusion.revealHint')} · </span>
        <NNKbd>N</NNKbd>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', alignSelf: 'center' }}>{t('cards.occlusion.nextMask')}</span>
      </div>
    </div>
  </div>
  );
};

const CardTypeTypeAnswer = () => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const isDesktop = bp === 'desktop';
  return (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '24px 14px' : 40 }}>
    <div style={{ width: isMobile ? '100%' : 560, maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <NNBadge tone="lime" size="sm" icon="edit">{t('cards.type.badge')}</NNBadge>
        <NNBadge tone="neutral" size="sm">{t('cards.type.subBadge')}</NNBadge>
      </div>
      <div style={{ padding: isMobile ? 20 : 36, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--border-2)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {t('cards.type.promptLabel')}
        </div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: isMobile ? 28 : 38, textAlign: 'center', marginBottom: isMobile ? 22 : 32 }}>
          neighbor
        </div>
        <div style={{
          width: '100%', boxSizing: 'border-box',
          padding: '14px 18px', borderRadius: 10, border: '1px solid var(--lime-500)',
          background: 'rgba(154,209,85,0.04)', fontSize: 18, fontFamily: 'var(--font-serif)',
          display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
        }}>
          <span>der Nachba</span>
          <span style={{ display: 'inline-block', width: 2, height: 22, background: 'var(--lime-400)', animation: 'blink 1s infinite' }}/>
          <div style={{ flex: 1 }}/>
          <NNBadge tone="neutral" size="xs">{t('cards.type.enterToCheck')}</NNBadge>
        </div>
        {/* diff preview after submission (visualized here) */}
        <div style={{ marginTop: 20, padding: 12, background: 'var(--surface-2)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 10.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{t('cards.type.diffLabel')}</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20 }}>
            <span style={{ color: 'var(--lime-400)' }}>der Nachba</span>
            <span style={{ color: 'var(--rose-400)', textDecoration: 'line-through', opacity: 0.6 }}>_</span>
            <span style={{ color: 'var(--rose-400)', background: 'rgba(232,120,138,0.12)', padding: '0 3px', borderRadius: 3 }}>r</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

export const NNCardTypes = ({ variant = 'cloze' }: { variant?: 'cloze' | 'occlusion' | 'type' }) => {
  const Comp = { cloze: CardTypeCloze, occlusion: CardTypeImageOcclusion, type: CardTypeTypeAnswer }[variant];
  return <Comp/>;
};
