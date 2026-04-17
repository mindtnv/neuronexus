'use client';

import React, { useMemo, useState } from 'react';
import { generatorParameters } from 'ts-fsrs';
import { NNBadge, NNBtn } from '@/components/ui';
import { useNN } from '@/lib/store';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';

// ─────────────────────────────────────────────
// SETTINGS — FSRS + algorithm tuning
// ─────────────────────────────────────────────
export const NNSettings = () => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const isDesktop = bp === 'desktop';
  const profile = useNN(s => s.profile);
  const updateProfile = useNN(s => s.updateProfile);
  const reset = useNN(s => s.reset);

  const [nameDraft, setNameDraft] = useState(profile?.name ?? '');
  // Keep local state in sync when profile loads/changes externally.
  React.useEffect(() => {
    setNameDraft(profile?.name ?? '');
  }, [profile?.name]);

  const fsrsWeights = useMemo(() => generatorParameters().w, []);
  const dailyGoalOptions = [15, 30, 45, 60];
  const currentGoal = profile?.dailyGoalMinutes ?? 30;

  // TODO: wire these toggles to persisted profile flags once Profile shape is extended.
  const toggles: { t: string; d: string; on?: boolean; v?: string; beta?: boolean }[] = [
    { t: t('settings.toggles.interleaving.t'), d: t('settings.toggles.interleaving.d'), on: true },
    { t: t('settings.toggles.fuzz.t'), d: t('settings.toggles.fuzz.d'), on: true },
    { t: t('settings.toggles.lapseSteps.t'), d: t('settings.toggles.lapseSteps.d'), v: '10m · 1d · 3d' },
    { t: t('settings.toggles.maxInterval.t'), d: t('settings.toggles.maxInterval.d'), v: '180d' },
    { t: t('settings.toggles.aiHints.t'), d: t('settings.toggles.aiHints.d'), on: true },
    { t: t('settings.toggles.siblingsBurying.t'), d: t('settings.toggles.siblingsBurying.d'), on: true },
    { t: t('settings.toggles.timeBias.t'), d: t('settings.toggles.timeBias.d'), on: false },
    { t: t('settings.toggles.graphAware.t'), d: t('settings.toggles.graphAware.d'), on: true, beta: true },
  ];

  const onResetDemo = async () => {
    if (typeof window === 'undefined') return;
    if (!window.confirm(t('settings.danger.confirm'))) return;
    await reset();
    // Full reload so Bootstrap re-seeds the starter decks/profile.
    window.location.href = '/';
  };

  return (
    <div style={{ flex: 1, display: isMobile ? 'flex' : 'grid', flexDirection: isMobile ? 'column' : undefined, gridTemplateColumns: isMobile ? undefined : '220px 1fr', overflow: isMobile ? 'auto' : 'hidden' }}>
      {/* Sub-nav */}
      <aside style={{ borderRight: isMobile ? 'none' : '1px solid var(--border)', borderBottom: isMobile ? '1px solid var(--border)' : 'none', padding: isMobile ? '12px 14px' : '16px 10px', overflow: isMobile ? 'visible' : 'auto' }}>
        {[
          { g: t('settings.nav.account'), items: [
            { k: 'profile', label: t('settings.nav.profile') },
            { k: 'workspaces', label: t('settings.nav.workspaces') },
            { k: 'billing', label: t('settings.nav.billing') },
          ] },
          { g: t('settings.nav.learning'), items: [
            { k: 'algorithm', label: t('settings.nav.algorithm') },
            { k: 'dailyGoals', label: t('settings.nav.dailyGoals') },
            { k: 'cardDefaults', label: t('settings.nav.cardDefaults') },
            { k: 'aiAssistant', label: t('settings.nav.aiAssistant') },
          ] },
          { g: t('settings.nav.appearance'), items: [
            { k: 'theme', label: t('settings.nav.theme') },
            { k: 'density', label: t('settings.nav.density') },
            { k: 'sounds', label: t('settings.nav.sounds') },
          ] },
          { g: t('settings.nav.system'), items: [
            { k: 'sync', label: t('settings.nav.sync') },
            { k: 'apiTokens', label: t('settings.nav.apiTokens') },
            { k: 'importExport', label: t('settings.nav.importExport') },
            { k: 'shortcuts', label: t('settings.nav.shortcuts') },
          ] },
        ].map(g => (
          <div key={g.g} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, padding: '4px 10px', marginBottom: 4 }}>{g.g}</div>
            {g.items.map(i => {
              const active = i.k === 'algorithm';
              return (
                <div key={i.k} style={{
                  padding: '7px 10px', borderRadius: 7, fontSize: 12.5,
                  background: active ? 'var(--surface-3)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text-muted)',
                  fontWeight: active ? 500 : 400,
                }}>{i.label}</div>
              );
            })}
          </div>
        ))}
      </aside>

      {/* Main */}
      <div className="nn-scroll" style={{ overflow: isMobile ? 'visible' : 'auto', padding: isMobile ? '16px 14px' : '28px 40px' }}>
        {/* Profile */}
        <div style={{ padding: 20, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t('settings.profile.title')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>{t('settings.profile.subtitle')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 14 : 18 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>{t('settings.profile.name')}</div>
              <input
                type="text"
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onBlur={() => {
                  const next = nameDraft.trim();
                  if (next && next !== profile?.name) void updateProfile({ name: next });
                }}
                placeholder={t('settings.profile.namePlaceholder')}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontSize: 13, outline: 'none',
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>{t('settings.profile.dailyGoal')}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {dailyGoalOptions.map(m => {
                  const active = currentGoal === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { if (!active) void updateProfile({ dailyGoalMinutes: m }); }}
                      style={{
                        flex: 1, padding: '10px 6px', borderRadius: 8, cursor: 'pointer',
                        background: active ? 'var(--lime-500)' : 'var(--surface-2)',
                        color: active ? '#0a0b0d' : 'var(--text)',
                        border: active ? '1px solid var(--lime-500)' : '1px solid var(--border)',
                        fontSize: 13, fontWeight: 500,
                      }}
                    >{t('settings.profile.minLabel', { n: m })}</button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, letterSpacing: -0.6, marginBottom: 4 }}>{t('settings.algoHeading')}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, maxWidth: 600 }}>
          {t('settings.algoIntro')}
        </div>

        {/* Desired retention */}
        <div style={{ padding: 20, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t('settings.retention.title')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('settings.retention.subtitle')}</div>
            </div>
            <div style={{ flex: 1 }}/>
            <div style={{ fontSize: 32, fontWeight: 600, color: 'var(--lime-400)', letterSpacing: -1 }} className="mono">90%</div>
          </div>
          <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3, position: 'relative', marginTop: 16 }}>
            <div style={{ height: '100%', width: '73%', background: 'linear-gradient(to right, var(--rose-500), var(--amber-500), var(--lime-500))', borderRadius: 3 }}/>
            <div style={{ position: 'absolute', top: -5, left: '73%', width: 16, height: 16, borderRadius: '50%', background: 'var(--lime-500)', border: '2px solid var(--bg)', transform: 'translateX(-50%)' }}/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10.5, color: 'var(--text-dim)' }} className="mono">
            <span>{t('settings.retention.relaxed')}</span><span>85%</span><span>{t('settings.retention.typical')}</span><span>95%</span><span>{t('settings.retention.hardcore')}</span>
          </div>
          <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'rgba(154,209,85,0.06)', fontSize: 12, color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--lime-400)' }}>● {t('settings.retention.workload')}</span> {t('settings.retention.workloadValue')}
          </div>
        </div>

        {/* FSRS weights — Advanced, read-only */}
        {/* TODO: surface per-user optimized weights from review history. */}
        <div style={{ padding: 20, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14, gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                {t('settings.weights.title')}
                <NNBadge tone="neutral" size="xs">{t('settings.weights.advanced')}</NNBadge>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('settings.weights.defaults')}</div>
            </div>
            <div style={{ flex: 1 }}/>
            <NNBtn size="sm" variant="soft" icon="sync">{t('settings.weights.reoptimize')}</NNBtn>
          </div>
          <div style={{
            padding: '12px 14px', borderRadius: 8, background: 'var(--ink-950)',
            fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--lime-400)',
            lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'nowrap', userSelect: 'text',
          }}>
            <span style={{ color: 'var(--text-dim)' }}>w = [</span>
            {fsrsWeights.map((n, i) => (
              <span key={i}>
                {n.toFixed(4)}{i < fsrsWeights.length - 1 ? ', ' : ''}
                {i === 7 || i === 14 ? <br/> : null}
              </span>
            ))}
            <span style={{ color: 'var(--text-dim)' }}>]</span>
          </div>
          <div style={{ display: 'flex', gap: 18, marginTop: 12, fontSize: 11.5, color: 'var(--text-muted)' }}>
            <span>{t('settings.weights.logLoss')} <span className="mono" style={{ color: 'var(--lime-400)' }}>0.312</span></span>
            <span>{t('settings.weights.rmse')} <span className="mono" style={{ color: 'var(--lime-400)' }}>0.041</span></span>
            <span>{t('settings.weights.reviews')} <span className="mono" style={{ color: 'var(--text)' }}>12,847</span></span>
            <div style={{ flex: 1 }}/>
            <NNBtn size="sm" variant="ghost">{t('settings.weights.manualEdit')}</NNBtn>
          </div>
        </div>

        {/* More toggles — visual only for now */}
        {/* TODO: persist each toggle once Profile shape supports algorithm flags. */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 10 : 12 }}>
          {toggles.map((o, i) => (
            <div key={i} style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {o.t}
                  {o.beta && <NNBadge tone="violet" size="xs">{t('settings.toggles.beta')}</NNBadge>}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 2 }}>{o.d}</div>
              </div>
              {o.v != null ? (
                <span className="mono" style={{ fontSize: 12, color: 'var(--text)', background: 'var(--surface-2)', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>{o.v}</span>
              ) : (
                <div style={{
                  width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                  background: o.on ? 'var(--lime-500)' : 'var(--surface-3)',
                  position: 'relative', transition: 'all 180ms',
                }}>
                  <div style={{
                    position: 'absolute', top: 2, left: o.on ? 18 : 2,
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                  }}/>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* API — static. TODO: real token rotation + webhook management. */}
        <div style={{ marginTop: 24, padding: 20, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{t('settings.api.title')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>{t('settings.api.subtitle')}</div>
          <div style={{
            padding: '10px 12px', borderRadius: 8, background: 'var(--ink-950)',
            fontFamily: 'var(--font-mono)', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ color: 'var(--lime-400)' }}>sk_live_</span>
            <span style={{ color: 'var(--text-muted)', letterSpacing: 2 }}>•••••••••••••••••••••••</span>
            <span style={{ color: 'var(--lime-400)' }}>a3f2</span>
            <div style={{ flex: 1 }}/>
            <NNBtn size="sm" variant="ghost">{t('settings.api.copy')}</NNBtn>
            <NNBtn size="sm" variant="ghost">{t('settings.api.rotate')}</NNBtn>
          </div>
        </div>

        {/* Danger zone */}
        <div style={{ marginTop: 24, padding: 20, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--rose-500)' }}>{t('settings.danger.title')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{t('settings.danger.subtitle')}</div>
            </div>
            <NNBtn size="md" variant="danger" icon="x" onClick={onResetDemo}>{t('settings.danger.button')}</NNBtn>
          </div>
        </div>
      </div>
    </div>
  );
};
