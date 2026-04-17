'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { NNBtn, NNIcon, NNLogo, NNPlant } from '@/components/ui';
import { useNN } from '@/lib/store';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';

// ─────────────────────────────────────────────
// ONBOARDING — 4-step flow (interactive)
// ─────────────────────────────────────────────
type ImportSource = 'anki' | 'csv' | 'pdf';

const TOPIC_KEYS = [
  { key: 'languages', c: 'amber-500', tint: 'rgba(243,182,85,0.08)' },
  { key: 'medicine', c: 'rose-500', tint: 'rgba(232,120,138,0.08)' },
  { key: 'cs', c: 'violet-500', tint: 'rgba(167,136,255,0.08)' },
  { key: 'law', c: 'sky-500', tint: 'rgba(85,196,214,0.08)' },
  { key: 'math', c: 'lime-500', tint: 'rgba(154,209,85,0.08)' },
  { key: 'other', c: 'text-dim', tint: 'transparent' },
];

const GOAL_OPTIONS = [15, 30, 45, 60];

export const NNOnboarding = () => {
  const t = useT();
  const router = useRouter();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const profile = useNN(s => s.profile);
  const updateProfile = useNN(s => s.updateProfile);

  const [step, setStep] = useState(0); // 0..3
  const [topics, setTopics] = useState<Set<string>>(new Set());
  const [dailyGoal, setDailyGoal] = useState<number>(profile?.dailyGoalMinutes ?? 30);
  const [species] = useState<'fern'>('fern');
  const [nameDraft, setNameDraft] = useState<string>(profile?.name ?? '');

  const TOPICS = TOPIC_KEYS.map(k => ({
    ...k,
    n: t(`onboarding.topics.${k.key}.n`),
    d: t(`onboarding.topics.${k.key}.d`),
  }));

  const steps = [
    { n: t('onboarding.steps.welcome'), icon: 'sparkle' },
    { n: t('onboarding.steps.goals'), icon: 'target' },
    { n: t('onboarding.steps.import'), icon: 'stack' },
    { n: t('onboarding.steps.plantSeed'), icon: 'garden' },
  ];

  const toggleTopic = (key: string) => {
    setTopics(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onImport = (src: ImportSource) => {
    // TODO: wire real import flow (Anki .apkg / CSV / PDF → AI pipeline).
    console.log('TODO onboarding import:', src);
  };

  const onFinish = async () => {
    const name = nameDraft.trim();
    await updateProfile({
      ...(name ? { name } : {}),
      dailyGoalMinutes: dailyGoal,
      plantSpecies: species,
    });
    router.push('/');
  };

  const onNext = () => {
    if (step < 3) {
      // Persist goal as we leave step 1.
      if (step === 1 && profile && dailyGoal !== profile.dailyGoalMinutes) {
        void updateProfile({ dailyGoalMinutes: dailyGoal });
      }
      setStep(s => s + 1);
    } else {
      void onFinish();
    }
  };

  const onBack = () => setStep(s => Math.max(0, s - 1));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', background: 'radial-gradient(ellipse at top, rgba(154,209,85,0.05), var(--bg))', overflow: 'hidden' }}>
      {/* Sidebar with steps (desktop) / compact top bar (mobile) */}
      {isMobile ? (
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <NNLogo size={24}/>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>
              {t('onboarding.stepOf', { n: step + 1, total: 4 })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {steps.map((s, i) => {
              const done = i < step, active = i === step;
              return (
                <React.Fragment key={s.n}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: done ? 'var(--lime-500)' : active ? 'var(--surface-3)' : 'transparent',
                    border: active ? '1px solid var(--lime-500)' : '1px solid var(--border-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: done ? '#0a0b0d' : active ? 'var(--lime-400)' : 'var(--text-dim)',
                    fontSize: 10, fontWeight: 600, flexShrink: 0,
                  }} className="mono">
                    {done ? <NNIcon name="check" size={12} color="#0a0b0d"/> : i + 1}
                  </div>
                  {i < steps.length - 1 && (
                    <div style={{ flex: 1, height: 1, background: i < step ? 'var(--lime-500)' : 'var(--border-2)' }}/>
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{steps[step].n}</div>
        </div>
      ) : (
        <aside style={{ width: 280, padding: '40px 28px', borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
          <NNLogo size={32}/>
          <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {steps.map((s, i) => {
              const done = i < step, active = i === step;
              return (
                <div key={s.n} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: 10, background: active ? 'var(--surface-2)' : 'transparent',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: done ? 'var(--lime-500)' : active ? 'var(--surface-3)' : 'transparent',
                    border: active ? '1px solid var(--lime-500)' : '1px solid var(--border-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: done ? '#0a0b0d' : active ? 'var(--lime-400)' : 'var(--text-dim)',
                    fontSize: 11, fontWeight: 600,
                  }} className="mono">
                    {done ? <NNIcon name="check" size={14} color="#0a0b0d"/> : i + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: active || done ? 'var(--text)' : 'var(--text-dim)', fontWeight: 500 }}>{s.n}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{t('onboarding.stepLabel', { n: i + 1, total: 4 })}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>{t('onboarding.skipSetup')}</div>
        </aside>
      )}

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: isMobile ? '24px 14px' : '60px 80px', overflow: 'auto' }}>
        {!isMobile && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600, marginBottom: 8 }}>
            {t('onboarding.stepOf', { n: step + 1, total: 4 })}
          </div>
        )}

        {step === 0 && (
          <>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: isMobile ? 36 : 56, lineHeight: 1.05, letterSpacing: -1.5, marginBottom: 16 }}>
              {t('onboarding.welcome.title')}
            </div>
            <div style={{ fontSize: isMobile ? 14 : 16, color: 'var(--text-muted)', maxWidth: 600, lineHeight: 1.55, marginBottom: isMobile ? 28 : 40 }}>
              {t('onboarding.welcome.sub')}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: isMobile ? 36 : 48, lineHeight: 1.1, letterSpacing: -1.2, marginBottom: 12 }}>
              {t('onboarding.goals.title')}
            </div>
            <div style={{ fontSize: isMobile ? 14 : 15, color: 'var(--text-muted)', maxWidth: 560, marginBottom: isMobile ? 22 : 32 }}>
              {t('onboarding.goals.sub')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 7 : 10, maxWidth: 680 }}>
              {TOPICS.map(c => {
                const active = topics.has(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggleTopic(c.key)}
                    style={{
                      padding: 16, borderRadius: 12, textAlign: 'left', cursor: 'pointer',
                      background: active ? c.tint : 'var(--surface)',
                      border: active ? `1px solid var(--${c.c})` : '1px solid var(--border)',
                      color: 'var(--text)', font: 'inherit',
                    }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: `var(--${c.c})`, opacity: active ? 1 : 0.3, marginBottom: 10 }}/>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{c.n}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 2 }}>{c.d}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: isMobile ? 22 : 32, maxWidth: 500 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>{t('onboarding.goals.dailyGoal')}</div>
              <div style={{ display: 'flex', gap: isMobile ? 6 : 8 }}>
                {GOAL_OPTIONS.map(m => {
                  const active = dailyGoal === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDailyGoal(m)}
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: 10, textAlign: 'center', cursor: 'pointer',
                        background: active ? 'var(--lime-500)' : 'var(--surface)',
                        color: active ? '#0a0b0d' : 'var(--text)',
                        border: active ? '1px solid var(--lime-500)' : '1px solid var(--border)',
                        fontSize: 13, fontWeight: 500, font: 'inherit',
                      }}
                    >{t('onboarding.goals.minutesOption', { n: m })}</button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: isMobile ? 36 : 48, lineHeight: 1.1, letterSpacing: -1.2, marginBottom: 12 }}>
              {t('onboarding.import.title')}
            </div>
            <div style={{ fontSize: isMobile ? 14 : 15, color: 'var(--text-muted)', maxWidth: 560, marginBottom: isMobile ? 18 : 24 }}>
              {t('onboarding.import.sub')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 7 : 10, maxWidth: 680 }}>
              {[
                { src: 'anki' as const, n: t('onboarding.import.anki.n'), d: t('onboarding.import.anki.d'), icon: 'stack', recommended: true },
                { src: 'csv' as const, n: t('onboarding.import.csv.n'), d: t('onboarding.import.csv.d'), icon: 'grid' },
                { src: 'pdf' as const, n: t('onboarding.import.pdf.n'), d: t('onboarding.import.pdf.d'), icon: 'sync' },
              ].map(s => (
                <button
                  key={s.n}
                  type="button"
                  onClick={() => onImport(s.src)}
                  style={{
                    padding: 16, borderRadius: 12, background: 'var(--surface)',
                    border: s.recommended ? '1px solid var(--lime-500)' : '1px solid var(--border)',
                    position: 'relative', textAlign: 'left', cursor: 'pointer',
                    color: 'var(--text)', font: 'inherit',
                  }}
                >
                  {s.recommended && (
                    <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, color: 'var(--lime-400)', fontWeight: 600, letterSpacing: 0.6 }}>{t('onboarding.import.popular')}</div>
                  )}
                  <NNIcon name={s.icon as 'stack' | 'grid' | 'sync'} size={22} color="var(--text)"/>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>{s.n}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 2 }}>{s.d}</div>
                </button>
              ))}
            </div>
            <div
              onClick={() => onImport('pdf')}
              style={{ marginTop: isMobile ? 14 : 20, padding: isMobile ? 18 : 24, border: '2px dashed var(--border-2)', borderRadius: 14, textAlign: 'center', maxWidth: '100%', width: 680, boxSizing: 'border-box', background: 'rgba(167,136,255,0.04)', cursor: 'pointer' }}
            >
              <NNIcon name="sparkle" size={20} color="var(--violet-400)"/>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8, color: 'var(--violet-400)' }}>{t('onboarding.import.dropPdf')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{t('onboarding.import.dropPdfSub')}</div>
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-dim)' }}>
              {t('onboarding.import.skipHint')}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: isMobile ? 36 : 48, lineHeight: 1.1, letterSpacing: -1.2, marginBottom: 12 }}>
              {t('onboarding.seed.title')}
            </div>
            <div style={{ fontSize: isMobile ? 14 : 15, color: 'var(--text-muted)', maxWidth: 560, marginBottom: isMobile ? 22 : 32 }}>
              {t('onboarding.seed.sub')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 7 : 10, maxWidth: 680 }}>
              {[
                { key: 'fern', n: t('onboarding.seed.species.fern.n'), d: t('onboarding.seed.species.fern.d'), available: true },
                { key: 'bamboo', n: t('onboarding.seed.species.bamboo.n'), d: t('onboarding.seed.species.bamboo.d'), available: false },
                { key: 'succulent', n: t('onboarding.seed.species.succulent.n'), d: t('onboarding.seed.species.succulent.d'), available: false },
                { key: 'oak', n: t('onboarding.seed.species.oak.n'), d: t('onboarding.seed.species.oak.d'), available: false },
              ].map((p, i) => {
                const active = p.available && species === 'fern';
                return (
                  <div key={p.key} style={{
                    padding: 14, borderRadius: 12,
                    background: active ? 'rgba(154,209,85,0.08)' : 'var(--surface)',
                    border: active ? '1px solid var(--lime-500)' : '1px solid var(--border)',
                    textAlign: 'center', opacity: p.available ? 1 : 0.45,
                  }}>
                    <NNPlant stage={3 + (i % 2)} size={80}/>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{p.n}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{p.d}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: isMobile ? 22 : 32, maxWidth: 500 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{t('onboarding.seed.yourName')}</div>
              <input
                type="text"
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                placeholder={t('onboarding.seed.namePlaceholder')}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 10,
                  background: 'var(--surface)', border: '1px solid var(--border-2)',
                  color: 'var(--text)', fontSize: 16, outline: 'none',
                }}
              />
            </div>
          </>
        )}

        <div style={{ flex: 1 }}/>
        <div style={{ display: 'flex', gap: 10, marginTop: isMobile ? 22 : 32 }}>
          {step > 0 && <NNBtn size="lg" variant="soft" icon="chevl" onClick={onBack}>{t('onboarding.nav.back')}</NNBtn>}
          <div style={{ flex: 1 }}/>
          <NNBtn size="lg" variant="primary" iconRight="chevr" onClick={onNext}>
            {step < 3 ? t('onboarding.nav.continue') : t('onboarding.nav.enter')}
          </NNBtn>
        </div>
      </div>
    </div>
  );
};
