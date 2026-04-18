'use client';

// NeuroNexus — Mobile view (iOS frame) wired to real store data.

import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import { NNBadge, NNBtn, NNCard, NNIcon, NNMiniGraph, NNPlant, NNTag } from '@/components/ui';
import { countDueCards, countDueCardsByDeck, getFirstDueCard } from '@/lib/cards';
import { humanInterval } from '@/lib/fsrs';
import { useNN } from '@/lib/store';
import type { Card, Deck, DeckColor } from '@/lib/types';
import { IOSDevice } from './ios-frame';
import { useT, useDateLocale } from '@/lib/i18n';

type Tab = 'home' | 'review' | 'graph' | 'garden';

export const NNMobile = () => {
  const t = useT();
  const [tab, setTab] = useState<Tab>('home');
  return (
    <IOSDevice width={390} height={844} dark>
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#0a0b0d',
          color: '#eaecf1',
          fontFamily: '-apple-system, "Inter Tight", system-ui',
        }}
      >
        <div style={{ height: 54 }} />

        {tab === 'home' && <MobHome />}
        {tab === 'review' && <MobReview />}
        {tab === 'graph' && <MobGraph />}
        {tab === 'garden' && <MobGarden />}

        <div
          style={{
            height: 82,
            paddingBottom: 22,
            paddingTop: 6,
            borderTop: '1px solid #1c1f25',
            background: 'rgba(10,11,13,0.85)',
            backdropFilter: 'blur(20px)',
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
          }}
        >
          {(
            [
              { id: 'home', i: 'home', l: t('mobile.tabs.home') },
              { id: 'review', i: 'bolt', l: t('mobile.tabs.review') },
              { id: 'graph', i: 'graph', l: t('mobile.tabs.graph') },
              { id: 'garden', i: 'garden', l: t('mobile.tabs.garden') },
            ] as const
          ).map((tab2) => (
            <div
              key={tab2.id}
              onClick={() => setTab(tab2.id as Tab)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                color: tab === tab2.id ? 'var(--lime-400)' : 'var(--text-dim)',
                padding: '6px 10px',
                cursor: 'pointer',
              }}
            >
              <NNIcon name={tab2.i} size={22} />
              <span style={{ fontSize: 10.5, fontWeight: 500 }}>{tab2.l}</span>
            </div>
          ))}
        </div>
      </div>
    </IOSDevice>
  );
};

// ─────────────────────────────────────────────

const greetKey = (now = new Date()): 'lateNight' | 'morning' | 'afternoon' | 'evening' => {
  const h = now.getHours();
  if (h < 5) return 'lateNight';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 22) return 'evening';
  return 'lateNight';
};

const deckAccent = (c: DeckColor): 'lime' | 'amber' | 'violet' | 'sky' | 'rose' => {
  if (c === 'neutral') return 'violet';
  return c;
};

function usePulledData() {
  const bootstrapped = useNN((s) => s.bootstrapped);
  const cards = useNN((s) => s.cards);
  const decks = useNN((s) => s.decks);
  const profile = useNN((s) => s.profile);

  const now = Date.now();
  const dueCount = useMemo(() => countDueCards(cards, now), [cards, now]);
  const dueByDeck = useMemo(() => countDueCardsByDeck(cards, now), [cards, now]);
  const firstDue = useMemo(() => getFirstDueCard(cards, now), [cards, now]);

  return { bootstrapped, cards, decks, profile, dueCount, dueByDeck, firstDue };
}

// ─────────────────────────────────────────────

const MobHome = () => {
  const t = useT();
  const dateLocale = useDateLocale();
  const { bootstrapped, cards, decks, profile, dueCount, dueByDeck } = usePulledData();
  const now = new Date();
  const estMinutes = Math.max(1, Math.round(dueCount * 0.25));
  const streak = profile?.streakDays ?? 0;
  const level = profile?.level ?? 1;
  const name = profile?.name ?? 'Alex';
  const totalCards = cards.length;
  const mastered = useMemo(
    () => cards.filter((c) => c.fsrs.reps >= 3 && c.fsrs.lapses === 0).length,
    [cards],
  );
  const masteryPct = totalCards === 0 ? 0 : Math.round((mastered / totalCards) * 100);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '8px 18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {t('mobile.greet.line', { greet: t(`mobile.greet.${greetKey(now)}`), name })}
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.5 }}>{format(now, 'MMM d', { locale: dateLocale })}</div>
        </div>
        <NNBadge tone="amber" size="sm" icon="flame">
          {streak}
        </NNBadge>
      </div>

      <div
        style={{
          padding: 20,
          borderRadius: 16,
          background: 'linear-gradient(140deg, var(--surface), var(--surface-2))',
          border: '1px solid var(--border)',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            color: 'var(--lime-400)',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          {t('mobile.home.dueToday')}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 60, lineHeight: 1, letterSpacing: -1.5 }}>
            {dueCount}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('mobile.home.cardsEst', { min: estMinutes })}</div>
        </div>
        <Link href="/review" style={{ display: 'block' }}>
          <NNBtn block size="lg" variant="primary" icon="bolt">
            {t('mobile.home.startReview')}
          </NNBtn>
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <NNCard padding={14}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
            {t('mobile.home.mastery')}
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--lime-400)' }} className="mono">
            {masteryPct}%
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{t('mobile.home.cardsCount', { n: totalCards })}</div>
        </NNCard>
        <NNCard padding={14}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
            {t('mobile.home.level')}
          </div>
          <div style={{ fontSize: 22, fontWeight: 600 }} className="mono">
            {level}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{t('mobile.home.botanist')}</div>
        </NNCard>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '16px 0 8px', fontWeight: 500 }}>
        {t('mobile.home.decks')}
      </div>
      {decks.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '12px 14px', border: '1px dashed var(--border-2)', borderRadius: 10 }}>
          {bootstrapped ? t('mobile.home.noDecks') : t('mobile.home.loading')}
        </div>
      )}
      {decks.map((d: Deck) => (
        <Link
          key={d.id}
          href="/review"
          style={{
            padding: 14,
            borderRadius: 12,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <div style={{ width: 8, height: 36, borderRadius: 2, background: `var(--${deckAccent(d.color)}-500)` }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{d.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{t('mobile.home.due', { n: dueByDeck.get(d.id) ?? 0 })}</div>
          </div>
          <NNIcon name="chevr" size={14} color="var(--text-dim)" />
        </Link>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────

const MobReview = () => {
  const t = useT();
  const { firstDue, decks, dueCount } = usePulledData();
  const [revealed, setRevealed] = useState(false);
  const deck = firstDue ? decks.find((d) => d.id === firstDue.deckId) : undefined;

  if (!firstDue) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 36, color: 'var(--text)', letterSpacing: -0.8 }}>
          {t('mobile.review.allCaughtUp')}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
          {t('mobile.review.noCardsDue')}
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '8px 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <NNIcon name="x" size={18} color="var(--text-muted)" />
        <div style={{ flex: 1, height: 5, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: '3%', height: '100%', background: 'var(--lime-500)' }} />
        </div>
        <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          {t('mobile.review.progress', { n: dueCount })}
        </span>
      </div>
      <div
        onClick={() => setRevealed((v) => !v)}
        style={{
          flex: 1,
          padding: '24px 20px',
          borderRadius: 18,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {firstDue.tags.slice(0, 3).map((t) => (
            <NNTag key={t} color={deck ? deckAccent(deck.color) : 'sky'}>
              {t}
            </NNTag>
          ))}
        </div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, letterSpacing: -0.8, lineHeight: 1.2, wordBreak: 'break-word' }}>
          {firstDue.front}
        </div>
        <div style={{ flex: 1, minHeight: 20 }} />
        <div style={{ height: 1, background: 'var(--border)', margin: '18px 0' }} />
        {revealed ? (
          <div style={{ fontSize: 20, color: 'var(--lime-400)', fontFamily: 'var(--font-serif)', lineHeight: 1.35 }}>
            {firstDue.back}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('mobile.review.tapToReveal')}</div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 12 }}>
        {(
          [
            { l: t('mobile.review.ratings.again'), t: humanInterval({ ...firstDue.fsrs, due: new Date(Date.now() + 60 * 1000) }), c: 'rose' },
            { l: t('mobile.review.ratings.hard'), t: humanInterval({ ...firstDue.fsrs, due: new Date(Date.now() + 8 * 60 * 1000) }), c: 'amber' },
            { l: t('mobile.review.ratings.good'), t: humanInterval({ ...firstDue.fsrs, due: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) }), c: 'lime' },
            { l: t('mobile.review.ratings.easy'), t: humanInterval({ ...firstDue.fsrs, due: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000) }), c: 'sky' },
          ] as const
        ).map((r) => (
          <div
            key={r.l}
            style={{
              padding: '10px 6px',
              borderRadius: 10,
              textAlign: 'center',
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid var(--${r.c}-500)`,
              opacity: revealed ? 1 : 0.55,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600 }}>{r.l}</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }} className="mono">
              {r.t}
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-dim)', textAlign: 'center', marginTop: 10 }}>
        {t('mobile.review.gradingHint')}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────

const MobGraph = () => {
  const t = useT();
  const { firstDue, decks, cards } = usePulledData();
  const focusedDeck = firstDue ? decks.find((d) => d.id === firstDue.deckId) : undefined;
  const related = useMemo(() => {
    if (!firstDue) return [] as Card[];
    const tags = new Set(firstDue.tags);
    return cards
      .filter((c) => c.id !== firstDue.id && c.tags.some((t) => tags.has(t)))
      .slice(0, 3);
  }, [firstDue, cards]);

  return (
    <div style={{ flex: 1, position: 'relative', background: '#06070a', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 16,
          right: 16,
          zIndex: 5,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <div
          style={{
            flex: 1,
            padding: '8px 12px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            fontSize: 13,
          }}
        >
          <NNIcon name="search" size={14} color="var(--text-dim)" />
          <span style={{ color: 'var(--text-dim)' }}>{t('mobile.review.searchGraph')}</span>
        </div>
        <NNBtn size="md" variant="soft" icon="filter" />
      </div>
      <NNMiniGraph height="100%" width="100%" />
      {firstDue && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            right: 16,
            padding: 14,
            background: 'rgba(20,22,30,0.9)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--border)',
            borderRadius: 14,
          }}
        >
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, wordBreak: 'break-word' }}>{firstDue.front}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            {t('mobile.review.links', { n: related.length, deck: focusedDeck?.name ?? 'deck' })}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {related.map((c) => (
              <NNBadge key={c.id} tone="sky" size="xs">
                {c.front.slice(0, 24)}
              </NNBadge>
            ))}
            {related.length === 0 && (
              <NNBadge tone="neutral" size="xs">
                {t('mobile.review.noRelated')}
              </NNBadge>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────

const MobGarden = () => {
  const t = useT();
  const { cards, decks, profile } = usePulledData();
  const plants = useMemo(() => {
    return decks.slice(0, 4).map((d) => {
      const count = cards.filter((c) => c.deckId === d.id).length;
      return {
        id: d.id,
        name: d.name,
        color: deckAccent(d.color),
        stage: Math.max(0, Math.min(5, Math.floor(count / 3))) as 0 | 1 | 2 | 3 | 4 | 5,
        count,
      };
    });
  }, [cards, decks]);

  const stage = profile?.plantStage ?? 0;

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '8px 18px 20px' }}>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, marginBottom: 2 }}>{t('mobile.review.garden.title')}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
        {t('mobile.review.garden.sub', { level: profile?.level ?? 1, n: plants.length })}
      </div>
      <div
        style={{
          padding: 20,
          borderRadius: 16,
          background: 'linear-gradient(180deg, #12171f, #1b2418)',
          border: '1px solid var(--border)',
          position: 'relative',
          overflow: 'hidden',
          height: 220,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 30,
            background: 'linear-gradient(180deg, #3a2817, #1a0f07)',
          }}
        />
        <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)' }}>
          <NNPlant stage={stage} size={160} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {plants.map((p) => (
          <NNCard key={p.id} padding={12}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
              <NNPlant stage={p.stage} size={70} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, textAlign: 'center' }}>{p.name}</div>
            <div style={{ fontSize: 10.5, color: `var(--${p.color}-400)`, textAlign: 'center' }} className="mono">
              {t('mobile.review.garden.stageLine', { stage: p.stage, count: p.count })}
            </div>
          </NNCard>
        ))}
      </div>
    </div>
  );
};
