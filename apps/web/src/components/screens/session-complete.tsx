'use client';

import { useEffect, useState } from 'react';
import { useAppNavigation } from '@/components/navigation';
import { NNBadge, NNBtn, NNCard, NNPageSkeleton, NNPlant } from '@/components/ui';
import { useNN } from '@/lib/store';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useLocale, useT } from '@/lib/i18n';
import { readStudyResult, type StudyResult } from '@/lib/study-result';
import { useStudyForecast, useStudyOverview } from '@/lib/use-study-overview';

export const NNSessionComplete = () => {
  const t = useT();
  const router = useAppNavigation();
  const userId = useNN((state) => state.profile?.userId);
  const bootstrapped = useNN((state) => state.bootstrapped);
  const [loaded, setLoaded] = useState<{ userId?: string; result: StudyResult | null } | null>(null);
  useEffect(() => { setLoaded({ userId, result: readStudyResult(userId) }); }, [userId]);

  if (!bootstrapped || !loaded || loaded.userId !== userId) return <NNPageSkeleton />;
  if (!loaded.result) return <div className="nn-empty-state" style={{ padding: 24, gap: 16 }}>
    <h1 className="nn-h1">{t('session.empty.title')}</h1>
    <p style={{ color: 'var(--text-muted)', maxWidth: 460 }}>{t('session.empty.subtitle')}</p>
    <NNBtn variant="primary" size="lg" onClick={() => router.push('/review')}>{t('session.empty.startReview')}</NNBtn>
  </div>;
  return <StudyResultView session={loaded.result} />;
};

function StudyResultView({ session }: { session: StudyResult }) {
  const t = useT();
  const { locale } = useLocale();
  const router = useAppNavigation();
  const isMobile = useBreakpoint() === 'mobile';
  const profile = useNN((state) => state.profile);
  const study = useStudyOverview();
  const scope = new URL(session.reviewHref, 'https://neuronexus.invalid').searchParams.get('deck') ?? undefined;
  const forecast = useStudyForecast(2, study.data?.overall.serverNow, scope);
  const counts = scope ? study.data?.decks[scope] : study.data?.overall;
  const scopeMissing = Boolean(scope && study.data && !counts);
  const totalSeconds = Math.floor(session.durationMs / 1000);
  const duration = `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
  const tomorrow = new Date(Date.parse(study.data?.overall.serverNow ?? new Date().toISOString()) + 86_400_000).toISOString().slice(0, 10);
  const tomorrowCount = forecast.data ? forecast.data.buckets.find((bucket) => bucket.day === tomorrow)?.count ?? 0 : null;
  const kpis = [
    { label: t('session.kpi.answers'), value: session.answers, hint: t('session.saved') },
    { label: t('session.kpi.cardsReviewed'), value: session.cards, hint: t('session.kpi.uniqueHint') },
    { label: t('session.kpi.duration'), value: duration, hint: t('session.kpi.durationSub') },
    { label: t('session.kpi.xpEarned'), value: `+${session.xpGained}`, hint: t('session.kpi.xpSub', { total: profile?.xp ?? 0 }) },
  ];
  const ratings = [
    { rating: 1 as const, key: 'again', color: 'var(--rose-400)' },
    { rating: 2 as const, key: 'hard', color: 'var(--amber-400)' },
    { rating: 3 as const, key: 'good', color: 'var(--lime-400)' },
    { rating: 4 as const, key: 'easy', color: 'var(--sky-400)' },
  ];
  const continueLabel = session.mode === 'filtered' ? t('session.actions.repeatPractice')
    : counts && counts.totalAvailable > 0 ? t('session.actions.continue') : t('session.actions.checkQueue');

  return <div className="nn-scroll" style={{ flex: 1, overflow: 'auto', padding: isMobile ? '24px 14px 40px' : '40px 32px' }}>
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <NNBadge tone="lime" icon="check" style={{ color: 'var(--text)' }}>{t('session.complete')}</NNBadge>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: isMobile ? 34 : 46, lineHeight: 1.15, margin: '14px 0 8px', overflowWrap: 'anywhere' }}>
            {t('session.heading', { name: profile?.name ?? t('session.defaultUserName') })}
          </h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
            {session.deckName} · {new Date(session.completedAt).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        {!isMobile && <NNPlant stage={profile?.plantStage ?? 0} species={profile?.plantSpecies} size={90} />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
        {kpis.map((kpi) => <NNCard key={kpi.label} padding={isMobile ? 14 : 18}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{kpi.label}</div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 600, margin: '8px 0' }}>{kpi.value}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{kpi.hint}</div>
        </NNCard>)}
      </div>

      <NNCard padding={20} style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 16px' }}>{t('session.breakdown.title')}</h2>
        <div aria-hidden="true" style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
          {ratings.filter(({ rating }) => session.grades[rating] > 0).map(({ rating, color }) => <div key={rating} style={{ flex: session.grades[rating], background: color }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12, marginTop: 16 }}>
          {ratings.map(({ rating, key, color }) => <div key={rating} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <span aria-hidden="true" style={{ background: color, width: 8, height: 8, borderRadius: 2 }} />
            <span>{t(`review.ratings.${key}`)}</span><strong className="mono">{session.grades[rating]}</strong>
          </div>)}
        </div>
        <p style={{ margin: '18px 0 0', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>{t('session.scheduleSaved')}</p>
      </NNCard>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
        <NNCard padding={18}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('session.scheduledDay', { date: new Date(`${tomorrow}T12:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric' }) })}</div>
          <div className="mono" style={{ fontSize: 24, margin: '8px 0' }}>{tomorrowCount === null ? '—' : t('session.tomorrow.due', { n: tomorrowCount })}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('session.tomorrow.hint')}</div>
          {forecast.error && <div role="alert" style={{ marginTop: 8, fontSize: 12 }}>{t('home.forecastError')} <NNBtn size="sm" variant="ghost" onClick={forecast.reload}>{t('review.retry')}</NNBtn></div>}
        </NNCard>
        <NNCard padding={18}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('session.newAvailable.title')}</div>
          <div className="mono" style={{ fontSize: 24, margin: '8px 0' }}>{counts ? t('session.newAvailable.inQueue', { n: counts.availableNew }) : '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('session.newAvailable.hint')}</div>
          {counts?.nextDueAt && <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-muted)' }}>{t('session.nextReview', { time: new Date(counts.nextDueAt).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })}</p>}
          {study.error && <div role="alert" style={{ marginTop: 8, fontSize: 12 }}>{t('home.countsError')} <NNBtn size="sm" variant="ghost" onClick={study.reload}>{t('review.retry')}</NNBtn></div>}
          {scopeMissing && <p role="status" style={{ fontSize: 12 }}>{t('session.scopeMissing')}</p>}
        </NNCard>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
        <NNBtn size="lg" variant="primary" disabled={scopeMissing} onClick={() => router.push(session.reviewHref)}>{continueLabel}</NNBtn>
        <NNBtn size="lg" variant="soft" onClick={() => router.push('/decks')}>{t('nav.decks')}</NNBtn>
        <NNBtn size="lg" variant="ghost" onClick={() => router.push('/')}>{t('session.actions.finish')}</NNBtn>
      </div>
    </div>
  </div>;
}
