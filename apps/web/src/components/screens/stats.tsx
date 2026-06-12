'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { State } from 'ts-fsrs';
import { format, startOfDay, subDays } from 'date-fns';
import { NNCard, NNIcon, NNSkeleton } from '@/components/ui';
import { useNN } from '@/lib/store';
import { api, ok } from '@/lib/api';
import { reviewFromApi } from '@/lib/mappers';
import type { DeckColor, Review } from '@/lib/types';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';

// Server payloads of the /stats endpoints (see apps/api/src/modules/stats.ts).
// Forecast buckets are SPARSE (only non-empty days) — the chart zero-fills.
interface ForecastData {
  days: number;
  overdueCount: number;
  total: number;
  buckets: { day: string; count: number }[];
}
interface IntervalRetentionData {
  days: number;
  buckets: { bucket: string; count: number; retentionPct: number | null }[];
}

const FORECAST_DAYS = 30;
/** Hide interval buckets with fewer data points than this (too noisy to plot). */
const MIN_BUCKET_N = 5;

// ─────────────────────────────────────────────
// STATS / ANALYTICS
// ─────────────────────────────────────────────
export const NNStats = () => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const isDesktop = bp === 'desktop';
  const bootstrapped = useNN((s) => s.bootstrapped);
  const cards = useNN((s) => s.cards);
  const decks = useNN((s) => s.decks);
  const profile = useNN((s) => s.profile);

  const [reviews30, setReviews30] = useState<Review[]>([]);
  const [reviews7, setReviews7] = useState<Review[]>([]);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [intervalRetention, setIntervalRetention] = useState<IntervalRetentionData | null>(null);

  useEffect(() => {
    if (!bootstrapped) return;
    let cancelled = false;
    (async () => {
      const now = new Date();
      const since30 = subDays(now, 30).getTime();
      const since7 = subDays(now, 7).getTime();
      try {
        const [r30Raw, r7Raw, forecastRaw, retentionRaw] = await Promise.all([
          ok(await (api as any).reviews.get({ query: { since: String(since30) } })),
          ok(await (api as any).reviews.get({ query: { since: String(since7) } })),
          ok(await (api as any).stats.forecast.get({ query: { days: String(FORECAST_DAYS) } })),
          ok(await (api as any).stats.retention.get({ query: {} })),
        ]);
        if (cancelled) return;
        setReviews30((r30Raw as any[]).map(reviewFromApi));
        setReviews7((r7Raw as any[]).map(reviewFromApi));
        setForecast(forecastRaw as ForecastData);
        setIntervalRetention(retentionRaw as IntervalRetentionData);
      } catch {
        if (cancelled) return;
        setReviews30([]);
        setReviews7([]);
        setForecast(null);
        setIntervalRetention(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapped]);

  // simple sparkline
  const line = (vals: number[], w = 100, h = 30, color = 'var(--lime-400)') => {
    if (vals.length === 0) {
      return <svg width={w} height={h} />;
    }
    const max = Math.max(...vals),
      min = Math.min(...vals);
    const pts = vals
      .map((v, i) => `${(i / Math.max(1, vals.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`)
      .join(' ');
    return (
      <svg width={w} height={h}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
    );
  };

  // Reviewed count last 30 days.
  const reviewedCount30 = reviews30.length;

  // Retention last 30d — rating >= 3 / total.
  const retentionPct = useMemo(() => {
    if (reviews30.length === 0) return null;
    const good = reviews30.filter((r) => r.rating >= 3).length;
    return Math.round((good / reviews30.length) * 100);
  }, [reviews30]);

  // Avg grade.
  const avgGrade = useMemo(() => {
    if (reviews30.length === 0) return null;
    const sum = reviews30.reduce((s, r) => s + r.rating, 0);
    return sum / reviews30.length;
  }, [reviews30]);

  // Time this week (from reviews7 durationMs).
  const minutesThisWeek = useMemo(() => {
    const ms = reviews7.reduce((s, r) => s + (r.durationMs || 0), 0);
    return Math.floor(ms / 60000);
  }, [reviews7]);

  const weekTimeLabel = useMemo(() => {
    const h = Math.floor(minutesThisWeek / 60);
    const m = minutesThisWeek % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }, [minutesThisWeek]);

  const avgDaily = Math.round(minutesThisWeek / 7);

  // Per-day buckets for last 30 days.
  const dailyBuckets = useMemo(() => {
    const now = new Date();
    const days: { date: Date; total: number; good: number; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = startOfDay(subDays(now, i));
      days.push({ date: d, total: 0, good: 0, count: 0 });
    }
    const firstMs = days[0].date.getTime();
    for (const r of reviews30) {
      const idx = Math.floor((startOfDay(new Date(r.reviewedAt)).getTime() - firstMs) / 86400000);
      if (idx >= 0 && idx < days.length) {
        days[idx].total++;
        days[idx].count++;
        if (r.rating >= 3) days[idx].good++;
      }
    }
    return days;
  }, [reviews30]);

  // Retention curve points (percentage per day, 0 where no data).
  const retentionCurve = useMemo(() => {
    const W = 600;
    const H = 160;
    const pad = { top: 20, bottom: 30 };
    const chartH = H - pad.top - pad.bottom;
    if (dailyBuckets.length === 0) return { path: '', area: '', fillLabels: [] as string[] };
    const pts = dailyBuckets.map((b, i) => {
      const x = (i / Math.max(1, dailyBuckets.length - 1)) * W;
      const pct = b.total > 0 ? b.good / b.total : 0;
      const y = pad.top + (1 - pct) * chartH;
      return { x, y, pct, date: b.date };
    });
    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const area = `${path} L ${W} ${H} L 0 ${H} Z`;
    const labelIdxs = [0, 7, 14, 21, 29];
    const fillLabels = labelIdxs
      .filter((i) => i < dailyBuckets.length)
      .map((i) => format(dailyBuckets[i].date, 'MMM d'));
    return { path, area, fillLabels };
  }, [dailyBuckets]);

  // Grade distribution.
  const gradeDist = useMemo(() => {
    const counts = [0, 0, 0, 0]; // index 0=Again(1),1=Hard(2),2=Good(3),3=Easy(4)
    for (const r of reviews30) counts[r.rating - 1]++;
    const total = reviews30.length || 1;
    return [
      { l: t('stats.grades.again'), n: counts[0], total, c: 'rose' as const },
      { l: t('stats.grades.hard'), n: counts[1], total, c: 'amber' as const },
      { l: t('stats.grades.good'), n: counts[2], total, c: 'lime' as const },
      { l: t('stats.grades.easy'), n: counts[3], total, c: 'sky' as const },
    ];
  }, [reviews30, t]);

  // Per-deck breakdown.
  const perDeck = useMemo(() => {
    const reviewsByDeck = new Map<string, Review[]>();
    for (const r of reviews30) {
      const arr = reviewsByDeck.get(r.deckId) ?? [];
      arr.push(r);
      reviewsByDeck.set(r.deckId, arr);
    }
    return decks.map((d) => {
      const deckCards = cards.filter((c) => c.deckId === d.id);
      const matureCards = deckCards.filter((c) => (c.fsrs.state as unknown as State) === State.Review).length;
      const deckReviews = reviewsByDeck.get(d.id) ?? [];
      const ret =
        deckReviews.length > 0
          ? Math.round((deckReviews.filter((r) => r.rating >= 3).length / deckReviews.length) * 100)
          : 0;
      const avgDiff =
        deckCards.length > 0
          ? deckCards.reduce((s, c) => s + (c.fsrs.difficulty || 0), 0) / deckCards.length
          : 0;
      const minutes = Math.floor(deckReviews.reduce((s, r) => s + (r.durationMs || 0), 0) / 60000);
      return {
        id: d.id,
        name: d.name,
        cards: deckCards.length,
        mature: matureCards,
        ret,
        ease: avgDiff ? (10 - avgDiff) / 2.5 : 0, // approximation: FSRS difficulty 0–10 mapped to Anki-style ease; a dedicated ease column is not stored
        time: `${minutes}m`,
        c: d.color as DeckColor,
      };
    });
  }, [decks, cards, reviews30]);

  // Hour-of-day heatmap — bucket by hour across all reviews (30d).
  const hourBuckets = useMemo(() => {
    const buckets = new Array(24).fill(0);
    for (const r of reviews30) buckets[new Date(r.reviewedAt).getHours()]++;
    const max = Math.max(1, ...buckets);
    return { counts: buckets as number[], max };
  }, [reviews30]);

  // Peak hour label.
  const peakHour = useMemo(() => {
    const c = hourBuckets.counts;
    if (!c.some((v) => v > 0)) return null;
    const idx = c.indexOf(Math.max(...c));
    const fmt = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;
    return `${fmt(idx)}–${fmt((idx + 2) % 24)}`;
  }, [hourBuckets]);

  // Peak retention at peak hour.
  const peakRetention = useMemo(() => {
    if (!peakHour) return null;
    const c = hourBuckets.counts;
    const idx = c.indexOf(Math.max(...c));
    const atHour = reviews30.filter((r) => new Date(r.reviewedAt).getHours() === idx);
    if (atHour.length === 0) return null;
    return Math.round((atHour.filter((r) => r.rating >= 3).length / atHour.length) * 100);
  }, [peakHour, hourBuckets, reviews30]);

  // Due-forecast bars: zero-fill the full window — the server only returns
  // non-empty days, and the buckets are UTC `yyyy-mm-dd` strings (date_trunc in
  // Postgres), so the axis is generated in UTC too to line up exactly.
  const forecastBars = useMemo(() => {
    if (!forecast) return [];
    const byDay = new Map(forecast.buckets.map((b) => [b.day, b.count]));
    const out: { day: string; count: number }[] = [];
    const startMs = Date.now();
    for (let i = 0; i < forecast.days; i++) {
      const day = new Date(startMs + i * 86400000).toISOString().slice(0, 10);
      out.push({ day, count: byDay.get(day) ?? 0 });
    }
    return out;
  }, [forecast]);
  const forecastMax = useMemo(
    () => Math.max(1, ...forecastBars.map((b) => b.count)),
    [forecastBars],
  );

  // Interval-retention buckets with enough data to be meaningful.
  const retentionBars = useMemo(
    () => (intervalRetention?.buckets ?? []).filter((b) => b.count >= MIN_BUCKET_N),
    [intervalRetention],
  );

  // Sparkline trend arrays from dailyBuckets for KPI row.
  const trends = useMemo(() => {
    const last7 = dailyBuckets.slice(-7);
    const retentionTrend = last7.map((b) => (b.total > 0 ? Math.round((b.good / b.total) * 100) : 0));
    const reviewedTrend = last7.map((b) => b.total);
    return { retentionTrend, reviewedTrend };
  }, [dailyBuckets]);

  const kpis = [
    {
      l: t('stats.kpis.retention'),
      v: retentionPct != null ? `${retentionPct}%` : '—',
      sub: t('stats.kpis.retentionSub'),
      c: 'lime' as const,
      trend: trends.retentionTrend.length ? trends.retentionTrend : [0, 0, 0, 0, 0, 0, 0],
    },
    {
      l: t('stats.kpis.reviewed'),
      v: reviewedCount30.toLocaleString(),
      sub: t('stats.kpis.reviewedSub', { n: Math.round(reviewedCount30 / 30) }),
      c: 'lime' as const,
      trend: trends.reviewedTrend.length ? trends.reviewedTrend : [0, 0, 0, 0, 0, 0, 0],
    },
    {
      l: t('stats.kpis.avgGrade'),
      v: avgGrade != null ? avgGrade.toFixed(2) : '—',
      sub: avgGrade != null ? (avgGrade >= 3 ? t('stats.kpis.avgGradeGood') : t('stats.kpis.avgGradeNeeds')) : t('stats.kpis.noData'),
      c: 'sky' as const,
      // crude trend: avg grade per day last 7 days
      trend: dailyBuckets.slice(-7).map((b) => (b.total ? b.good / b.total + 2 : 2)),
    },
    {
      l: t('stats.kpis.totalXp'),
      v: (profile?.xp ?? 0).toLocaleString(),
      sub: t('stats.kpis.levelLabel', { n: profile?.level ?? 1 }),
      c: 'amber' as const,
      trend: trends.reviewedTrend.length ? trends.reviewedTrend : [0, 0, 0, 0, 0, 0, 0],
    },
  ];

  if (!bootstrapped) return <StatsSkeleton isMobile={isMobile} />;

  return (
    <div className="nn-scroll" style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px 14px' : 24 }}>
      {/* Streak strip — the gamification entry point now that the sidebar has none. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          borderRadius: 12,
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--amber-500) 10%, transparent), color-mix(in srgb, var(--amber-400) 4%, transparent))',
          border: '1px solid color-mix(in srgb, var(--amber-400) 18%, transparent)',
          marginBottom: isMobile ? 12 : 16,
          flexWrap: 'wrap',
        }}
      >
        <NNIcon name="flame" size={18} color="var(--amber-500)" />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          {t('stats.streak.days', { days: profile?.streakDays ?? 0 })}
        </span>
        {(profile?.streakFreezes ?? 0) > 0 && (
          <span style={{ fontSize: 12, color: 'var(--sky-400)' }}>🛡 × {profile?.streakFreezes}</span>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {t('stats.streak.level', { n: profile?.level ?? 1 })}
        </span>
        <div style={{ flex: 1 }} />
        <Link
          href="/garden"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontSize: 12,
            fontWeight: 500,
            textDecoration: 'none',
            background: 'var(--surface)',
          }}
        >
          <NNIcon name="garden" size={14} />
          {t('stats.streak.openGarden')}
        </Link>
      </div>

      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 12, marginBottom: isMobile ? 12 : 16 }}>
        {kpis.map((s) => (
          <NNCard key={s.l} padding={16}>
            <div className="nn-section-label" style={{ marginBottom: 0 }}>{s.l}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
              <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--text)' }} className="mono">{s.v}</div>
              <div style={{ flex: 1 }} />
              {line(s.trend, 80, 30, `var(--${s.c}-400)`)}
            </div>
            <div style={{ fontSize: 11, color: `var(--${s.c}-400)`, marginTop: 4 }}>{s.sub}</div>
          </NNCard>
        ))}
      </div>

      {/* Retention curve + distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: isMobile ? 10 : 12, marginBottom: isMobile ? 12 : 16 }}>
        <NNCard padding={20}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t('stats.retentionOverTime')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                {t('stats.target')} <span className="mono" style={{ color: 'var(--lime-400)' }}>90%</span> · {t('stats.actual')}{' '}
                <span className="mono" style={{ color: 'var(--lime-400)' }}>
                  {retentionPct != null ? `${retentionPct}%` : '—'}
                </span>
              </div>
            </div>
            <div style={{ flex: 1 }} />
          </div>
          {/* chart */}
          <svg viewBox="0 0 600 200" style={{ width: '100%', height: 200 }}>
            {/* grid */}
            {[0, 1, 2, 3, 4].map((i) => (
              <line key={i} x1="0" y1={i * 40 + 20} x2="600" y2={i * 40 + 20} stroke="var(--border)" strokeWidth="0.5" />
            ))}
            {/* target line (90% → y = 20 + 10% of 120 = 32) */}
            <line x1="0" y1="32" x2="600" y2="32" stroke="var(--lime-600)" strokeDasharray="4 4" strokeWidth="1" />
            <text x="595" y="28" fontSize="10" fill="var(--lime-400)" textAnchor="end" fontFamily="var(--font-mono)">{t('stats.targetLegend')}</text>
            {/* data */}
            {retentionCurve.path && (
              <>
                <path d={retentionCurve.path} fill="none" stroke="var(--lime-500)" strokeWidth="2.5" />
                <path d={retentionCurve.area} fill="url(#areaG)" opacity="0.3" />
              </>
            )}
            <defs>
              <linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#9ad155" />
                <stop offset="1" stopColor="#9ad155" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* labels */}
            {retentionCurve.fillLabels.map((t, i) => (
              <text
                key={t + i}
                x={i * 150 + 10}
                y="195"
                fontSize="10"
                fill="var(--text-dim)"
                fontFamily="var(--font-mono)"
              >
                {t}
              </text>
            ))}
          </svg>
        </NNCard>

        <NNCard padding={20}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>{t('stats.gradeDist')}</div>
          {gradeDist.map((g) => (
            <div key={g.l} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--text)', flex: 1 }}>{g.l}</span>
                <span className="mono" style={{ color: `var(--${g.c}-400)` }}>
                  {g.total ? Math.round((g.n / g.total) * 100) : 0}%
                </span>
                <span style={{ width: 48, textAlign: 'right', color: 'var(--text-dim)' }} className="mono">
                  {g.n}
                </span>
              </div>
              <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${g.total ? (g.n / g.total) * 100 : 0}%`,
                    height: '100%',
                    background: `var(--${g.c}-500)`,
                  }}
                />
              </div>
            </div>
          ))}
        </NNCard>
      </div>

      {/* Due forecast + retention by interval */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: isMobile ? 10 : 12, marginBottom: isMobile ? 12 : 16 }}>
        <NNCard padding={20}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t('stats.forecast.title')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                {t('stats.forecast.subtitle', { days: forecast?.days ?? FORECAST_DAYS })} ·{' '}
                <span className="mono" style={{ color: 'var(--lime-400)' }}>
                  {t('stats.forecast.total', { n: forecast?.total ?? 0 })}
                </span>
              </div>
            </div>
            <div style={{ flex: 1 }} />
            {forecast != null && forecast.overdueCount > 0 && (
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  color: 'var(--rose-400)',
                  border: '1px solid var(--rose-500)',
                  borderRadius: 999,
                  padding: '3px 10px',
                }}
              >
                {t('stats.forecast.overdue', { n: forecast.overdueCount })}
              </span>
            )}
          </div>
          {forecast == null || forecast.total === 0 ? (
            <div className="nn-empty-state" style={{ paddingTop: 24, paddingBottom: 24 }}>
              <span className="nn-empty-state-icon"><NNIcon name="clock" size={24} color="var(--text-dim)" /></span>
              <p className="nn-empty-state-hint">{t('stats.forecast.empty')}</p>
            </div>
          ) : (
            <svg viewBox="0 0 600 200" style={{ width: '100%', height: 200 }}>
              {[0, 1, 2, 3].map((i) => (
                <line key={i} x1="0" y1={i * 50 + 15} x2="600" y2={i * 50 + 15} stroke="var(--border)" strokeWidth="0.5" />
              ))}
              {forecastBars.map((b, i) => {
                const slot = 600 / forecastBars.length;
                const barW = Math.max(4, slot - 4);
                const h = (b.count / forecastMax) * 150;
                return (
                  <rect
                    key={b.day}
                    x={i * slot + (slot - barW) / 2}
                    y={165 - h}
                    width={barW}
                    height={Math.max(b.count > 0 ? 2 : 0, h)}
                    rx={2}
                    fill={i === 0 ? 'var(--lime-400)' : 'var(--lime-600)'}
                  >
                    <title>{`${b.day}: ${b.count}`}</title>
                  </rect>
                );
              })}
              {forecastBars.map((b, i) =>
                i % 7 === 0 ? (
                  <text
                    key={`l-${b.day}`}
                    x={i * (600 / forecastBars.length) + 2}
                    y="195"
                    fontSize="10"
                    fill="var(--text-dim)"
                    fontFamily="var(--font-mono)"
                  >
                    {b.day.slice(5)}
                  </text>
                ) : null,
              )}
            </svg>
          )}
        </NNCard>

        <NNCard padding={20}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{t('stats.intervalRetention.title')}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-dim)', margin: '2px 0 14px' }}>
            {t('stats.intervalRetention.subtitle')}
          </div>
          {retentionBars.length === 0 ? (
            <div className="nn-empty-state" style={{ paddingTop: 16, paddingBottom: 16 }}>
              <span className="nn-empty-state-icon"><NNIcon name="target" size={24} color="var(--text-dim)" /></span>
              <p className="nn-empty-state-hint">{t('stats.intervalRetention.notEnough')}</p>
            </div>
          ) : (
            retentionBars.map((b) => {
              const pct = b.retentionPct ?? 0;
              const color = pct > 80 ? 'lime' : pct > 50 ? 'amber' : 'rose';
              return (
                <div key={b.bucket} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', fontSize: 12, marginBottom: 4 }}>
                    <span className="mono" style={{ color: 'var(--text)', flex: 1 }}>{b.bucket}</span>
                    <span className="mono" style={{ color: `var(--${color}-400)` }}>{pct}%</span>
                    <span style={{ width: 52, textAlign: 'right', color: 'var(--text-dim)' }} className="mono">
                      {t('stats.intervalRetention.bucketCount', { n: b.count })}
                    </span>
                  </div>
                  <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: `var(--${color}-500)` }} />
                  </div>
                </div>
              );
            })
          )}
        </NNCard>
      </div>

      {/* Per-deck breakdown */}
      <NNCard padding={0}>
        <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{t('stats.perDeck')}</div>
        </div>
        <div>
          {perDeck.length === 0 ? (
            <div className="nn-empty-state" style={{ paddingTop: 24, paddingBottom: 24 }}>
              <span className="nn-empty-state-icon"><NNIcon name="stack" size={24} color="var(--text-dim)" /></span>
              <p className="nn-empty-state-hint">{t('stats.noDecks')}</p>
            </div>
          ) : (
            perDeck.map((d, i) => (
              <div
                key={d.id}
                style={{
                  padding: isMobile ? '12px 14px' : '12px 20px',
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 80px 120px 80px 80px',
                  gap: isMobile ? 8 : 20,
                  alignItems: 'center',
                  borderTop: i ? '1px solid var(--border)' : 'none',
                  fontSize: 12.5,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 6, height: 24, borderRadius: 2, background: `var(--${d.c}-500)` }} />
                  <span style={{ color: 'var(--text)', fontWeight: 500 }}>{d.name}</span>
                </div>
                <span className="mono" style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{t('stats.cards', { n: d.cards })}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 5, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${d.ret}%`,
                        height: '100%',
                        background:
                          d.ret > 80 ? 'var(--lime-500)' : d.ret > 50 ? 'var(--amber-500)' : 'var(--rose-500)',
                      }}
                    />
                  </div>
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: d.ret > 80 ? 'var(--lime-400)' : d.ret > 50 ? 'var(--amber-400)' : 'var(--rose-400)',
                      width: 30,
                      textAlign: 'right',
                    }}
                  >
                    {d.ret}%
                  </span>
                </div>
                <span className="mono" style={{ color: 'var(--text-muted)', textAlign: 'right' }}>
                  {t('stats.easeLabel', { v: d.ease.toFixed(1) })}
                </span>
                <span className="mono" style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{d.time}</span>
              </div>
            ))
          )}
        </div>
      </NNCard>

      {/* Hour heatmap */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: isMobile ? 10 : 12, marginTop: isMobile ? 12 : 16 }}>
        <NNCard padding={20}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t('stats.bestTime')}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginBottom: 14 }}>{t('stats.bestTimeSub')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 2 }}>
            {hourBuckets.counts.map((v, h) => {
              const intensity = v / hourBuckets.max;
              return (
                <div
                  key={h}
                  style={{
                    height: 32,
                    background: `color-mix(in srgb, var(--lime-400) ${Math.round((0.1 + intensity * 0.7) * 100)}%, transparent)`,
                    borderRadius: 2,
                  }}
                />
              );
            })}
          </div>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--text-dim)' }}
            className="mono"
          >
            <span>0h</span>
            <span>6h</span>
            <span>12h</span>
            <span>18h</span>
            <span>24h</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
            {t('stats.peak')}{' '}
            <span style={{ color: 'var(--lime-400)' }} className="mono">
              {peakHour ?? '—'}
            </span>{' '}
            · {t('stats.retentionInline')}{' '}
            <span className="mono" style={{ color: 'var(--text)' }}>
              {peakRetention != null ? `${peakRetention}%` : '—'}
            </span>
          </div>
        </NNCard>
      </div>

      {minutesThisWeek > 0 && (
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-dim)' }} className="mono">
          {t('stats.weekLine', { time: weekTimeLabel, avg: avgDaily })}
        </div>
      )}
    </div>
  );
};

// Layout-matching skeleton shown until the store is bootstrapped — replaces the
// old opacity dimmer (P2.4), mirroring the home.tsx pattern.
function StatsSkeleton({ isMobile }: { isMobile: boolean }) {
  const panel = (children: React.ReactNode): React.ReactNode => (
    <div style={{ padding: 20, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {children}
    </div>
  );
  return (
    <div className="nn-scroll" style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px 14px' : 24 }}>
      {/* streak strip */}
      <NNSkeleton width="100%" height={44} radius={12} style={{ marginBottom: isMobile ? 12 : 16 }} />
      {/* KPI grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)',
          gap: isMobile ? 10 : 12,
          marginBottom: isMobile ? 12 : 16,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ padding: 16, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <NNSkeleton width={80} height={10} />
            <NNSkeleton width={100} height={28} style={{ marginTop: 8 }} />
            <NNSkeleton width={60} height={10} style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>
      {/* two 2fr/1fr panel rows */}
      {Array.from({ length: 2 }).map((_, row) => (
        <div
          key={row}
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr',
            gap: isMobile ? 10 : 12,
            marginBottom: isMobile ? 12 : 16,
          }}
        >
          {panel(
            <>
              <NNSkeleton width={160} height={14} />
              <NNSkeleton width="100%" height={200} radius={10} style={{ marginTop: 16 }} />
            </>,
          )}
          {panel(
            <>
              <NNSkeleton width={120} height={14} />
              {Array.from({ length: 4 }).map((_, i) => (
                <NNSkeleton key={i} width="100%" height={12} style={{ marginTop: 14 }} />
              ))}
            </>,
          )}
        </div>
      ))}
      {/* full-width card */}
      {panel(
        <>
          <NNSkeleton width={140} height={14} />
          <NNSkeleton width="100%" height={120} radius={10} style={{ marginTop: 16 }} />
        </>,
      )}
    </div>
  );
}
