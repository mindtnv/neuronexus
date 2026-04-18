'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { State } from 'ts-fsrs';
import { addDays, format, isSameDay, startOfDay, startOfMonth, subDays } from 'date-fns';
import { NNBadge, NNBtn, NNCard, NNHeatmap, NNIcon, NNMiniGraph, NNPlant } from '@/components/ui';
import { useNN } from '@/lib/store';
import { db } from '@/lib/db';
import type { Review } from '@/lib/types';
import { useEmptyRedirect } from '@/lib/use-empty-redirect';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT, useDateLocale } from '@/lib/i18n';

export const NNHome = () => {
  const t = useT();
  const router = useRouter();
  const dateLocale = useDateLocale();
  useEmptyRedirect('first-run');
  const router = useRouter();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const isDesktop = bp === 'desktop';
  const bootstrapped = useNN((s) => s.bootstrapped);
  const cards = useNN((s) => s.cards);
  const decks = useNN((s) => s.decks);
  const profile = useNN((s) => s.profile);

  const [recentReviews, setRecentReviews] = useState<Review[]>([]);
  const [monthReviews, setMonthReviews] = useState<Review[]>([]);
  const [lastReviewAt, setLastReviewAt] = useState<number | null>(null);

  useEffect(() => {
    if (!bootstrapped) return;
    let cancelled = false;
    (async () => {
      const now = new Date();
      const since30 = subDays(now, 30).getTime();
      const sinceMonth = startOfMonth(now).getTime();
      const [recent, monthly, last] = await Promise.all([
        db.reviews.where('reviewedAt').above(since30).toArray(),
        db.reviews.where('reviewedAt').above(sinceMonth).toArray(),
        db.reviews.orderBy('reviewedAt').reverse().limit(1).toArray(),
      ]);
      if (cancelled) return;
      setRecentReviews(recent);
      setMonthReviews(monthly);
      setLastReviewAt(last[0]?.reviewedAt ?? null);
    })();
    return () => {
      cancelled = false;
    };
  }, [bootstrapped]);

  const now = useMemo(() => new Date(), []);

  const dueCount = useMemo(
    () => cards.filter((c) => new Date(c.fsrs.due).getTime() <= now.getTime()).length,
    [cards, now],
  );

  const { newCount, learningCount, criticalCount } = useMemo(() => {
    let nw = 0;
    let lr = 0;
    let cr = 0;
    const nowMs = now.getTime();
    for (const c of cards) {
      const dueMs = new Date(c.fsrs.due).getTime();
      const state = c.fsrs.state as unknown as State;
      if (state === State.New) nw++;
      if (state === State.Learning || state === State.Relearning) lr++;
      if (c.fsrs.reps >= 3 && c.fsrs.lapses >= 1 && dueMs <= nowMs) cr++;
    }
    return { newCount: nw, learningCount: lr, criticalCount: cr };
  }, [cards, now]);

  const reviewCount = Math.max(0, dueCount - newCount - learningCount);
  const estMinutes = Math.round(dueCount * 0.25);

  // Today's reviewed minutes — TODO: sum durationMs from today's reviews for real impl.
  const todayReviewedMinutes = useMemo(() => {
    const today = startOfDay(now).getTime();
    const msToday = recentReviews
      .filter((r) => r.reviewedAt >= today)
      .reduce((sum, r) => sum + (r.durationMs || 0), 0);
    return Math.floor(msToday / 60000);
  }, [recentReviews, now]);

  const dailyGoalMinutes = profile?.dailyGoalMinutes ?? 30;
  const goalPct = Math.min(100, Math.round((todayReviewedMinutes / Math.max(1, dailyGoalMinutes)) * 100));

  // Retention over last 30 days (rating >= 3 / total) — queried async from db.
  const retentionPct = useMemo(() => {
    if (recentReviews.length === 0) return null;
    const good = recentReviews.filter((r) => r.rating >= 3).length;
    return Math.round((good / recentReviews.length) * 100);
  }, [recentReviews]);

  const xpDisplay = useMemo(() => {
    const xp = profile?.xp ?? 0;
    return xp >= 1000 ? `${(xp / 1000).toFixed(1)}k` : String(xp);
  }, [profile]);

  // Forecast: next 7 days bucketed by due date.
  const forecast = useMemo(() => {
    const buckets: { day: string; date: string; n: number; clr: 'lime' | 'amber' }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(now, i);
      const n = cards.filter((c) => isSameDay(new Date(c.fsrs.due), d)).length;
      const label =
        i === 0 ? t('time.today') : i === 1 ? t('time.tomorrow') : format(d, 'EEEE', { locale: dateLocale });
      buckets.push({
        day: label,
        date: format(d, 'MMM d', { locale: dateLocale }),
        n,
        clr: n > 50 ? 'amber' : 'lime',
      });
    }
    return buckets;
  }, [cards, now, t]);

  const forecastMax = Math.max(80, ...forecast.map((b) => b.n));

  // Graph metrics — estimate links, clusters = deck count.
  const nodes = cards.length;
  const links = cards.length * 2;
  const clusters = decks.length;

  const lastSessionLabel = useMemo(() => {
    if (!lastReviewAt) return t('time.noSessions');
    const diffMs = Date.now() - lastReviewAt;
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    if (h >= 24) return t('home.daysAgo', { n: Math.floor(h / 24) });
    if (h >= 1) return t('home.hoursAgo', { n: h });
    if (m >= 1) return t('home.minutesAgo', { n: m });
    return t('time.justNow');
  }, [lastReviewAt, t]);

  // "Best day" label from this month's reviews — pick weekday with most reviews.
  const bestDayLabel = useMemo(() => {
    if (monthReviews.length === 0) return '—';
    const byDow = new Array(7).fill(0);
    for (const r of monthReviews) byDow[new Date(r.reviewedAt).getDay()]++;
    const best = byDow.indexOf(Math.max(...byDow));
    const keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
    return t(`home.weekday.${keys[best]}`);
  }, [monthReviews, t]);

  const todayLabel = format(now, 'MMM d', { locale: dateLocale });

  // Flex ratios for the todo/learn/critical bar — avoid 0 widths.
  const barReview = Math.max(0, reviewCount);
  const barLearn = Math.max(0, learningCount);
  const barCrit = Math.max(0, criticalCount);
  const barTotal = barReview + barLearn + barCrit;

  const dimStyle = bootstrapped ? undefined : { opacity: 0.45 };

  return (
    <div className="nn-scroll" style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px 14px 80px' : '24px 32px 80px', ...dimStyle }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.6fr 1fr', gap: isMobile ? 10 : 16, marginBottom: isMobile ? 14 : 20 }}>
        <div
          style={{
            padding: isMobile ? 16 : 24,
            borderRadius: 16,
            background: 'linear-gradient(140deg, var(--surface) 0%, var(--surface-2) 100%)',
            border: '1px solid var(--border)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: -40,
              top: -40,
              width: 200,
              height: 200,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(154,209,85,0.18), transparent 70%)',
            }}
          />
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.8,
              color: 'var(--lime-400)',
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            {t('home.todayBadge', { date: todayLabel })}
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 8 }}>
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: isMobile ? 40 : 72,
                lineHeight: 1,
                color: 'var(--text)',
                fontWeight: 400,
                letterSpacing: -2,
              }}
            >
              {dueCount}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 15 }}>{t('home.cardsDue')}</div>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20, maxWidth: 420 }}>
            {t('home.estPrefix')}
            <span className="mono" style={{ color: 'var(--text)' }}>{t('home.min', { n: estMinutes })}</span>
            {t('home.estMid', { review: reviewCount, learning: learningCount })}
            <span style={{ color: 'var(--amber-400)' }}>{t('home.estCritical', { n: criticalCount })}</span>
            {t('home.estTail')}
          </div>

          <div style={{ display: 'flex', gap: 2, marginBottom: 20, height: 6, borderRadius: 3, overflow: 'hidden' }}>
            {barTotal > 0 ? (
              <>
                <div style={{ flex: barReview, background: 'var(--lime-500)' }} />
                <div style={{ flex: barLearn, background: 'var(--violet-500)' }} />
                <div style={{ flex: barCrit, background: 'var(--amber-500)' }} />
              </>
            ) : (
              <div style={{ flex: 1, background: 'var(--surface-3)' }} />
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            <NNBtn size="lg" variant="primary" icon="bolt" onClick={() => router.push('/review')}>{t('home.startReview')}</NNBtn>
            <NNBtn size="lg" variant="outline" icon="sparkle">{t('home.aiGenerate')}</NNBtn>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-dim)', fontSize: 12 }}>
              <NNIcon name="clock" size={13} /> {t('home.lastSession', { label: lastSessionLabel })}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: isMobile ? 16 : 20,
            borderRadius: 16,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
              {t('home.streakBadge', { n: profile?.level ?? 1 })}
            </span>
            <NNBadge tone="amber" size="sm" icon="flame">{t('home.streakDays', { days: profile?.streakDays ?? 0 })}</NNBadge>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '4px 0' }}>
            <NNPlant stage={profile?.plantStage ?? 0} size={80} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 3 }}>{t('home.dailyGoal')}</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', letterSpacing: -0.5 }}>
                <span className="mono">{todayReviewedMinutes}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: 14 }}> {t('home.minOfGoal', { n: dailyGoalMinutes })}</span>
              </div>
              <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden' }}>
                <div style={{ width: `${goalPct}%`, height: '100%', background: 'var(--lime-500)' }} />
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
              gap: 8,
              padding: '12px 0 4px',
              borderTop: '1px solid var(--border)',
            }}
          >
            {[
              { v: String(cards.length), l: t('home.stats.cards') },
              { v: retentionPct != null ? `${retentionPct}%` : '—', l: t('home.stats.retention') },
              { v: xpDisplay, l: t('home.stats.xp') },
            ].map((s) => (
              <div key={s.l}>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }} className="mono">
                  {s.v}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 1fr', gap: isMobile ? 10 : 16, marginBottom: isMobile ? 14 : 20 }}>
        <NNCard padding={20}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{t('home.activity')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                <span className="mono" style={{ color: 'var(--lime-400)' }}>
                  {monthReviews.length.toLocaleString()}
                </span>
                {t('home.activitySubMid')}
                <span className="mono">{bestDayLabel}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <NNBadge size="sm" tone="neutral">{t('home.reviews')}</NNBadge>
              <NNBadge size="sm">{t('home.new')}</NNBadge>
            </div>
          </div>
          <NNHeatmap />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 14,
              fontSize: 11,
              color: 'var(--text-dim)',
            }}
          >
            <span className="mono">{format(subDays(now, 140), 'MMM', { locale: dateLocale })}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {t('home.less')}
              {['#1a1d23', 'rgba(154,209,85,0.25)', 'rgba(154,209,85,0.5)', 'var(--lime-500)'].map((c, i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
              ))}
              {t('home.more')}
            </div>
            <span className="mono">{t('time.today')}</span>
          </div>
        </NNCard>

        <NNCard padding={20}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{t('home.knowledgeGraph')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {t('home.graphSub', { nodes: nodes.toLocaleString(), links: links.toLocaleString(), clusters })}
              </div>
            </div>
            <NNBtn size="sm" variant="ghost" iconRight="arrow" onClick={() => router.push('/graph')}>{t('actions.open')}</NNBtn>
          </div>
          <div style={{ margin: '4px -4px -4px' }}>
            <NNMiniGraph height={170} />
          </div>
        </NNCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 10 : 16 }}>
        <NNCard padding={0}>
          <div
            style={{
              padding: '16px 20px 12px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t('home.forecast')}</div>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t('home.forecastSub')}</span>
          </div>
          <div style={{ padding: '8px 8px' }}>
            {forecast.map((r, i) => (
              <div
                key={i}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8 }}
              >
                <div style={{ width: 90, fontSize: 12.5, color: 'var(--text)', fontWeight: 500 }}>{r.day}</div>
                <div style={{ width: 60, fontSize: 11.5, color: 'var(--text-dim)' }} className="mono">
                  {r.date}
                </div>
                <div style={{ flex: 1, height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${(r.n / forecastMax) * 100}%`,
                      height: '100%',
                      background: r.clr === 'amber' ? 'var(--amber-500)' : 'var(--lime-500)',
                    }}
                  />
                </div>
                <div
                  style={{ width: 32, textAlign: 'right', fontSize: 12.5, color: 'var(--text)', fontWeight: 500 }}
                  className="mono"
                >
                  {r.n}
                </div>
              </div>
            ))}
          </div>
        </NNCard>

        {/* TODO: AI suggestions require an actual AI backend — keeping static mocks for now. */}
        <NNCard padding={0}>
          <div
            style={{
              padding: '16px 20px 12px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <NNIcon name="sparkle" size={14} color="var(--violet-400)" />
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t('home.aiSuggestions')}</div>
            </div>
            <NNBadge tone="violet" size="sm">{t('home.suggestionsBadge', { n: 4 })}</NNBadge>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(
              [
                {
                  t: t('home.suggestions.weakArea'),
                  d: t('home.suggestions.weakAreaDesc'),
                  cta: t('home.suggestions.weakAreaCta'),
                  tone: 'violet',
                  icon: 'target',
                },
                {
                  t: t('home.suggestions.createLink'),
                  d: t('home.suggestions.createLinkDesc'),
                  cta: t('home.suggestions.createLinkCta'),
                  tone: 'sky',
                  icon: 'link',
                },
                {
                  t: t('home.suggestions.mnemonic'),
                  d: t('home.suggestions.mnemonicDesc'),
                  cta: t('home.suggestions.mnemonicCta'),
                  tone: 'amber',
                  icon: 'bulb',
                },
                {
                  t: t('home.suggestions.importPdf'),
                  d: t('home.suggestions.importPdfDesc'),
                  cta: t('home.suggestions.importPdfCta'),
                  tone: 'lime',
                  icon: 'plus',
                },
              ] as const
            ).map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: 12,
                  borderRadius: 10,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 7,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `rgba(${
                      s.tone === 'violet'
                        ? '167,136,255'
                        : s.tone === 'sky'
                        ? '85,196,214'
                        : s.tone === 'amber'
                        ? '243,182,85'
                        : '154,209,85'
                    },0.15)`,
                    color: `var(--${s.tone}-400)`,
                  }}
                >
                  <NNIcon name={s.icon} size={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{s.t}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>{s.d}</div>
                </div>
                <NNBtn size="sm" variant="soft">
                  {s.cta}
                </NNBtn>
              </div>
            ))}
          </div>
        </NNCard>
      </div>
    </div>
  );
};
