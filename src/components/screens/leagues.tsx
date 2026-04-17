'use client';

import React from 'react';
import { NNBadge, NNBtn, NNCard, NNIcon } from '@/components/ui';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';

export const NNLeagues = () => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const isDesktop = bp === 'desktop';
  const leagues = ['Seed', 'Sprout', 'Sapling', 'Oak', 'Redwood', 'Ancient'];
  const rows = [
    { rank: 1, n: 'Mira',   xp: 3420, streak: 31, me: false, tone: 'amber', avatar: '#f3b655', initials: 'M' },
    { rank: 2, n: 'Kenji',  xp: 3180, streak: 28, me: false, tone: 'amber', avatar: '#e8788a', initials: 'K' },
    { rank: 3, n: 'Lena',   xp: 2960, streak: 22, me: false, tone: 'amber', avatar: '#a788ff', initials: 'L' },
    { rank: 4, n: 'Alex',   xp: 2847, streak: 24, me: true,  tone: 'lime',  avatar: '#9ad155', initials: 'A' },
    { rank: 5, n: 'Jordan', xp: 2510, streak: 14, me: false, tone: 'lime',  avatar: '#55c4d6', initials: 'J' },
    { rank: 6, n: 'Priya',  xp: 2340, streak: 19, me: false, tone: 'neutral', avatar: '#fd9a86', initials: 'P' },
    { rank: 7, n: 'Sam',    xp: 2180, streak: 9,  me: false, tone: 'neutral', avatar: '#8ad6ff', initials: 'S' },
    { rank: 8, n: 'Yuki',   xp: 1920, streak: 12, me: false, tone: 'neutral', avatar: '#f5b4c5', initials: 'Y' },
    { rank: 9, n: 'Malik',  xp: 1640, streak: 6,  me: false, tone: 'rose',    avatar: '#b6cbff', initials: 'M' },
    { rank: 10,n: 'Tuna',   xp: 1420, streak: 4,  me: false, tone: 'rose',    avatar: '#d0d0d0', initials: 'T' },
  ];
  return (
    <div style={{
      flex: 1,
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : '1fr 320px',
      gap: 0,
      overflow: isMobile ? 'auto' : 'hidden',
    }}>
      {/* Main */}
      <div className="nn-scroll" style={{ overflow: isMobile ? 'visible' : 'auto', padding: isMobile ? 14 : 24 }}>
        {/* League progression */}
        <NNCard padding={isMobile ? 16 : 20} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{t('leagues.currentLeague')}</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: isMobile ? 26 : 32, letterSpacing: -0.6, marginTop: 2 }}>{t('leagues.leagueName')}</div>
            </div>
            <div style={{ flex: 1 }}/>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{t('leagues.endsIn')}</div>
              <div style={{ fontSize: isMobile ? 16 : 20, color: 'var(--amber-400)', fontWeight: 600 }} className="mono">{t('leagues.endsValue')}</div>
            </div>
          </div>
          {/* League ladder */}
          <div style={{ marginTop: 20, display: 'flex', gap: 4, overflowX: isMobile ? 'auto' : 'visible' }}>
            {leagues.map((l, i) => {
              const current = i === 2;
              const past = i < 2;
              return (
                <div key={l} style={{
                  flex: 1,
                  minWidth: isMobile ? 70 : 0,
                  padding: '10px 8px', borderRadius: 8, textAlign: 'center',
                  background: current ? 'rgba(154,209,85,0.1)' : past ? 'var(--surface-2)' : 'transparent',
                  border: current ? '1px solid var(--lime-500)' : past ? '1px solid var(--border)' : '1px solid var(--border)',
                  opacity: !current && !past ? 0.5 : 1,
                }}>
                  <div style={{ fontSize: 11, color: current ? 'var(--lime-400)' : 'var(--text-muted)', fontWeight: 500 }}>{l}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }} className="mono">{i * 500 + 1000}{t('leagues.xpSuffix')}</div>
                </div>
              );
            })}
          </div>
        </NNCard>

        {/* Leaderboard */}
        <NNCard padding={0}>
          <div style={{
            padding: isMobile ? '12px 14px' : '14px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t('leagues.leaderboard')}</div>
            {!isMobile && <NNBadge tone="lime" size="sm" style={{ marginLeft: 10 }}>{t('leagues.topPromote')}</NNBadge>}
            {!isMobile && <NNBadge tone="rose" size="sm" style={{ marginLeft: 4 }}>{t('leagues.bottomDemote')}</NNBadge>}
            <div style={{ flex: 1 }}/>
            <NNBtn size="sm" variant="ghost">{t('leagues.allTime')}</NNBtn>
          </div>
          <div>
            {rows.map((r, i) => (
              <div key={r.rank} style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '32px 32px 1fr auto' : '40px 40px 1fr 100px 80px 40px',
                gap: isMobile ? 10 : 16,
                alignItems: 'center',
                padding: isMobile ? '12px 14px' : '12px 20px',
                background: r.me ? 'rgba(154,209,85,0.06)' : 'transparent',
                borderTop: i ? '1px solid var(--border)' : 'none',
                borderLeft: r.me ? '2px solid var(--lime-500)' : '2px solid transparent',
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: r.rank <= 3 ? 'var(--amber-400)' : r.rank >= 9 ? 'var(--rose-400)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`}
                </div>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: r.avatar, color: '#0a0b0d', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-serif)' }}>{r.initials}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: r.me ? 'var(--lime-400)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.n} {r.me && <span style={{ fontSize: 10, color: 'var(--lime-400)', fontWeight: 400, marginLeft: 4 }}>{t('leagues.you')}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.rank === 1 ? t('leagues.rankSubs.rank1') : r.rank <= 3 ? t('leagues.rankSubs.top3') : t('leagues.rankSubs.others')}</div>
                  {isMobile && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 3, alignItems: 'center' }}>
                      <span style={{ fontSize: 11.5, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{r.xp.toLocaleString()} xp</span>
                      <span style={{ fontSize: 11, color: 'var(--amber-400)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <NNIcon name="flame" size={11} color="var(--amber-400)"/>
                        <span className="mono">{r.streak}d</span>
                      </span>
                    </div>
                  )}
                </div>
                {!isMobile && (
                  <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{r.xp.toLocaleString()} xp</div>
                )}
                {!isMobile && (
                  <div style={{ fontSize: 12, color: 'var(--amber-400)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <NNIcon name="flame" size={12} color="var(--amber-400)"/>
                    <span className="mono">{r.streak}d</span>
                  </div>
                )}
                <div>
                  {r.rank <= 3 && <div style={{ width: 6, height: 24, borderRadius: 3, background: 'var(--lime-500)' }}/>}
                  {r.rank >= 9 && <div style={{ width: 6, height: 24, borderRadius: 3, background: 'var(--rose-500)' }}/>}
                </div>
              </div>
            ))}
          </div>
        </NNCard>
      </div>

      {/* Right rail: friends + challenges */}
      <aside style={{
        borderLeft: isMobile ? 'none' : '1px solid var(--border)',
        borderTop: isMobile ? '1px solid var(--border)' : 'none',
        background: 'var(--surface)',
        overflow: isMobile ? 'visible' : 'auto',
        padding: isMobile ? 14 : 20,
        maxWidth: '100%',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{t('leagues.friends')}</div>
        <NNBtn size="sm" variant="soft" icon="plus" block>{t('leagues.addFriend')}</NNBtn>
        <div style={{ marginTop: 16 }}>
          {[
            { n: 'Mira',  avatar: '#f3b655', initials: 'M', streak: 31, status: t('leagues.status.reviewingNow'), live: true },
            { n: 'Kenji', avatar: '#e8788a', initials: 'K', streak: 28, status: t('leagues.status.due42') },
            { n: 'Lena',  avatar: '#a788ff', initials: 'L', streak: 22, status: t('leagues.status.grewBamboo') },
            { n: 'Jordan',avatar: '#55c4d6', initials: 'J', streak: 14, status: t('leagues.status.idle2h') },
            { n: 'Priya', avatar: '#fd9a86', initials: 'P', streak: 19, status: t('leagues.status.retention98') },
          ].map(f => (
            <div key={f.n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: f.avatar, color: '#0a0b0d', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-serif)' }}>{f.initials}</div>
                {f.live && <div style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: 'var(--lime-500)', border: '2px solid var(--surface)' }}/>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{f.n}</div>
                <div style={{ fontSize: 11, color: f.live ? 'var(--lime-400)' : 'var(--text-dim)' }}>{f.status}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--amber-400)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <NNIcon name="flame" size={11} color="var(--amber-400)"/>
                <span className="mono">{f.streak}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 24, marginBottom: 12 }}>{t('leagues.weeklyChallenges')}</div>
        {[
          { n: t('leagues.challenges.xp500.n'), progress: 0.57, sub: t('leagues.challenges.xp500.sub') },
          { n: t('leagues.challenges.beatKenji.n'), progress: 0.4, sub: t('leagues.challenges.beatKenji.sub') },
          { n: t('leagues.challenges.waterDaily.n'), progress: 0.71, sub: t('leagues.challenges.waterDaily.sub') },
        ].map(c => (
          <div key={c.n} style={{ padding: '10px 12px', marginBottom: 8, borderRadius: 8, background: 'var(--surface-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{c.n}</div>
              <div style={{ flex: 1 }}/>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }} className="mono">{c.sub}</div>
            </div>
            <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${c.progress*100}%`, height: '100%', background: 'var(--lime-500)' }}/>
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
};
