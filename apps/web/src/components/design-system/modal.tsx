'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './primitives';

/** Native modal provides focus containment, inert background and focus restoration. */
export function Modal({ open, title, closeLabel, busy = false, onClose, children, className = '' }: {
  open: boolean; title: string; closeLabel: string; busy?: boolean;
  onClose: () => void; children: ReactNode; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select')?.focus();
    }
    else if (!open && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [open]);
  return <dialog ref={ref} className={`reomi-modal ${className}`} aria-labelledby={titleId} aria-busy={busy || undefined}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget || busy) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <header className="reomi-modal-header"><h2 id={titleId}>{title}</h2>
      <Button variant="ghost" className="reomi-create-icon" aria-label={closeLabel} title={closeLabel} disabled={busy} onClick={onClose}><span aria-hidden>×</span></Button>
    </header>
    {children}
  </dialog>;
}
