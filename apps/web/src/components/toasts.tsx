'use client';

import React, { useEffect, useState } from 'react';
import { NNIcon } from './ui';
import { useT } from '@/lib/i18n';

// Lightweight toast stack. Any component can raise one via:
//   window.dispatchEvent(new CustomEvent('nn:toast', {
//     detail: { kind: 'freeze', title: 'Streak saved', description: 'A freeze was used.' }
//   }))
// Mounted once per app shell.

export type ToastKind = 'freeze' | 'dailyGoal' | 'leech' | 'info' | 'error';

export interface ToastPayload {
  id?: string;
  kind: ToastKind;
  /** Pre-resolved text (e.g. titles from external sources). */
  title?: string;
  description?: string;
  /** i18n keys, resolved at render time via useT(). Take precedence over title/description. */
  titleKey?: string;
  descriptionKey?: string;
  durationMs?: number;
}

interface ToastState extends ToastPayload {
  id: string;
}

// `accent` is the per-kind token; everything tinted (border, glow, icon halo)
// derives from it via color-mix so a theme swap stays consistent (P2.5).
const KIND_META: Record<ToastKind, { emoji: string; accent: string }> = {
  freeze: { emoji: '🛡', accent: 'var(--sky-400)' },
  dailyGoal: { emoji: '🎯', accent: 'var(--lime-400)' },
  leech: { emoji: '🐌', accent: 'var(--rose-400)' },
  info: { emoji: '✨', accent: 'var(--violet-400)' },
  error: { emoji: '⚠️', accent: 'var(--rose-400)' },
};

export function ToastsStack() {
  const t = useT();
  const [toasts, setToasts] = useState<ToastState[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ToastPayload>).detail;
      if (!detail) return;
      const id = detail.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { ...detail, id }]);
      const ttl = detail.durationMs ?? 4200;
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, ttl);
    };
    window.addEventListener('nn:toast', handler as EventListener);
    return () => window.removeEventListener('nn:toast', handler as EventListener);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 18,
        right: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        zIndex: 90,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        const meta = KIND_META[toast.kind];
        const title = toast.titleKey ? t(toast.titleKey) : (toast.title ?? '');
        const description = toast.descriptionKey ? t(toast.descriptionKey) : toast.description;
        return (
          <div
            key={toast.id}
            style={{
              pointerEvents: 'auto',
              minWidth: 260,
              maxWidth: 340,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'var(--surface)',
              border: `1px solid color-mix(in srgb, ${meta.accent} 40%, transparent)`,
              boxShadow: `0 8px 32px rgba(0,0,0,0.35), 0 0 24px color-mix(in srgb, ${meta.accent} 15%, transparent)`,
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              animation: 'nn-toast-in 200ms ease',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <span
              aria-hidden
              style={{
                fontSize: 22,
                width: 32,
                height: 32,
                borderRadius: 9,
                display: 'grid',
                placeItems: 'center',
                background: `radial-gradient(circle, color-mix(in srgb, ${meta.accent} 25%, transparent), color-mix(in srgb, ${meta.accent} 5%, transparent))`,
                flexShrink: 0,
              }}
            >
              {meta.emoji}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: meta.accent, letterSpacing: 0.2 }}>
                {title}
              </div>
              {description && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    marginTop: 2,
                    lineHeight: 1.4,
                  }}
                >
                  {description}
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label={t('actions.close')}
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== toast.id))}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                padding: 2,
                display: 'flex',
              }}
            >
              <NNIcon name="x" size={12} color="var(--text-dim)" />
            </button>
          </div>
        );
      })}

      <style>{`
        @keyframes nn-toast-in {
          from { transform: translateX(20px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/** Helper for other components — `raiseToast({ kind: 'freeze', ... })`. */
export function raiseToast(payload: ToastPayload) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ToastPayload>('nn:toast', { detail: payload }));
}
