'use client';

import React from 'react';
import { NNBadge, NNBtn, NNCard, NNIcon } from '@/components/ui';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';

// ─────────────────────────────────────────────
// IMPORT PDF → AI cards
// ─────────────────────────────────────────────
export const NNImportPDF = () => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  return (
  <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? 14 : 24 }}>
    {/* Stepper */}
    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, marginBottom: isMobile ? 14 : 20, fontSize: isMobile ? 11 : 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--lime-400)' }}>{t('import.steps.upload')}</span>
      <div style={{ width: isMobile ? 14 : 24, height: 1, background: 'var(--border-2)' }}/>
      <span style={{ color: 'var(--lime-400)' }}>{t('import.steps.analyze')}</span>
      <div style={{ width: isMobile ? 14 : 24, height: 1, background: 'var(--border-2)' }}/>
      <span style={{ color: 'var(--text)' }}>{t('import.steps.review')}</span>
      <div style={{ width: isMobile ? 14 : 24, height: 1, background: 'var(--border)' }}/>
      <span>{t('import.steps.save')}</span>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '340px 1fr', gap: isMobile ? 12 : 16 }}>
      {/* PDF preview */}
      <div>
        <NNCard padding={0}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <NNIcon name="image" size={14} color="var(--text-muted)"/>
            <div style={{ fontSize: 12.5, fontWeight: 500, flex: 1 }}>B2_Modalverben.pdf</div>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }} className="mono">{t('import.pages', { n: 24 })}</span>
          </div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3, 4].map(p => (
              <div key={p} style={{ aspectRatio: '3/4', background: '#e8e8e8', borderRadius: 4, padding: 12, position: 'relative' }}>
                <div style={{ height: 6, background: '#888', width: '60%', marginBottom: 6, borderRadius: 1 }}/>
                <div style={{ height: 3, background: '#bbb', width: '90%', marginBottom: 3 }}/>
                <div style={{ height: 3, background: '#bbb', width: '85%', marginBottom: 3 }}/>
                <div style={{ height: 3, background: '#bbb', width: '70%', marginBottom: 10 }}/>
                <div style={{ height: 4, background: '#f3b655', width: '40%', marginBottom: 4, borderRadius: 1 }}/>
                <div style={{ height: 3, background: '#bbb', width: '80%', marginBottom: 3 }}/>
                <div style={{ height: 3, background: '#bbb', width: '88%', marginBottom: 3 }}/>
                <span style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 9, color: '#666' }} className="mono">p.{p}</span>
              </div>
            ))}
          </div>
        </NNCard>
        <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'rgba(167,136,255,0.06)', border: '1px solid rgba(167,136,255,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <NNIcon name="sparkle" size={12} color="var(--violet-400)"/>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--violet-400)' }}>{t('import.aiAnalysis')}</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('import.detected')}
          </div>
        </div>
      </div>

      {/* Card list */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{t('import.generatedCards')}</div>
          <NNBadge tone="violet" size="sm" icon="sparkle">{t('import.cardsBadge', { n: 32 })}</NNBadge>
          <div style={{ flex: 1 }}/>
          <NNBtn size="sm" variant="ghost">{t('import.deselectAll')}</NNBtn>
          <NNBtn size="sm" variant="soft">{t('import.regenerate')}</NNBtn>
        </div>

        {/* Settings bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, padding: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <NNBadge tone="lime" size="sm">{t('import.types.basic')}</NNBadge>
          <NNBadge tone="neutral" size="sm">{t('import.types.cloze')}</NNBadge>
          <NNBadge tone="neutral" size="sm">{t('import.types.reverse')}</NNBadge>
          <div style={{ flex: 1 }}/>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', alignSelf: 'center' }}>{t('import.deckLabel')}</span>
          <NNBadge tone="amber" size="sm">{t('import.deckName')}</NNBadge>
        </div>

        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { q: 'können', a: 'to be able to, can', ex: 'Ich kann Deutsch sprechen.', selected: true, page: 2, quality: 'good' },
            { q: 'dürfen', a: 'to be allowed to, may', ex: 'Darf ich hier rauchen?', selected: true, page: 4, quality: 'good' },
            { q: 'müssen', a: 'to have to, must', ex: 'Du musst das machen.', selected: true, page: 6, quality: 'good' },
            { q: 'sollen', a: 'to be supposed to, should', ex: 'Er soll morgen kommen.', selected: true, page: 9, quality: 'low' },
            { q: 'wollen', a: 'to want to', ex: 'Wir wollen nach Hause.', selected: false, page: 12, quality: 'good' },
            { q: 'mögen', a: 'to like', ex: 'Ich mag Kaffee.', selected: true, page: 15, quality: 'good' },
          ].map((c, i) => (
            <div key={i} style={{
              padding: isMobile ? 10 : 14, borderRadius: 10,
              background: c.selected ? 'var(--surface)' : 'var(--surface-2)',
              border: c.selected ? '1px solid var(--lime-500)' : '1px solid var(--border)',
              opacity: c.selected ? 1 : 0.55,
              display: 'flex', alignItems: 'flex-start', gap: isMobile ? 8 : 12, flexWrap: isMobile ? 'wrap' : 'nowrap',
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 5, marginTop: 2,
                background: c.selected ? 'var(--lime-500)' : 'var(--surface-3)',
                border: c.selected ? 'none' : '1px solid var(--border-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{c.selected && <NNIcon name="check" size={12} color="#0a0b0d"/>}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text)' }}>{c.q}</div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>→ {c.a}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, fontStyle: 'italic' }}>{c.ex}</div>
              </div>
              <NNBadge tone={c.quality === 'good' ? 'lime' : 'amber'} size="xs">{c.quality === 'good' ? t('import.quality.high') : t('import.quality.needsEdit')}</NNBadge>
              <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }} className="mono">p.{c.page}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 10, paddingTop: 16, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <NNBtn size="lg" variant="soft" icon="chevl">{t('import.back')}</NNBtn>
          <div style={{ flex: 1 }}/>
          <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            {t('import.selection', { selected: 5, total: 6 })}
          </span>
          <NNBtn size="lg" variant="primary" iconRight="arrow">{t('import.saveBtn', { n: 5 })}</NNBtn>
        </div>
      </div>
    </div>
  </div>
  );
};
