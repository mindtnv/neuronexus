'use client';

import React from 'react';
import Link from 'next/link';
import { State } from 'ts-fsrs';
import { NNIcon, NNBtn, NNBadge, NNPlant } from '@/components/ui';
import { useNN } from '@/lib/store';
import type { DeckColor, PlantSpecies } from '@/lib/types';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';

const SPECIES_EMOJI: Record<PlantSpecies, string> = {
  fern: '🌿',
  cactus: '🌵',
  succulent: '🌱',
  bonsai: '🌳',
  sakura: '🌸',
  mushroom: '🍄',
};

const SPECIES_LABEL_RU: Record<PlantSpecies, string> = {
  fern: 'Папоротник',
  cactus: 'Кактус',
  succulent: 'Суккулент',
  bonsai: 'Бонсай',
  sakura: 'Сакура',
  mushroom: 'Гриб',
};

// ─────────────────────────────────────────────
// Garden — gamification / plant growing
// ─────────────────────────────────────────────
export const NNGarden = ({ variant = 'terrarium' }: { variant?: 'grid' | 'terrarium' }) => {
  if (variant === 'grid') return <NNGardenGrid/>;
  return <NNGardenTerrarium/>;
};

type PlantStage = 0 | 1 | 2 | 3 | 4 | 5;

const stageForCount = (n: number): PlantStage =>
  Math.min(5, Math.floor(n / 5)) as PlantStage;

export const NNGardenGrid = () => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const isDesktop = bp === 'desktop';

  const decks = useNN(s => s.decks);
  const cards = useNN(s => s.cards);
  const profile = useNN(s => s.profile);

  const plots = decks.map(d => {
    const deckCards = cards.filter(c => c.deckId === d.id);
    const reviewCount = deckCards.filter(c => (c.fsrs.state as unknown as State) === State.Review).length;
    const mastery = deckCards.length ? Math.round(reviewCount / deckCards.length * 100) : 0;
    return {
      id: d.id,
      deck: d.name,
      color: d.color as DeckColor,
      count: deckCards.length,
      stage: stageForCount(deckCards.length),
      species: d.species,
      mastery,
    };
  });

  const level = profile?.level ?? 1;
  const streak = profile?.streakDays ?? 0;

  return (
    <div className="nn-scroll" style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px 14px' : 32 }}>
      {/* Banner */}
      <div style={{
        padding: isMobile ? 16 : 24, borderRadius: 16, marginBottom: isMobile ? 16 : 24,
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--lime-400) 10%, transparent), color-mix(in srgb, var(--sky-400) 6%, transparent))',
        border: '1px solid color-mix(in srgb, var(--lime-400) 20%, transparent)',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'center',
        gap: isMobile ? 14 : 24,
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--lime-400)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600, marginBottom: 6 }}>{t('garden.bannerEyebrow', { level })}</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: isMobile ? 28 : 40, letterSpacing: -0.8, color: 'var(--text)' }}>
            {t('garden.bannerTitle')}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8, maxWidth: 520 }}>
            {t('garden.bannerSub')}
          </div>
        </div>
        <div style={{ flex: 1 }}/>
        <div style={{ display: 'flex', gap: isMobile ? 12 : 18, flexWrap: 'wrap' }}>
          {[
            { l: t('garden.stats.plants'), v: decks.length.toString() },
            { l: t('garden.stats.cards'), v: cards.length.toString() },
            { l: t('garden.stats.level'), v: level.toString() },
            { l: t('garden.stats.streak'), v: t('garden.streakValue', { n: streak }) },
          ].map(s => (
            <div key={s.l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 600 }} className="mono">{s.v}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Plot grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))', gap: isMobile ? 10 : 14,
      }}>
        {plots.map(p => (
          <div key={p.id} style={{
            padding: 18, borderRadius: 14,
            background: 'linear-gradient(180deg, var(--surface), var(--surface-2))',
            border: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            minHeight: 240,
          }}>
            <div style={{ display: 'flex', gap: 6, width: '100%' }}>
              <NNBadge size="xs" tone={p.color}>{t('garden.stage', { n: p.stage })}</NNBadge>
              <div style={{ flex: 1 }}/>
              <NNBadge size="xs" icon="stack" tone="neutral">{p.count}</NNBadge>
            </div>
            <NNPlant stage={p.stage} size={110} species={p.species}/>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{p.deck}</div>
            <div style={{ width: '100%', height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${p.mastery}%`, height: '100%', background: `var(--${p.color}-500)` }}/>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }} className="mono">{t('garden.mastered', { pct: p.mastery })}</div>
          </div>
        ))}
        {/* Empty plot — plant new deck */}
        <div style={{
          padding: 18, borderRadius: 14,
          background: 'repeating-linear-gradient(135deg, var(--surface), var(--surface) 6px, var(--surface-2) 6px, var(--surface-2) 12px)',
          border: '1px dashed var(--border-2)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          minHeight: 240,
        }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <NNIcon name="plus" size={28} color="var(--text-dim)"/>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('garden.plantNewDeck')}</div>
        </div>
      </div>
    </div>
  );
};

export const NNGardenTerrarium = () => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const isDesktop = bp === 'desktop';
  const m = isMobile ? 0.55 : 1; // scale for plants / sun on mobile

  const profile = useNN(s => s.profile);
  const decks = useNN(s => s.decks);
  const cards = useNN(s => s.cards);

  const stage = (profile?.plantStage ?? 0) as PlantStage;
  const level = profile?.level ?? 1;
  const streak = profile?.streakDays ?? 0;
  const currentSpecies = (profile?.plantSpecies ?? 'fern') as PlantSpecies;
  const unlockedSpecies = (profile?.unlockedSpecies ?? ['fern']) as PlantSpecies[];

  // Side plants: up to 3 other decks as background ecosystem.
  const sidePlants = decks.slice(0, 3).map(d => {
    const count = cards.filter(c => c.deckId === d.id).length;
    return { id: d.id, stage: stageForCount(count), species: d.species };
  });

  return (
    <div style={{
      flex: 1, padding: isMobile ? '16px 14px' : 32, display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: 'radial-gradient(ellipse at bottom, color-mix(in srgb, var(--lime-400) 8%, transparent), var(--bg))',
      overflow: 'auto',
    }}>
      <div style={{ textAlign: 'center', marginBottom: isMobile ? 16 : 32, width: '100%' }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: isMobile ? 26 : 38, letterSpacing: -0.7, lineHeight: 1.1, whiteSpace: 'nowrap', marginBottom: 8 }}>
          {t('garden.terrarium.title')}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {t('garden.terrarium.sub', { level, streak })}
        </div>
      </div>
      {/* Terrarium */}
      <div style={{
        width: '100%', maxWidth: 720, height: isMobile ? 300 : 360, position: 'relative',
        borderRadius: 24, overflow: 'hidden',
        background: 'var(--garden-terrarium-bg)',
        border: '1px solid var(--border-2)',
        boxShadow: 'var(--shadow-lg), inset 0 0 80px color-mix(in srgb, var(--lime-400) 8%, transparent)',
      }}>
        {/* ground */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: isMobile ? 44 : 60,
          background: 'var(--garden-ground-bg)',
        }}/>
        {/* sun */}
        <div style={{
          position: 'absolute',
          top: isMobile ? 24 : 40,
          right: isMobile ? 30 : 60,
          width: Math.round(60 * m), height: Math.round(60 * m), borderRadius: '50%',
          background: 'radial-gradient(circle, color-mix(in srgb, var(--amber-400) 70%, transparent), color-mix(in srgb, var(--amber-400) 10%, transparent) 70%)',
        }}/>
        {/* central plant — real profile stage */}
        <div style={{
          position: 'absolute', bottom: isMobile ? 20 : 30, left: '50%', transform: 'translateX(-50%)',
        }}>
          <NNPlant stage={stage} size={Math.round(220 * m)} species={currentSpecies}/>
        </div>
        {/* side plants from decks */}
        {sidePlants[0] && (
          <div style={{ position: 'absolute', bottom: isMobile ? 14 : 20, left: '8%' }}>
            <NNPlant stage={sidePlants[0].stage} size={Math.round(120 * m)} species={sidePlants[0].species}/>
          </div>
        )}
        {sidePlants[1] && (
          <div style={{ position: 'absolute', bottom: isMobile ? 10 : 15, left: '78%' }}>
            <NNPlant stage={sidePlants[1].stage} size={Math.round(110 * m)} species={sidePlants[1].species}/>
          </div>
        )}
        {sidePlants[2] && (
          <div style={{ position: 'absolute', bottom: isMobile ? 10 : 15, left: '25%' }}>
            <NNPlant stage={sidePlants[2].stage} size={Math.round(90 * m)} species={sidePlants[2].species}/>
          </div>
        )}
        {/* fireflies */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: 60 + Math.sin(i) * 40 + i * 15,
            left: `${10 + i * 11}%`,
            width: 4, height: 4, borderRadius: '50%', background: 'var(--amber-400)',
            boxShadow: '0 0 10px var(--amber-400), 0 0 20px var(--amber-400)',
          }}/>
        ))}
      </div>
      {/* actions — only the ones that do something real */}
      <div
        style={{
          marginTop: isMobile ? 16 : 24,
          display: 'flex',
          gap: isMobile ? 8 : 10,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <Link href="/review">
          <NNBtn size={isMobile ? 'md' : 'lg'} variant="primary" icon="bolt">
            {t('garden.reviewCards')}
          </NNBtn>
        </Link>
        <Link href="/decks">
          <NNBtn size={isMobile ? 'md' : 'lg'} variant="soft" icon="plus">
            {t('garden.plantNewDeck')}
          </NNBtn>
        </Link>
        <Link href="/settings">
          <NNBtn size={isMobile ? 'md' : 'lg'} variant="outline" icon="settings">
            {t('garden.changeSpecies')}
          </NNBtn>
        </Link>
      </div>

      {/* species gallery — all unlocks in one row */}
      <div
        style={{
          marginTop: isMobile ? 20 : 28,
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          justifyContent: 'center',
          padding: '12px 16px',
          borderRadius: 14,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          maxWidth: 720,
          width: '100%',
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, alignSelf: 'center', marginRight: 4 }}>
          Виды · {unlockedSpecies.length} / 6
        </div>
        {(['fern', 'cactus', 'succulent', 'bonsai', 'sakura', 'mushroom'] as PlantSpecies[]).map((s) => {
          const unlocked = unlockedSpecies.includes(s);
          const active = currentSpecies === s;
          return (
            <span
              key={s}
              title={`${SPECIES_LABEL_RU[s]}${unlocked ? '' : ' · не открыто'}`}
              style={{
                fontSize: 22,
                padding: '6px 10px',
                borderRadius: 10,
                background: active ? 'color-mix(in srgb, var(--lime-400) 14%, transparent)' : 'transparent',
                border: active ? '1px solid var(--lime-500)' : '1px solid transparent',
                opacity: unlocked ? 1 : 0.28,
                filter: unlocked ? 'none' : 'grayscale(1)',
                userSelect: 'none',
              }}
            >
              {SPECIES_EMOJI[s]}
            </span>
          );
        })}
      </div>
    </div>
  );
};
