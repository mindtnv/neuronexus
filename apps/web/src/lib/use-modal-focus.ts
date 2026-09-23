'use client';

import { useEffect, type RefObject } from 'react';

/** Keep keyboard focus inside an open overlay and restore its trigger on close. */
export function useModalFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const previous = document.activeElement;
    const controls = () => Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
      .filter((node) => !node.matches(':disabled') && !node.closest('[inert]') && node.getClientRects().length > 0);
    (root.querySelector<HTMLElement>('input,textarea,select') ?? controls()[0] ?? root).focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const activeDialog = document.activeElement?.closest('[role="dialog"],dialog');
      if (activeDialog && activeDialog !== root && !root.contains(activeDialog)) return;
      const elements = controls();
      const first = elements[0] ?? root;
      const last = elements.at(-1) ?? root;
      if (!root.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [ref]);
}
