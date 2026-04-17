'use client';

import React, { useEffect, useState } from 'react';
import { NNBadge, NNCard, NNIcon } from '@/components/ui';
import { useNN } from '@/lib/store';
import { db } from '@/lib/db';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';

type Tone = 'lime' | 'amber' | 'sky' | 'violet' | 'neutral';
type BadgeItem = {
  n: string;
  d: string;
  earned?: boolean;
  progress?: number;
  locked?: boolean;
  icon: string;
  tone: Tone;
  sub?: string;
};

export const NNAchievements = () => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const isDesktop = bp === 'desktop';
  const profile = useNN(s => s.profile);
  const cards = useNN(s => s.cards);

  const [reviewsCount, setReviewsCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void db.reviews.count().then(n => {
      if (!cancelled) setReviewsCount(n);
    });
    return () => { cancelled = true; };
  }, [cards.length, profile?.xp]);

  const streakDays = profile?.streakDays ?? 0;
  const level = profile?.level ?? 1;
  const cardsCount = cards.length;

  const pct = (n: number, target: number) => Math.max(0, Math.min(1, n / target));
  const fmt = (n: number, target: number) => `${Math.min(n, target)} / ${target}`;

  // ─── Derived badges from real store data ────────────────────────
  const streaksDerived: BadgeItem[] = [
    {
      n: t('achievements.streaks.weekRunner.n'), d: t('achievements.streaks.weekRunner.d'),
      icon: 'flame', tone: 'amber',
      earned: streakDays >= 7,
      progress: streakDays < 7 ? pct(streakDays, 7) : undefined,
      sub: streakDays < 7 ? fmt(streakDays, 7) : undefined,
    },
    {
      n: t('achievements.streaks.thirtySomething.n'), d: t('achievements.streaks.thirtySomething.d'),
      icon: 'flame', tone: 'amber',
      earned: streakDays >= 30,
      progress: streakDays < 30 ? pct(streakDays, 30) : undefined,
      sub: streakDays < 30 ? fmt(streakDays, 30) : undefined,
    },
  ];

  const masteryDerived: BadgeItem[] = [
    {
      n: t('achievements.mastery.hundredCards.n'), d: t('achievements.mastery.hundredCards.d'),
      icon: 'stack', tone: 'lime',
      earned: cardsCount >= 100,
      progress: cardsCount < 100 ? pct(cardsCount, 100) : undefined,
      sub: cardsCount < 100 ? fmt(cardsCount, 100) : undefined,
    },
    {
      n: t('achievements.mastery.fiveHundredCards.n'), d: t('achievements.mastery.fiveHundredCards.d'),
      icon: 'stack', tone: 'sky',
      earned: cardsCount >= 500,
      progress: cardsCount < 500 ? pct(cardsCount, 500) : undefined,
      sub: cardsCount < 500 ? fmt(cardsCount, 500) : undefined,
    },
    {
      n: t('achievements.mastery.firstReview.n'), d: t('achievements.mastery.firstReview.d'),
      icon: 'sparkle', tone: 'lime',
      earned: reviewsCount >= 1,
      progress: reviewsCount < 1 ? 0 : undefined,
      sub: reviewsCount < 1 ? '0 / 1' : undefined,
    },
    {
      n: t('achievements.mastery.hundredReviews.n'), d: t('achievements.mastery.hundredReviews.d'),
      icon: 'bolt', tone: 'violet',
      earned: reviewsCount >= 100,
      progress: reviewsCount < 100 ? pct(reviewsCount, 100) : undefined,
      sub: reviewsCount < 100 ? fmt(reviewsCount, 100) : undefined,
    },
    {
      n: t('achievements.mastery.level5.n'), d: t('achievements.mastery.level5.d'),
      icon: 'trophy', tone: 'amber',
      earned: level >= 5,
      progress: level < 5 ? pct(level, 5) : undefined,
      sub: level < 5 ? `${level} / 5` : undefined,
    },
  ];

  // TODO: replace these static badges with real derivations.
  const gardenStatic: BadgeItem[] = [
    { n: t('achievements.garden.greenThumb.n'), d: t('achievements.garden.greenThumb.d'), earned: true, icon: 'garden', tone: 'lime' },
    { n: t('achievements.garden.botanist.n'), d: t('achievements.garden.botanist.d'), progress: 0.67, icon: 'garden', tone: 'lime', sub: '4 / 6' },
    { n: t('achievements.garden.bonsaiMaster.n'), d: t('achievements.garden.bonsaiMaster.d'), earned: true, icon: 'stars', tone: 'lime' },
    { n: t('achievements.garden.forest.n'), d: t('achievements.garden.forest.d'), progress: 0.6, icon: 'stack', tone: 'lime', sub: '6 / 10' },
  ];

  const masteryStatic: BadgeItem[] = [
    { n: t('achievements.mastery.perfectionist.n'), d: t('achievements.mastery.perfectionist.d'), earned: true, icon: 'check', tone: 'lime' },
    { n: t('achievements.mastery.graphWeaver.n'), d: t('achievements.mastery.graphWeaver.d'), progress: 0.42, icon: 'graph', tone: 'violet' },
    { n: t('achievements.mastery.speedReader.n'), d: t('achievements.mastery.speedReader.d'), locked: true, icon: 'bolt', tone: 'neutral' },
  ];

  const timeStatic: BadgeItem[] = [
    { n: t('achievements.time.earlyBird.n'), d: t('achievements.time.earlyBird.d'), earned: true, icon: 'sparkle', tone: 'amber' },
    { n: t('achievements.time.nightOwl.n'), d: t('achievements.time.nightOwl.d'), earned: true, icon: 'sparkle', tone: 'violet' },
    { n: t('achievements.time.consistent.n'), d: t('achievements.time.consistent.d'), progress: 0.43, icon: 'clock', tone: 'sky' },
    { n: t('achievements.time.marathon.n'), d: t('achievements.time.marathon.d'), locked: true, icon: 'trophy', tone: 'neutral' },
  ];

  const badges: { g: string; items: BadgeItem[] }[] = [
    { g: t('achievements.groups.streaks'), items: streaksDerived },
    { g: t('achievements.groups.garden'), items: gardenStatic },
    { g: t('achievements.groups.mastery'), items: [...masteryDerived, ...masteryStatic] },
    { g: t('achievements.groups.time'), items: timeStatic },
  ];

  const allItems = badges.flatMap(g => g.items);
  const earned = allItems.filter(b => b.earned).length;
  const total = allItems.length;
  const earnedPct = total === 0 ? 0 : (earned / total) * 100;

  return (
    <div className="nn-scroll" style={{ flex: 1, overflow: 'auto', padding: isMobile ? 14 : 24 }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <NNCard padding={20}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{t('achievements.header.badgesEarned')}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1.2 }} className="mono">{earned}</div>
            <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>{t('achievements.header.of', { total })}</div>
            <div style={{ flex: 1 }}/>
            <NNBadge tone="amber" size="md" icon="trophy">{t('achievements.header.levelBadge', { level })}</NNBadge>
          </div>
          <div style={{ marginTop: 14, height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${earnedPct}%`, height: '100%', background: 'linear-gradient(90deg, var(--lime-500), var(--amber-500))' }}/>
          </div>
          <div style={{ marginTop: 6, display: 'flex', fontSize: 11, color: 'var(--text-dim)' }}>
            <span>{earned}/{total}</span>
            <div style={{ flex: 1 }}/>
            <span>{t('achievements.header.nextMilestone')}</span>
          </div>
        </NNCard>
        <NNCard padding={20}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{t('achievements.header.xp')}</div>
          <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: -0.8, marginTop: 4 }} className="mono">
            {(profile?.xp ?? 0).toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {t('achievements.header.xpSub', { streak: streakDays, reviews: reviewsCount })}
          </div>
          <div style={{ marginTop: 10, height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${(((profile?.xp ?? 0) % 500) / 500) * 100}%`, height: '100%', background: 'var(--violet-400)' }}/>
          </div>
        </NNCard>
        <NNCard padding={20}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{t('achievements.header.cards')}</div>
          <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: -0.8, marginTop: 4 }} className="mono">
            {cardsCount.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{profile ? t('achievements.header.cardsSubYour') : t('achievements.header.cardsSubNo')}</div>
        </NNCard>
      </div>

      {/* Badge groups */}
      {badges.map(g => (
        <div key={g.g} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>{g.g}</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 10 }}>
            {g.items.map(b => {
              const glowColors: Record<string, string> = { lime: '154,209,85', amber: '243,182,85', sky: '85,196,214', violet: '167,136,255', neutral: '100,100,110' };
              const rgb = glowColors[b.tone];
              return (
                <div key={b.n} style={{
                  padding: 18, borderRadius: 12, textAlign: 'center',
                  background: b.earned ? `rgba(${rgb},0.06)` : 'var(--surface)',
                  border: b.earned ? `1px solid rgba(${rgb},0.3)` : '1px solid var(--border)',
                  opacity: b.locked ? 0.4 : 1,
                  position: 'relative',
                }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%', margin: '0 auto 10px',
                    background: b.earned ? `radial-gradient(circle, rgba(${rgb},0.25), rgba(${rgb},0.05))` : 'var(--surface-2)',
                    border: b.earned ? `1.5px solid rgba(${rgb},0.5)` : '1.5px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative',
                  }}>
                    <NNIcon name={b.icon as 'flame'} size={24} color={b.earned ? `var(--${b.tone}-400)` : 'var(--text-dim)'} strokeWidth={1.8}/>
                    {b.earned && (
                      <div style={{ position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: '50%', background: 'var(--lime-500)', border: '2px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <NNIcon name="check" size={10} color="#0a0b0d" strokeWidth={3}/>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: b.earned ? 'var(--text)' : 'var(--text-muted)' }}>{b.n}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{b.d}</div>
                  {b.progress != null && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ height: 3, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${b.progress * 100}%`, height: '100%', background: `var(--${b.tone}-500)` }}/>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{b.sub || `${Math.round(b.progress * 100)}%`}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
