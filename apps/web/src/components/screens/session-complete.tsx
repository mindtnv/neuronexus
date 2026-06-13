'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { addDays, isSameDay } from 'date-fns';
import { NNBadge, NNBtn, NNCard, NNIcon, NNPlant } from '@/components/ui';
import { useNN } from '@/lib/store';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';

interface LastSession {
  completedAt: number;
  deckName: string;
  cards: number;
  xpGained: number;
  durationMs: number;
  grades: { 1: number; 2: number; 3: number; 4: number };
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function readLastSession(): LastSession | null {
  try {
    const raw = window.localStorage.getItem('nn:lastSession');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastSession> & { grades?: unknown };
    if (
      typeof parsed.completedAt !== 'number' ||
      typeof parsed.deckName !== 'string' ||
      typeof parsed.cards !== 'number' ||
      typeof parsed.xpGained !== 'number' ||
      typeof parsed.durationMs !== 'number' ||
      typeof parsed.grades !== 'object' ||
      parsed.grades === null
    ) {
      return null;
    }
    const g = parsed.grades as Record<string, unknown>;
    const grades = {
      1: Number(g[1] ?? 0) || 0,
      2: Number(g[2] ?? 0) || 0,
      3: Number(g[3] ?? 0) || 0,
      4: Number(g[4] ?? 0) || 0,
    };
    return {
      completedAt: parsed.completedAt,
      deckName: parsed.deckName,
      cards: parsed.cards,
      xpGained: parsed.xpGained,
      durationMs: parsed.durationMs,
      grades,
    };
  } catch {
    return null;
  }
}

export const NNSessionComplete = () => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const profile = useNN((s) => s.profile);
  const cards = useNN((s) => s.cards);

  const [session, setSession] = useState<LastSession | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSession(readLastSession());
    setHydrated(true);
  }, []);

  const tomorrowDueCount = useMemo(() => {
    const tomorrow = addDays(new Date(), 1);
    return cards.filter((c) => isSameDay(new Date(c.fsrs.due), tomorrow)).length;
  }, [cards]);

  // Before hydration, render nothing visible that could mismatch.
  if (!hydrated) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          background:
            'radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--lime-400) 8%, transparent), transparent 60%)',
        }}
      />
    );
  }

  if (!session) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          padding: isMobile ? '0 14px 32px' : '0 32px 48px',
          textAlign: 'center',
          background:
            'radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--lime-400) 8%, transparent), transparent 60%)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: isMobile ? 32 : 40,
            color: 'var(--text)',
            letterSpacing: -1,
          }}
        >
          {t('session.empty.title')}
        </div>
        <div
          style={{
            fontSize: 14,
            color: 'var(--text-muted)',
            maxWidth: 460,
            lineHeight: 1.5,
          }}
        >
          {t('session.empty.subtitle')}
        </div>
        <Link href="/review" style={{ marginTop: 8 }}>
          <NNBtn size="lg" variant="primary" icon="bolt">
            {t('session.empty.startReview')}
          </NNBtn>
        </Link>
      </div>
    );
  }

  const totalCards = Math.max(1, session.cards);
  const retentionPct = Math.round(
    ((session.grades[3] + session.grades[4]) / totalCards) * 100,
  );
  const durationLabel = formatDuration(session.durationMs);
  const plantStage = profile?.plantStage ?? 0;
  const userName = profile?.name ?? t('session.defaultUserName');

  const kpis = [
    {
      l: t('session.kpi.cardsReviewed'),
      v: String(session.cards),
      sub: session.deckName,
      c: 'lime',
    },
    {
      l: t('session.kpi.retention'),
      v: `${retentionPct}%`,
      sub: t('session.kpi.retentionSub'),
      c: 'sky',
    },
    {
      l: t('session.kpi.duration'),
      v: durationLabel,
      sub: t('session.kpi.durationSub'),
      c: 'amber',
    },
    {
      l: t('session.kpi.xpEarned'),
      v: `+${session.xpGained}`,
      sub: t('session.kpi.xpSub', { total: profile?.xp ?? 0 }),
      c: 'violet',
    },
  ];

  const segments = [
    { n: session.grades[1], c: 'var(--rose-500)', label: t('session.ratings.again') },
    { n: session.grades[2], c: 'var(--amber-500)', label: t('session.ratings.hard') },
    { n: session.grades[3], c: 'var(--lime-500)', label: t('session.ratings.good') },
    { n: session.grades[4], c: 'var(--sky-500)', label: t('session.ratings.easy') },
  ];
  const segTotal = segments.reduce((s, x) => s + x.n, 0);

  const againCount = session.grades[1];
  const attentionBody = againCount > 0
    ? `${t('session.attention.bodyBase')} ${t('session.attention.someAgain', { n: againCount })}`
    : `${t('session.attention.bodyBase')} ${t('session.attention.noneAgain')}`;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        overflow: isMobile ? 'auto' : 'hidden',
        background:
          'radial-gradient(ellipse at 50% 0%, var(--tone-lime-bg), transparent 60%)',
      }}
    >
      {/* Main */}
      <div className="nn-scroll" style={{ flex: 1, overflow: isMobile ? 'visible' : 'auto', padding: isMobile ? '24px 14px' : '48px 64px' }}>
        <div
          style={{
            fontSize: 11,
            color: 'var(--lime-400)',
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          {t('session.complete')}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: isMobile ? 40 : 56,
            lineHeight: 1.05,
            letterSpacing: -1.5,
            marginBottom: 8,
          }}
        >
          {t('session.heading', { name: userName })}
        </div>
        <div style={{ fontSize: isMobile ? 14 : 16, color: 'var(--text-muted)', marginBottom: isMobile ? 24 : 36 }}>
          {t('session.intro.prefix')}{' '}
          <span style={{ color: 'var(--text)' }} className="mono">
            {t('session.intro.cardsCount', { n: session.cards })}
          </span>{' '}
          {t('session.intro.in')}{' '}
          <span style={{ color: 'var(--text)' }} className="mono">
            {durationLabel}
          </span>{' '}
          {t('session.intro.suffix')}
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 8 : 12, marginBottom: isMobile ? 20 : 28 }}>
          {kpis.map((k) => (
            <div
              key={k.l}
              style={{
                padding: isMobile ? 14 : 18,
                borderRadius: 12,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                }}
              >
                {k.l}
              </div>
              <div
                style={{
                  fontSize: isMobile ? 24 : 32,
                  fontWeight: 600,
                  color: `var(--${k.c}-400)`,
                  letterSpacing: -0.8,
                  marginTop: 4,
                }}
                className="mono"
              >
                {k.v}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {k.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Grade breakdown bar */}
        <NNCard padding={20} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t('session.breakdown.title')}</div>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('session.breakdown.cardsCount', { n: session.cards })}</div>
          </div>
          <div style={{ height: 14, borderRadius: 7, overflow: 'hidden', display: 'flex' }}>
            {segTotal === 0 ? (
              <div style={{ flex: 1, background: 'var(--surface-3)' }} />
            ) : (
              segments.map((s, i) => (
                <div
                  key={i}
                  style={{
                    flex: s.n,
                    background: s.c,
                    borderRight: i < 3 && s.n > 0 ? '2px solid var(--bg)' : 'none',
                  }}
                />
              ))
            )}
          </div>
          <div style={{ display: 'flex', marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            {segments.map((s, i) => (
              <div key={i} style={{ flex: 1 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    background: s.c,
                    borderRadius: 2,
                    marginRight: 6,
                    verticalAlign: 'middle',
                  }}
                />
                {s.label} ·{' '}
                <span className="mono" style={{ color: 'var(--text)' }}>
                  {s.n}
                </span>
              </div>
            ))}
          </div>
        </NNCard>

        {/* Struggled cards — no per-card data available from last-session blob yet */}
        <NNCard padding={20} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t('session.attention.title')}</div>
            {session.grades[1] > 0 && (
              <NNBadge tone="rose" size="sm" style={{ marginLeft: 10 }}>
                {t('session.attention.againBadge', { n: session.grades[1] })}
              </NNBadge>
            )}
            <div style={{ flex: 1 }} />
            <Link href="/review">
              <NNBtn size="sm" variant="soft">
                {t('session.attention.requeueAll')}
              </NNBtn>
            </Link>
          </div>
          <div
            style={{
              padding: '16px 14px',
              borderRadius: 10,
              background: 'var(--surface-2)',
              border: '1px dashed var(--border-2)',
              fontSize: 12.5,
              color: 'var(--text-dim)',
              lineHeight: 1.5,
            }}
          >
            {/* Per-card lapse details are not captured by the session store — attentionBody summarises by aggregate only. */}
            {attentionBody}
          </div>
        </NNCard>

        {/* Up next */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 8 : 12 }}>
          <NNCard padding={18}>
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
                letterSpacing: 0.6,
              }}
            >
              {t('session.tomorrow.title')}
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4 }} className="mono">
              {t('session.tomorrow.due', { n: tomorrowDueCount })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {t('session.tomorrow.eta', { min: Math.max(1, Math.round(tomorrowDueCount * 0.25)) })}
            </div>
          </NNCard>
          <NNCard padding={18}>
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
                letterSpacing: 0.6,
              }}
            >
              {t('session.newAvailable.title')}
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4 }} className="mono">
              {t('session.newAvailable.inQueue', { n: Math.max(0, cards.length - session.cards) })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {t('session.newAvailable.hint')}
            </div>
          </NNCard>
        </div>

        <div style={{ display: 'flex', gap: isMobile ? 7 : 10, marginTop: isMobile ? 22 : 32, flexWrap: 'wrap' }}>
          <Link href="/garden">
            <NNBtn size="lg" variant="soft" icon="garden">
              {t('session.actions.visitGarden')}
            </NNBtn>
          </Link>
          <Link href="/graph">
            <NNBtn size="lg" variant="soft" icon="graph">
              {t('session.actions.viewGraph')}
            </NNBtn>
          </Link>
          <div style={{ flex: 1 }} />
          <Link href="/">
            <NNBtn size="lg" variant="ghost">
              {t('session.actions.finish')}
            </NNBtn>
          </Link>
          <Link href="/review">
            <NNBtn size="lg" variant="primary" icon="bolt">
              {t('session.actions.learnNew', { n: Math.max(0, cards.length - session.cards) })}
            </NNBtn>
          </Link>
        </div>
      </div>

      {/* Right celebration panel */}
      <aside
        style={{
          width: isMobile ? '100%' : 340,
          borderLeft: isMobile ? 'none' : '1px solid var(--border)',
          borderTop: isMobile ? '1px solid var(--border)' : 'none',
          background: 'var(--surface)',
          padding: isMobile ? '24px 14px' : 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: 'var(--lime-400)',
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            fontWeight: 600,
          }}
        >
          {t('session.fern.grew')}
        </div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, marginTop: 4, marginBottom: 16 }}>
          {t('session.fern.stage', { n: plantStage })}
        </div>

        <div
          style={{
            width: 200,
            height: 220,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {/* glow */}
          <div
            style={{
              position: 'absolute',
              width: 200,
              height: 200,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, color-mix(in srgb, var(--lime-400) 30%, transparent), transparent 70%)',
              filter: 'blur(20px)',
            }}
          />
          <NNPlant stage={plantStage} size={160} />
        </div>

        <div
          style={{
            marginTop: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: 12,
            background: 'color-mix(in srgb, var(--amber-400) 6%, transparent)',
            borderRadius: 10,
            width: '100%',
            border: '1px solid color-mix(in srgb, var(--amber-400) 20%, transparent)',
          }}
        >
          <NNIcon name="flame" size={20} color="var(--amber-400)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--amber-400)', fontWeight: 600 }}>
              {t('session.streak.label', { days: profile?.streakDays ?? 0 })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {t('session.streak.next')}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};
