'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { State } from 'ts-fsrs';
import { format, startOfDay, subDays } from 'date-fns';
import { NNCard } from '@/components/ui';
import { useNN } from '@/lib/store';
import { api, ok } from '@/lib/api';
import { reviewFromApi } from '@/lib/mappers';
import type { DeckColor, Review } from '@/lib/types';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';

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

  useEffect(() => {
    if (!bootstrapped) return;
    let cancelled = false;
    (async () => {
      const now = new Date();
      const since30 = subDays(now, 30).getTime();
      const since7 = subDays(now, 7).getTime();
      try {
        const [r30Raw, r7Raw] = await Promise.all([
          ok(await (api as any).reviews.get({ query: { since: String(since30) } })),
          ok(await (api as any).reviews.get({ query: { since: String(since7) } })),
        ]);
        if (cancelled) return;
        setReviews30((r30Raw as any[]).map(reviewFromApi));
        setReviews7((r7Raw as any[]).map(reviewFromApi));
      } catch {
        if (cancelled) return;
        setReviews30([]);
        setReviews7([]);
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
        ease: avgDiff ? (10 - avgDiff) / 2.5 : 0, // rough proxy; TODO: real ease metric
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

  // Sparkline trend arrays from dailyBuckets for KPI row.
  const trends = useMemo(() => {
    const last7 = dailyBuckets.slice(-7);
    const retentionTrend = last7.map((b) => (b.total > 0 ? Math.round((b.good / b.total) * 100) : 0));
    const reviewedTrend = last7.map((b) => b.total);
    return { retentionTrend, reviewedTrend };
  }, [dailyBuckets]);

  const dimStyle = bootstrapped ? undefined : { opacity: 0.45 };

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

  return (
    <div className="nn-scroll" style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px 14px' : 24, ...dimStyle }}>
      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 12, marginBottom: isMobile ? 12 : 16 }}>
        {kpis.map((s) => (
          <NNCard key={s.l} padding={16}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{s.l}</div>
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

      {/* Per-deck breakdown */}
      <NNCard padding={0}>
        <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{t('stats.perDeck')}</div>
        </div>
        <div>
          {perDeck.length === 0 ? (
            <div style={{ padding: '24px 20px', fontSize: 12.5, color: 'var(--text-dim)' }}>{t('stats.noDecks')}</div>
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
                    background: `rgba(154,209,85,${0.1 + intensity * 0.7})`,
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
