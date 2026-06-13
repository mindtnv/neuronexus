'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { State } from 'ts-fsrs';
import { addDays, format, isSameDay, startOfDay, startOfMonth, subDays } from 'date-fns';
import { NNBadge, NNBtn, NNCard, NNIcon, NNPlant, NNSkeleton } from '@/components/ui';
import { countDueCards } from '@/lib/cards';
import { useNN } from '@/lib/store';
import { api, ok } from '@/lib/api';
import { reviewFromApi } from '@/lib/mappers';
import type { LibraryItem, Notebook, Review } from '@/lib/types';
import { sourceKindToneVar } from '@/lib/source-kind';
import { useEmptyRedirect } from '@/lib/use-empty-redirect';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT, useDateLocale } from '@/lib/i18n';

export const NNHome = () => {
  const t = useT();
  const router = useRouter();
  const dateLocale = useDateLocale();
  useEmptyRedirect('first-run');
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const bootstrapped = useNN((s) => s.bootstrapped);
  const cards = useNN((s) => s.cards);
  const profile = useNN((s) => s.profile);
  const listLibrary = useNN((s) => s.listLibrary);
  const listNotebooks = useNN((s) => s.listNotebooks);

  const [recentReviews, setRecentReviews] = useState<Review[]>([]);
  const [monthReviews, setMonthReviews] = useState<Review[]>([]);
  const [lastReviewAt, setLastReviewAt] = useState<number | null>(null);

  // ── Knowledge domains (P3.1) — lazy, post-bootstrap, graceful-hide on empty ──
  const [reading, setReading] = useState<LibraryItem[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [chatEnabled, setChatEnabled] = useState(false);

  useEffect(() => {
    if (!bootstrapped) return;
    let cancelled = false;
    (async () => {
      const now = new Date();
      const since30 = subDays(now, 30).getTime();
      const sinceMonth = startOfMonth(now).getTime();
      try {
        // Both lists are server-ordered (reviewedAt desc).
        const [recentRaw, monthlyRaw] = await Promise.all([
          ok(await (api as any).reviews.get({ query: { since: String(since30) } })),
          ok(await (api as any).reviews.get({ query: { since: String(sinceMonth) } })),
        ]);
        if (cancelled) return;
        const recent = (recentRaw as any[]).map(reviewFromApi);
        const monthly = (monthlyRaw as any[]).map(reviewFromApi);
        setRecentReviews(recent);
        setMonthReviews(monthly);
        setLastReviewAt(recent[0]?.reviewedAt ?? null);
      } catch {
        if (cancelled) return;
        setRecentReviews([]);
        setMonthReviews([]);
        setLastReviewAt(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapped]);

  // Knowledge domains — lazy after bootstrap, in parallel. Each branch degrades
  // independently: a failed/empty fetch just leaves its section hidden. The AI
  // tile gates on /ai/status.chatEnabled (same source the chat screen reads).
  useEffect(() => {
    if (!bootstrapped) return;
    let cancelled = false;
    void (async () => {
      const [readingRes, nbRes, statusRes] = await Promise.all([
        listLibrary({ reading: 'reading', sort: 'lastRead', limit: 3 }).catch(() => null),
        listNotebooks().catch(() => null),
        (async () => {
          try {
            return (await ok(await (api as any).ai.status.get())) as { chatEnabled?: boolean };
          } catch {
            return null;
          }
        })(),
      ]);
      if (cancelled) return;
      setReading(readingRes?.items ?? []);
      setNotebooks(nbRes ?? []);
      setChatEnabled(Boolean(statusRes?.chatEnabled));
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapped, listLibrary, listNotebooks]);

  const now = useMemo(() => new Date(), []);

  const dueCount = useMemo(
    () => countDueCards(cards, now),
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

  // Today's reviewed minutes — sums durationMs across today's reviews (fallback
  // to the server ledger below, which is authoritative once it rolls up).
  const todayReviewedMinutes = useMemo(() => {
    const today = startOfDay(now).getTime();
    const msToday = recentReviews
      .filter((r) => r.reviewedAt >= today)
      .reduce((sum, r) => sum + (r.durationMs || 0), 0);
    return Math.floor(msToday / 60000);
  }, [recentReviews, now]);

  const dailyGoalMinutes = profile?.dailyGoalMinutes ?? 30;

  // Prefer the server-authoritative ledger; fall back to summing today's
  // reviews if the server hasn't rolled up yet (e.g., during first bootstrap).
  const todayMinutesServer = (() => {
    if (!profile) return todayReviewedMinutes;
    const todayIso = format(now, 'yyyy-MM-dd');
    return profile.todayMinutesDate === todayIso ? profile.todayMinutes : 0;
  })();
  const todayMinutes = todayMinutesServer || todayReviewedMinutes;
  const goalPct = Math.min(100, Math.round((todayMinutes / Math.max(1, dailyGoalMinutes)) * 100));
  const streakFreezes = profile?.streakFreezes ?? 0;

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
  }, [cards, dateLocale, now, t]);

  const forecastMax = Math.max(80, ...forecast.map((b) => b.n));

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

  // While the initial snapshot is loading we swap the whole page for a real
  // skeleton layout — shape matches the post-bootstrap grid so there's no
  // jarring reflow when data arrives.
  if (!bootstrapped) {
    return <HomeSkeleton isMobile={isMobile} />;
  }

  return (
    <div className="nn-scroll" style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px 14px 80px' : '24px 32px 80px' }}>
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
              background: 'radial-gradient(circle, var(--tone-lime-bg-strong), transparent 70%)',
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
            <NNBtn size="lg" variant="outline" icon="plus" onClick={() => router.push('/editor')}>{t('home.addCard')}</NNBtn>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
              {t('home.streakBadge', { n: profile?.level ?? 1 })}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {streakFreezes > 0 && (
                <span
                  title={`${streakFreezes} streak freeze available`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '3px 8px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 500,
                    background: 'var(--tone-sky-bg)',
                    color: 'var(--sky-400)',
                    border: '1px solid var(--tone-sky-border)',
                  }}
                >
                  🛡 × {streakFreezes}
                </span>
              )}
              <NNBadge tone="amber" size="sm" icon="flame">
                {t('home.streakDays', { days: profile?.streakDays ?? 0 })}
              </NNBadge>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '4px 0' }}>
            <button
              type="button"
              onClick={() => router.push('/garden')}
              title={t('home.openGarden')}
              aria-label={t('home.openGarden')}
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }}
            >
              <NNPlant stage={profile?.plantStage ?? 0} size={80} species={profile?.plantSpecies} />
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 3 }}>{t('home.dailyGoal')}</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', letterSpacing: -0.5 }}>
                <span className="mono">{todayMinutes}</span>
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
      </div>

      {(reading.length > 0 || notebooks.length > 0 || chatEnabled) && (
        <HomeKnowledge
          reading={reading}
          notebooks={notebooks}
          chatEnabled={chatEnabled}
          isMobile={isMobile}
          onOpen={(href) => router.push(href)}
          t={t}
        />
      )}
    </div>
  );
};

// ── Knowledge domains block (P3.1) ───────────────────────────────────────────
// Reuses the notebooks visual language (.nn-section-label eyebrows, tone tiles,
// letter-tile covers) — no new CSS. Only renders the sub-blocks that have data.
function HomeKnowledge({
  reading,
  notebooks,
  chatEnabled,
  isMobile,
  onOpen,
  t,
}: {
  reading: LibraryItem[];
  notebooks: Notebook[];
  chatEnabled: boolean;
  isMobile: boolean;
  onOpen: (href: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div style={{ marginTop: isMobile ? 14 : 24, display: 'grid', gap: isMobile ? 14 : 20 }}>
      {reading.length > 0 && (
        <section>
          <div className="nn-section-label">{t('home.knowledge.continueReading')}</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
              gap: isMobile ? 10 : 14,
            }}
          >
            {reading.slice(0, 3).map((item) => {
              const tone = sourceKindToneVar(item.kind);
              const letter = item.title.trim().charAt(0).toUpperCase() || '?';
              const pct = item.percent != null ? Math.round(item.percent * 100) : null;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpen(`/library/${item.id}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    borderRadius: 14,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 40,
                      height: 52,
                      flexShrink: 0,
                      borderRadius: 6,
                      overflow: 'hidden',
                      background: item.coverUrl
                        ? 'var(--surface-3)'
                        : `linear-gradient(135deg, color-mix(in srgb, ${tone} 30%, var(--surface-3)), var(--surface-3))`,
                      border: '1px solid var(--border)',
                    }}
                  >
                    {item.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: tone, lineHeight: 1 }}>
                        {letter}
                      </span>
                    )}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: 'var(--text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.title}
                    </span>
                    {pct != null && (
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-dim)', marginTop: 3 }}>
                        {t('home.knowledge.readPercent', { n: pct })}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {notebooks.length > 0 && (
        <section>
          <div className="nn-section-label">{t('home.knowledge.notebooks')}</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
              gap: isMobile ? 10 : 14,
            }}
          >
            {notebooks.slice(0, 3).map((nb) => (
              <button
                key={nb.id}
                type="button"
                onClick={() => onOpen(`/notebooks/${nb.id}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  borderRadius: 14,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                <span
                  className="nn-nb-tile"
                  style={{ background: 'color-mix(in srgb, var(--violet-400) 16%, var(--surface-2))', color: 'var(--violet-400)' }}
                  aria-hidden
                >
                  {nb.emoji || nb.title.trim().charAt(0).toUpperCase() || '?'}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {nb.title}
                  </span>
                  {nb.sourceCount != null && (
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-dim)', marginTop: 3 }}>
                      {t('home.knowledge.sourceCount', { n: nb.sourceCount })}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {chatEnabled && (
        <button
          type="button"
          onClick={() => onOpen('/chat')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: 16,
            borderRadius: 14,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'inherit',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              flexShrink: 0,
              borderRadius: 12,
              background: 'color-mix(in srgb, var(--violet-400) 16%, transparent)',
            }}
          >
            <NNIcon name="sparkle" size={19} color="var(--violet-400)" />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              {t('home.knowledge.askAi')}
            </span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
              {t('home.knowledge.askAiDesc')}
            </span>
          </span>
          <NNIcon name="chevr" size={16} color="var(--text-dim)" />
        </button>
      )}
    </div>
  );
}

function HomeSkeleton({ isMobile }: { isMobile: boolean }) {
  return (
    <div
      className="nn-scroll"
      style={{
        flex: 1,
        overflow: 'auto',
        padding: isMobile ? '16px 14px 80px' : '24px 32px 80px',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.6fr 1fr',
          gap: isMobile ? 10 : 16,
          marginBottom: isMobile ? 14 : 20,
        }}
      >
        {/* Hero card — today's queue */}
        <div
          style={{
            padding: isMobile ? 16 : 24,
            borderRadius: 16,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <NNSkeleton width={100} height={10} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 14 }}>
            <NNSkeleton width={isMobile ? 80 : 120} height={isMobile ? 44 : 72} radius={10} />
            <NNSkeleton width={100} height={14} />
          </div>
          <NNSkeleton width="70%" height={12} style={{ marginTop: 14 }} />
          <NNSkeleton width={isMobile ? '100%' : '55%'} height={6} style={{ marginTop: 18 }} />
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <NNSkeleton width={160} height={40} radius={10} />
            <NNSkeleton width={140} height={40} radius={10} />
          </div>
        </div>

        {/* Streak card */}
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
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <NNSkeleton width={130} height={12} />
            <NNSkeleton width={72} height={20} radius={999} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <NNSkeleton width={80} height={80} radius={12} />
            <div style={{ flex: 1 }}>
              <NNSkeleton width={80} height={10} />
              <NNSkeleton width={140} height={22} style={{ marginTop: 8 }} />
              <NNSkeleton width="100%" height={6} style={{ marginTop: 10 }} />
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
              gap: 8,
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
            }}
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <NNSkeleton width={40} height={16} />
                <NNSkeleton width={60} height={10} style={{ marginTop: 6 }} />
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
