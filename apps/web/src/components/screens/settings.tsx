'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ANKI_DEFAULTS, MIN_RETENTION, MAX_RETENTION } from '@neuronexus/shared';
import { NNBadge, NNBtn } from '@/components/ui';
import { signOut, useSession } from '@/lib/auth';
import { api, ok } from '@/lib/api';
import { useNN } from '@/lib/store';
import type { DeckOptionsPreset } from '@/lib/types';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';

// ─────────────────────────────────────────────
// SETTINGS — only the controls that are actually wired to the server.
// Everything else (workspaces/billing/api tokens/theme sounds/sync/etc.) has
// been removed until the backend feature lands. Adding a section here means
// it's really functional.
// ─────────────────────────────────────────────

// ── Default values for a new preset form ─────────────────────────────────────
const PRESET_DEFAULTS = {
  name: '',
  newPerDay: 20,
  reviewsPerDay: 200,
  learningSteps: '1m 10m',
  relearningSteps: '10m',
  desiredRetentionPct: '',
  leechThreshold: 8,
  maximumInterval: 36500,
};

function parseSteps(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const NNSettings = () => {
  const t = useT();
  const router = useRouter();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const profile = useNN((s) => s.profile);
  const updateProfile = useNN((s) => s.updateProfile);
  const presets = useNN((s) => s.presets);
  const decks = useNN((s) => s.decks);
  const addPreset = useNN((s) => s.addPreset);
  const updatePreset = useNN((s) => s.updatePreset);
  const deletePreset = useNN((s) => s.deletePreset);
  const resetStore = useNN((s) => s.reset);
  const { data: session } = useSession();
  const userEmail = session?.user?.email ?? '';

  const [nameDraft, setNameDraft] = useState(profile?.name ?? '');
  React.useEffect(() => {
    setNameDraft(profile?.name ?? '');
  }, [profile?.name]);

  // Stored as a fraction (0.7..0.99) on the server; shown as a percentage.
  const retentionPct = Math.round(((profile?.desiredRetention ?? ANKI_DEFAULTS.requestRetention) * 100));
  const [retentionDraft, setRetentionDraft] = useState(retentionPct);
  React.useEffect(() => {
    setRetentionDraft(retentionPct);
  }, [retentionPct]);

  const dailyGoalOptions = [15, 30, 45, 60];
  const currentGoal = profile?.dailyGoalMinutes ?? 15;

  // ── Preset editor state ───────────────────────────────────────────────────
  const [presetEditing, setPresetEditing] = useState<string | 'new' | null>(null);
  const [presetForm, setPresetForm] = useState(PRESET_DEFAULTS);
  const [presetSaving, setPresetSaving] = useState(false);
  const [presetSaveError, setPresetSaveError] = useState('');
  const [presetDeleteError, setPresetDeleteError] = useState('');

  const openCreatePreset = () => {
    setPresetForm(PRESET_DEFAULTS);
    setPresetSaveError('');
    setPresetEditing('new');
  };

  const openEditPreset = (p: DeckOptionsPreset) => {
    setPresetForm({
      name: p.name,
      newPerDay: p.newPerDay,
      reviewsPerDay: p.reviewsPerDay,
      learningSteps: p.learningSteps.join(' '),
      relearningSteps: p.relearningSteps.join(' '),
      desiredRetentionPct: p.desiredRetention != null ? String(Math.round(p.desiredRetention * 100)) : '',
      leechThreshold: p.leechThreshold,
      maximumInterval: p.maximumInterval,
    });
    setPresetSaveError('');
    setPresetEditing(p.id);
  };

  const cancelPresetEdit = () => {
    setPresetEditing(null);
    setPresetSaveError('');
  };

  const handleSavePreset = async () => {
    const retPctRaw = presetForm.desiredRetentionPct.trim();
    const desiredRetention = retPctRaw === '' ? null : Number(retPctRaw) / 100;
    if (desiredRetention !== null && (desiredRetention < MIN_RETENTION || desiredRetention > MAX_RETENTION)) {
      setPresetSaveError(t('settings.deckOptions.fields.desiredRetentionHint'));
      return;
    }
    const learningSteps = parseSteps(presetForm.learningSteps);
    const relearningSteps = parseSteps(presetForm.relearningSteps);
    setPresetSaving(true);
    setPresetSaveError('');
    try {
      if (presetEditing === 'new') {
        await addPreset({
          name: presetForm.name,
          newPerDay: Number(presetForm.newPerDay),
          reviewsPerDay: Number(presetForm.reviewsPerDay),
          learningSteps,
          relearningSteps,
          desiredRetention,
          leechThreshold: Number(presetForm.leechThreshold),
          maximumInterval: Number(presetForm.maximumInterval),
        });
      } else if (presetEditing) {
        await updatePreset(presetEditing, {
          name: presetForm.name,
          newPerDay: Number(presetForm.newPerDay),
          reviewsPerDay: Number(presetForm.reviewsPerDay),
          learningSteps,
          relearningSteps,
          desiredRetention,
          leechThreshold: Number(presetForm.leechThreshold),
          maximumInterval: Number(presetForm.maximumInterval),
        });
      }
      setPresetEditing(null);
    } catch {
      setPresetSaveError(t('settings.deckOptions.saveError'));
    } finally {
      setPresetSaving(false);
    }
  };

  const handleDeletePreset = async (p: DeckOptionsPreset) => {
    if (typeof window === 'undefined') return;
    const deckCount = decks.filter((d) => d.presetId === p.id).length;
    const affectedNote = deckCount > 0
      ? t('settings.deckOptions.deleteAffected', { n: deckCount })
      : t('settings.deckOptions.deleteZeroAffected');
    const msg = t('settings.deckOptions.deleteConfirm', { name: p.name, affected: affectedNote });
    if (!window.confirm(msg)) return;
    setPresetDeleteError('');
    try {
      await deletePreset(p.id);
    } catch {
      setPresetDeleteError(t('settings.deckOptions.deleteError'));
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      resetStore();
      router.replace('/auth/sign-in');
    }
  };

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      const data = await ok(await (api as any).profile.export.get());
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'neuronexus-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(t('settings.data.exportError'));
    } finally {
      setExporting(false);
    }
  };

  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await ok(await (api as any).profile.delete({ confirmEmail }));
      await signOut();
      router.replace('/auth/sign-in');
    } catch {
      setDeleteError(t('settings.danger.deleteError'));
    } finally {
      setDeleting(false);
    }
  };

  // Plant species picker — choose among the ones the user has unlocked.
  const unlocked = profile?.unlockedSpecies ?? ['fern'];
  const currentSpecies = profile?.plantSpecies ?? 'fern';

  return (
    <div className="nn-scroll" style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px 14px' : '28px 40px', maxWidth: 880, width: '100%', margin: '0 auto' }}>
      {/* ── Profile ── */}
      <Section title={t('settings.profile.title')} subtitle={t('settings.profile.subtitle')}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 14 : 18 }}>
          <Field label={t('settings.profile.name')}>
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => {
                const next = nameDraft.trim();
                if (next && next !== profile?.name) void updateProfile({ name: next });
              }}
              placeholder={t('settings.profile.namePlaceholder')}
              style={inputStyle}
            />
          </Field>
          <Field label={t('settings.profile.dailyGoal')}>
            <div style={{ display: 'flex', gap: 6 }}>
              {dailyGoalOptions.map((m) => {
                const active = currentGoal === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      if (!active) void updateProfile({ dailyGoalMinutes: m });
                    }}
                    style={{
                      flex: 1,
                      padding: '10px 6px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: active ? 'var(--lime-500)' : 'var(--surface-2)',
                      color: active ? '#0a0b0d' : 'var(--text)',
                      border: active ? '1px solid var(--lime-500)' : '1px solid var(--border)',
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {t('settings.profile.minLabel', { n: m })}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      </Section>

      {/* ── Desired retention ── */}
      <Section
        title={t('settings.retention.title')}
        subtitle={t('settings.retention.subtitle')}
        accent={<span style={{ fontSize: 28, fontWeight: 600, color: 'var(--lime-400)', letterSpacing: -1 }} className="mono">{retentionDraft}%</span>}
      >
        <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3, position: 'relative', marginTop: 4 }}>
          <div style={{ height: '100%', width: `${((retentionDraft - 70) / 29) * 100}%`, background: 'linear-gradient(to right, var(--rose-500), var(--amber-500), var(--lime-500))', borderRadius: 3 }} />
          <div style={{ position: 'absolute', top: -5, left: `${((retentionDraft - 70) / 29) * 100}%`, width: 16, height: 16, borderRadius: '50%', background: 'var(--lime-500)', border: '2px solid var(--bg)', transform: 'translateX(-50%)', pointerEvents: 'none' }} />
          <input
            type="range"
            min={70}
            max={99}
            value={retentionDraft}
            onChange={(e) => setRetentionDraft(Number(e.target.value))}
            onMouseUp={() => { void updateProfile({ desiredRetention: retentionDraft / 100 }); }}
            onTouchEnd={() => { void updateProfile({ desiredRetention: retentionDraft / 100 }); }}
            aria-label={t('settings.retention.title')}
            style={{ position: 'absolute', inset: '-8px 0', width: '100%', opacity: 0, cursor: 'pointer' }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10.5, color: 'var(--text-dim)' }} className="mono">
          <span>{t('settings.retention.relaxed')} · 70</span>
          <span>85</span>
          <span>{t('settings.retention.typical')} · 90</span>
          <span>95</span>
          <span>{t('settings.retention.hardcore')} · 99</span>
        </div>
      </Section>

      {/* ── Plant species picker ── */}
      <Section title="Растение сада" subtitle={`Открыто: ${unlocked.length} из 6. Выбери, какое растёт в центре сада.`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
          {SPECIES.map((s) => {
            const isUnlocked = unlocked.includes(s.key);
            const active = currentSpecies === s.key;
            return (
              <button
                key={s.key}
                type="button"
                disabled={!isUnlocked}
                onClick={() => { if (isUnlocked && !active) void updateProfile({ plantSpecies: s.key }); }}
                style={{
                  padding: '14px 10px',
                  borderRadius: 12,
                  background: active ? 'rgba(154,209,85,0.14)' : 'var(--surface-2)',
                  border: `1px solid ${active ? 'var(--lime-500)' : 'var(--border)'}`,
                  color: 'var(--text)',
                  cursor: isUnlocked ? 'pointer' : 'not-allowed',
                  opacity: isUnlocked ? 1 : 0.4,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'inherit',
                  transition: 'background 140ms',
                }}
              >
                <span style={{ fontSize: 28 }} aria-hidden>
                  {s.emoji}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{s.label}</span>
                {!isUnlocked && (
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{s.unlock}</span>
                )}
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── FSRS algorithm info (read-only) ── */}
      <Section
        title={t('settings.weights.title')}
        subtitle="Алгоритм FSRS — используется для планирования повторов. Параметры пока общие для всех пользователей; персонализация веса — в следующих версиях."
        accent={<NNBadge tone="neutral" size="xs">{t('settings.weights.advanced')}</NNBadge>}
      >
        <InfoRow label="Learning steps" value={ANKI_DEFAULTS.learningSteps.join(' · ')} />
        <InfoRow label="Relearning steps" value={ANKI_DEFAULTS.relearningSteps.join(' · ')} />
        <InfoRow label="Max interval" value={`${ANKI_DEFAULTS.maximumInterval} d`} />
        <InfoRow label="Fuzz" value={ANKI_DEFAULTS.enableFuzz ? 'on' : 'off'} />
        <InfoRow label="Short-term scheduler" value={ANKI_DEFAULTS.enableShortTerm ? 'on' : 'off'} />
        <InfoRow label="Leech threshold" value={`${ANKI_DEFAULTS.leechThreshold} lapses`} />
      </Section>

      {/* ── Deck Options presets ── */}
      <Section
        title={t('settings.deckOptions.title')}
        subtitle={t('settings.deckOptions.subtitle')}
        accent={
          <NNBtn size="sm" variant="soft" onClick={openCreatePreset}>
            {t('settings.deckOptions.createPreset')}
          </NNBtn>
        }
      >
        {presets.length === 0 && presetEditing !== 'new' && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '8px 0' }}>
            {t('settings.deckOptions.noPresets')}
          </div>
        )}
        {presetDeleteError && (
          <div style={{ fontSize: 12, color: 'var(--rose-500)', marginBottom: 8 }}>
            {presetDeleteError}
          </div>
        )}
        {presets.map((p) => {
          const isEditing = presetEditing === p.id;
          const boundCount = decks.filter((d) => d.presetId === p.id).length;
          return (
            <div
              key={p.id}
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: 12,
                marginTop: 8,
              }}
            >
              {isEditing ? (
                <PresetForm
                  form={presetForm}
                  onChange={setPresetForm}
                  saving={presetSaving}
                  saveError={presetSaveError}
                  onSave={handleSavePreset}
                  onCancel={cancelPresetEdit}
                  t={t}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                      {p.newPerDay} new · {p.reviewsPerDay} reviews
                      {p.desiredRetention != null && ` · ${Math.round(p.desiredRetention * 100)}% retention`}
                      {boundCount > 0 && (
                        <span style={{ color: 'var(--lime-400)', marginLeft: 6 }}>
                          {t('settings.deckOptions.boundTo', { n: boundCount })}
                        </span>
                      )}
                    </div>
                  </div>
                  <NNBtn size="sm" variant="ghost" onClick={() => openEditPreset(p)}>
                    {t('settings.deckOptions.editPreset')}
                  </NNBtn>
                  <NNBtn size="sm" variant="ghost" onClick={() => void handleDeletePreset(p)}>
                    {t('settings.deckOptions.deletePreset')}
                  </NNBtn>
                </div>
              )}
            </div>
          );
        })}
        {presetEditing === 'new' && (
          <div style={{ borderTop: presets.length > 0 ? '1px solid var(--border)' : undefined, paddingTop: presets.length > 0 ? 12 : 0, marginTop: presets.length > 0 ? 8 : 0 }}>
            <PresetForm
              form={presetForm}
              onChange={setPresetForm}
              saving={presetSaving}
              saveError={presetSaveError}
              onSave={handleSavePreset}
              onCancel={cancelPresetEdit}
              t={t}
            />
          </div>
        )}
      </Section>

      {/* ── Your data (export) ── */}
      <Section title={t('settings.data.title')} subtitle={t('settings.data.subtitle')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('settings.data.exportDesc')}</div>
            {exportError && <div style={{ fontSize: 12, color: 'var(--rose-500)', marginTop: 4 }}>{exportError}</div>}
          </div>
          <NNBtn size="md" variant="soft" onClick={handleExport} disabled={exporting}>
            {exporting ? t('settings.data.exporting') : t('settings.data.export')}
          </NNBtn>
        </div>
      </Section>

      {/* ── Danger zone ── */}
      <div style={{ ...cardStyle, borderColor: 'rgba(251, 113, 133, 0.25)', marginBottom: 24 }}>
        {/* Sign out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(251,113,133,0.15)' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--rose-500)' }}>Выйти из аккаунта</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Сессия закроется, данные останутся — зайди снова, чтобы продолжить.</div>
          </div>
          <NNBtn size="md" variant="danger" icon="x" onClick={handleSignOut}>{t('auth.signOut')}</NNBtn>
        </div>

        {/* Delete account */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--rose-500)', marginBottom: 2 }}>{t('settings.danger.deleteAccount')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>{t('settings.danger.deleteAccountDesc')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={t('settings.danger.confirmEmailPlaceholder')}
              style={{ ...inputStyle, maxWidth: 280 }}
            />
            <NNBtn
              size="md"
              variant="danger"
              onClick={handleDeleteAccount}
              disabled={deleting || confirmEmail !== userEmail}
            >
              {deleting ? t('settings.danger.deleting') : t('settings.danger.deleteAccount')}
            </NNBtn>
          </div>
          {deleteError && <div style={{ fontSize: 12, color: 'var(--rose-500)', marginTop: 8 }}>{deleteError}</div>}
        </div>
      </div>
    </div>
  );
};

// ── helpers ────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  padding: 20,
  borderRadius: 14,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

function Section({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {accent}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
      <span className="mono" style={{ fontSize: 12, color: 'var(--text)' }}>{value}</span>
    </div>
  );
}

type PresetFormState = typeof PRESET_DEFAULTS;

function PresetForm({
  form,
  onChange,
  saving,
  saveError,
  onSave,
  onCancel,
  t,
}: {
  form: PresetFormState;
  onChange: (f: PresetFormState) => void;
  saving: boolean;
  saveError: string;
  onSave: () => void;
  onCancel: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const set = (k: keyof PresetFormState, v: string | number) =>
    onChange({ ...form, [k]: v });

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={t('settings.deckOptions.fields.name')}>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder={t('settings.deckOptions.fields.namePlaceholder')}
            style={inputStyle}
          />
        </Field>
        <Field label={t('settings.deckOptions.fields.desiredRetention')}>
          <input
            type="number"
            value={form.desiredRetentionPct}
            onChange={(e) => set('desiredRetentionPct', e.target.value)}
            placeholder={t('settings.deckOptions.fields.desiredRetentionPlaceholder')}
            min={MIN_RETENTION * 100}
            max={MAX_RETENTION * 100}
            style={inputStyle}
          />
          <div style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 3 }}>
            {t('settings.deckOptions.fields.desiredRetentionHint')}
          </div>
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={t('settings.deckOptions.fields.newPerDay')}>
          <input
            type="number"
            value={form.newPerDay}
            onChange={(e) => set('newPerDay', Number(e.target.value))}
            min={0}
            max={9999}
            style={inputStyle}
          />
        </Field>
        <Field label={t('settings.deckOptions.fields.reviewsPerDay')}>
          <input
            type="number"
            value={form.reviewsPerDay}
            onChange={(e) => set('reviewsPerDay', Number(e.target.value))}
            min={0}
            max={9999}
            style={inputStyle}
          />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={t('settings.deckOptions.fields.learningSteps')}>
          <input
            type="text"
            value={form.learningSteps}
            onChange={(e) => set('learningSteps', e.target.value)}
            placeholder={t('settings.deckOptions.fields.learningStepsPlaceholder')}
            style={inputStyle}
          />
          <div style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 3 }}>
            {t('settings.deckOptions.fields.learningStepsHint')}
          </div>
        </Field>
        <Field label={t('settings.deckOptions.fields.relearningSteps')}>
          <input
            type="text"
            value={form.relearningSteps}
            onChange={(e) => set('relearningSteps', e.target.value)}
            placeholder={t('settings.deckOptions.fields.relearningStepsPlaceholder')}
            style={inputStyle}
          />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={t('settings.deckOptions.fields.leechThreshold')}>
          <input
            type="number"
            value={form.leechThreshold}
            onChange={(e) => set('leechThreshold', Number(e.target.value))}
            min={1}
            max={99}
            style={inputStyle}
          />
        </Field>
        <Field label={t('settings.deckOptions.fields.maximumInterval')}>
          <input
            type="number"
            value={form.maximumInterval}
            onChange={(e) => set('maximumInterval', Number(e.target.value))}
            min={1}
            max={36500}
            style={inputStyle}
          />
        </Field>
      </div>
      {saveError && (
        <div style={{ fontSize: 12, color: 'var(--rose-500)' }}>{saveError}</div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <NNBtn size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          {t('settings.deckOptions.actions.cancel')}
        </NNBtn>
        <NNBtn size="sm" variant="primary" onClick={onSave} disabled={saving}>
          {saving ? t('settings.deckOptions.saving') : t('settings.deckOptions.actions.save')}
        </NNBtn>
      </div>
    </div>
  );
}

const SPECIES: { key: 'fern' | 'cactus' | 'succulent' | 'bonsai' | 'sakura' | 'mushroom'; emoji: string; label: string; unlock: string }[] = [
  { key: 'fern', emoji: '🌿', label: 'Папоротник', unlock: 'По умолчанию' },
  { key: 'cactus', emoji: '🌵', label: 'Кактус', unlock: 'Уровень 5' },
  { key: 'succulent', emoji: '🌱', label: 'Суккулент', unlock: '1 000 повторов' },
  { key: 'bonsai', emoji: '🌳', label: 'Бонсай', unlock: 'Стрик 100' },
  { key: 'sakura', emoji: '🌸', label: 'Сакура', unlock: 'Стрик 30' },
  { key: 'mushroom', emoji: '🍄', label: 'Гриб', unlock: 'Стрик 365' },
];
