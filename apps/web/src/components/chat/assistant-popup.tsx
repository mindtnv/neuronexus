'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { LayerParent, useTransientLayer } from '@/lib/use-transient-layer';
import { useNavigationGuard } from '../navigation';

/** Presentation ownership only: dismissing this layer never settles a tool call. */
export function AssistantPopup({ children, onClose, enabled = true, label, className, focus = true, role = 'dialog', beforeClose, portals }: {
  children: ReactNode; onClose(): void; enabled?: boolean; label?: string; className?: string; focus?: boolean;
  role?: 'dialog' | 'group'; beforeClose?: () => boolean; portals?: () => Array<HTMLElement | null>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const layer = useTransientLayer({ root, enabled, onClose, portals });
  useNavigationGuard(async () => beforeClose?.() ?? true, enabled ? layer.id : false);
  useEffect(() => {
    if (enabled && focus) (root.current?.querySelector<HTMLElement>('button:not(:disabled),textarea,input') ?? root.current)?.focus({ preventScroll: true });
  }, [enabled, focus]);
  return <div ref={root} className={className} role={role} aria-label={label} tabIndex={-1} data-assistant-overlay={enabled || undefined}>
    <LayerParent.Provider value={enabled ? layer.id : null}>{children}</LayerParent.Provider>
  </div>;
}
