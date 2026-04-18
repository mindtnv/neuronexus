'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { NNBadge, NNCard, NNIcon } from '@/components/ui';
import { api, ok } from '@/lib/api';
import { useNN } from '@/lib/store';
import { useBreakpoint } from '@/lib/use-breakpoint';

// ─────────────────────────────────────────────
// Achievements — fully backed by GET /achievements.
// Server returns the full catalog per-user with {unlockedAt, progress, pct,
// reward, kind}. We group by kind and render locked/unlocked uniformly.
// ─────────────────────────────────────────────

type ApiAchievement = {
  code: string;
  title: string;
  description: string;
  kind: 'streak' | 'reviews' | 'decks' | 'level' | 'garden' | 'dailyGoalStreak';
  target: number;
  progress: number;
  pct: number;
  unlockedAt: string | null;
  reward: null | {
    streakFreezes?: number;
    species?: string[];
    xp?: number;
  };
};

const GROUP_META: Record<ApiAchievement['kind'], { title: string; icon: 'flame' | 'stack' | 'graph' | 'trophy' | 'garden' | 'target'; tone: 'amber' | 'lime' | 'sky' | 'violet' | 'rose' | 'neutral' }> = {
  streak: { title: 'Стрики', icon: 'flame', tone: 'amber' },
  reviews: { title: 'Повторы', icon: 'stack', tone: 'lime' },
  decks: { title: 'Коллекции', icon: 'graph', tone: 'sky' },
  level: { title: 'Уровни', icon: 'trophy', tone: 'violet' },
  garden: { title: 'Сад', icon: 'garden', tone: 'lime' },
  dailyGoalStreak: { title: 'Дневные цели', icon: 'target', tone: 'rose' },
};

const GROUP_ORDER: ApiAchievement['kind'][] = [
  'streak',
  'reviews',
  'dailyGoalStreak',
  'decks',
  'level',
  'garden',
];

export const NNAchievements = () => {
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const profile = useNN((s) => s.profile);

  const [items, setItems] = useState<ApiAchievement[] | null>(null);
  const [summary, setSummary] = useState<{ unlocked: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, sum] = await Promise.all([
          ok(await (api as any).achievements.get()),
          ok(await (api as any).achievements.summary.get()),
        ]);
        if (cancelled) return;
        setItems(list as ApiAchievement[]);
        setSummary(sum as { unlocked: number; total: number });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load achievements');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.xp, profile?.streakDays, profile?.dailyGoalMetCount]);

  const grouped = useMemo(() => {
    if (!items) return null;
    const by = new Map<ApiAchievement['kind'], ApiAchievement[]>();
    for (const a of items) {
      const arr = by.get(a.kind) ?? [];
      arr.push(a);
      by.set(a.kind, arr);
    }
    return GROUP_ORDER.filter((k) => by.has(k)).map((k) => ({
      kind: k,
      meta: GROUP_META[k],
      items: (by.get(k) ?? []).sort((a, b) => a.target - b.target),
    }));
  }, [items]);

  const unlockedCount = summary?.unlocked ?? 0;
  const totalCount = summary?.total ?? items?.length ?? 0;
  const overallPct = totalCount === 0 ? 0 : Math.round((unlockedCount / totalCount) * 100);
  const xp = profile?.xp ?? 0;
  const level = profile?.level ?? 1;

  if (error) {
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)' }}>Не удалось загрузить достижения: {error}</div>
    );
  }

  return (
    <div className="nn-scroll" style={{ flex: 1, overflow: 'auto', padding: isMobile ? 14 : 24 }}>
      {/* Header — real counts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <NNCard padding={20}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Получено достижений
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1.2 }} className="mono">
              {unlockedCount}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>из {totalCount}</div>
            <div style={{ flex: 1 }} />
            <NNBadge tone="amber" size="md" icon="trophy">
              Уровень {level}
            </NNBadge>
          </div>
          <div style={{ marginTop: 14, height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
            <div
              style={{
                width: `${overallPct}%`,
                height: '100%',
                background: 'linear-gradient(90deg, var(--lime-500), var(--amber-500))',
              }}
            />
          </div>
        </NNCard>

        <NNCard padding={20}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>XP</div>
          <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: -0.8, marginTop: 4 }} className="mono">
            {xp.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Стрик {profile?.streakDays ?? 0} · freeze × {profile?.streakFreezes ?? 0}
          </div>
          <div style={{ marginTop: 10, height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                width: `${((xp % 500) / 500) * 100}%`,
                height: '100%',
                background: 'var(--violet-400)',
              }}
            />
          </div>
        </NNCard>

        <NNCard padding={20}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Сад</div>
          <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: -0.8, marginTop: 4 }} className="mono">
            {profile?.plantStage ?? 0} / 5
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Виды · {profile?.unlockedSpecies?.length ?? 1} / 6
          </div>
        </NNCard>
      </div>

      {/* Groups */}
      {!grouped ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Загрузка…</div>
      ) : (
        grouped.map((g) => (
          <div key={g.kind} style={{ marginBottom: 24 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 10,
              }}
            >
              <NNIcon name={g.meta.icon} size={14} color={`var(--${g.meta.tone}-400)`} />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                }}
              >
                {g.meta.title}
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 10,
              }}
            >
              {g.items.map((a) => (
                <AchievementCard key={a.code} a={a} tone={g.meta.tone} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

function AchievementCard({
  a,
  tone,
}: {
  a: ApiAchievement;
  tone: 'amber' | 'lime' | 'sky' | 'violet' | 'rose' | 'neutral';
}) {
  const earned = !!a.unlockedAt;
  const glow = TONE_GLOW[tone];
  const rewardParts: string[] = [];
  if (a.reward?.xp) rewardParts.push(`+${a.reward.xp} XP`);
  if (a.reward?.streakFreezes) rewardParts.push(`+${a.reward.streakFreezes} freeze`);
  if (a.reward?.species?.length) rewardParts.push(speciesLabel(a.reward.species));

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        textAlign: 'center',
        background: earned ? `rgba(${glow},0.08)` : 'var(--surface)',
        border: earned ? `1px solid rgba(${glow},0.32)` : '1px solid var(--border)',
        opacity: earned ? 1 : 0.85,
        position: 'relative',
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          margin: '0 auto 10px',
          background: earned ? `radial-gradient(circle, rgba(${glow},0.28), rgba(${glow},0.05))` : 'var(--surface-2)',
          border: earned ? `1.5px solid rgba(${glow},0.6)` : '1.5px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <NNIcon name="trophy" size={22} color={earned ? `var(--${tone}-400)` : 'var(--text-dim)'} />
        {earned && (
          <div
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'var(--lime-500)',
              border: '2px solid var(--bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <NNIcon name="check" size={10} color="#0a0b0d" strokeWidth={3} />
          </div>
        )}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: earned ? 'var(--text)' : 'var(--text-muted)' }}>
        {a.title}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.35 }}>
        {a.description}
      </div>
      {!earned && (
        <div style={{ marginTop: 10 }}>
          <div style={{ height: 3, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(a.pct * 100)}%`, height: '100%', background: `var(--${tone}-500)` }} />
          </div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            {a.progress} / {a.target}
          </div>
        </div>
      )}
      {rewardParts.length > 0 && (
        <div
          style={{
            marginTop: earned ? 10 : 8,
            fontSize: 10.5,
            color: earned ? `var(--${tone}-400)` : 'var(--text-dim)',
            letterSpacing: 0.2,
            lineHeight: 1.4,
          }}
        >
          {rewardParts.join(' · ')}
        </div>
      )}
    </div>
  );
}

const TONE_GLOW: Record<string, string> = {
  amber: '243,182,85',
  lime: '154,209,85',
  sky: '85,196,214',
  violet: '167,136,255',
  rose: '232,120,138',
  neutral: '120,120,130',
};

function speciesLabel(species: string[]): string {
  const names: Record<string, string> = {
    fern: '🌿',
    cactus: '🌵',
    succulent: '🌱',
    bonsai: '🌳',
    sakura: '🌸',
    mushroom: '🍄',
  };
  return species.map((s) => names[s] ?? s).join(' ');
}
