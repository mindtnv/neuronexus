'use client';

import React, { useEffect, useState } from 'react';
import { NNIcon } from './ui';

// Lightweight toast stack. Any component can raise one via:
//   window.dispatchEvent(new CustomEvent('nn:toast', {
//     detail: { kind: 'achievement', title: 'Week runner', description: '+1 freeze' }
//   }))
// Mounted once per app shell.

export type ToastKind = 'achievement' | 'freeze' | 'dailyGoal' | 'info';

export interface ToastPayload {
  id?: string;
  kind: ToastKind;
  title: string;
  description?: string;
  durationMs?: number;
}

interface ToastState extends ToastPayload {
  id: string;
}

const KIND_META: Record<ToastKind, { emoji: string; accent: string; glow: string }> = {
  achievement: { emoji: '🏆', accent: 'var(--amber-400)', glow: '243,182,85' },
  freeze: { emoji: '🛡', accent: 'var(--sky-400)', glow: '85,196,214' },
  dailyGoal: { emoji: '🎯', accent: 'var(--lime-400)', glow: '154,209,85' },
  info: { emoji: '✨', accent: 'var(--violet-400)', glow: '167,136,255' },
};

export function ToastsStack() {
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
      {toasts.map((t) => {
        const meta = KIND_META[t.kind];
        return (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              minWidth: 260,
              maxWidth: 340,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'var(--surface)',
              border: `1px solid rgba(${meta.glow}, 0.4)`,
              boxShadow: `0 8px 32px rgba(0,0,0,0.35), 0 0 24px rgba(${meta.glow}, 0.15)`,
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
                background: `radial-gradient(circle, rgba(${meta.glow}, 0.25), rgba(${meta.glow}, 0.05))`,
                flexShrink: 0,
              }}
            >
              {meta.emoji}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: meta.accent, letterSpacing: 0.2 }}>
                {t.title}
              </div>
              {t.description && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    marginTop: 2,
                    lineHeight: 1.4,
                  }}
                >
                  {t.description}
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="Закрыть"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
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

/** Helper for other components — `raiseToast({ kind: 'achievement', ... })`. */
export function raiseToast(payload: ToastPayload) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ToastPayload>('nn:toast', { detail: payload }));
}
