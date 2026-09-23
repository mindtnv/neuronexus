'use client';
import { assistantOverlayShift, visibleAssistantViewport } from './assistant-overlay-geometry';
import { useTransientLayer } from './use-transient-layer';
import { useLayoutEffect, useRef, type RefObject } from 'react';

export const ASSISTANT_FOCUSABLE = 'button:not(:disabled),input:not(:disabled):not([type="hidden"]),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]';

function disabledByFieldset(node: HTMLElement): boolean {
  if (!node.matches('button,input,select,textarea')) return false;
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName !== 'FIELDSET' || !parent.hasAttribute('disabled')) continue;
    const legend = Array.from(parent.children).find(child => child.tagName === 'LEGEND');
    if (!legend?.contains(node)) return true;
  }
  return false;
}

/** Portal controls belong to the same mobile modal even though they are not
 * DOM descendants of its window. Preserve DOM order and avoid duplicates. */
export function assistantFocusControls(root: HTMLElement): HTMLElement[] {
  const roots = [root, ...Array.from(document.querySelectorAll<HTMLElement>('[data-assistant-overlay]'))];
  return [...new Set(roots.flatMap(scope => Array.from(scope.querySelectorAll<HTMLElement>(ASSISTANT_FOCUSABLE))))]
    .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !disabledByFieldset(node) && node.getClientRects().length > 0 && !node.closest('[inert],[hidden],[aria-hidden="true"]'));
}

export function useAssistantOverlayFocus(open: boolean, ref: RefObject<HTMLElement | null>, onDismiss: () => void, busy = false) {
  const restore = useRef(true), invoking = useRef<HTMLElement | null>(null);
  const layer = useTransientLayer({ root: ref, enabled: open, busy, restoreFocus: false, portals: () => [invoking.current],
    onClose: reason => { restore.current = reason !== 'outside' && reason !== 'navigation'; onDismiss(); } });
  useLayoutEffect(() => {
    const popup = ref.current;
    if (!open || !popup) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null; invoking.current = trigger;
    restore.current = true;
    const original = { maxWidth: popup.style.maxWidth, maxHeight: popup.style.maxHeight, translate: popup.style.translate, overflowY: popup.style.overflowY, boxSizing: popup.style.boxSizing };
    const position = () => {
      Object.assign(popup.style, original);
      const bounds = visibleAssistantViewport(), css = getComputedStyle(popup);
      const maxWidth = css.maxWidth, maxHeight = css.maxHeight;
      popup.style.boxSizing = 'border-box';
      popup.style.maxWidth = maxWidth && maxWidth !== 'none' ? `min(${maxWidth}, ${Math.max(1, bounds.width - 24)}px)` : `${Math.max(1, bounds.width - 24)}px`;
      popup.style.maxHeight = maxHeight && maxHeight !== 'none' ? `min(${maxHeight}, ${Math.max(1, bounds.height - 24)}px)` : `${Math.max(1, bounds.height - 24)}px`;
      popup.style.overflowY = 'auto';
      const shift = assistantOverlayShift(popup.getBoundingClientRect(), bounds);
      popup.style.translate = `${shift.x}px ${shift.y}px`;
    };
    position();
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(position);
    observer?.observe(popup);
    (popup.querySelector<HTMLElement>(ASSISTANT_FOCUSABLE) ?? popup).focus();
    return () => {
      window.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
      observer?.disconnect(); Object.assign(popup.style, original);
      if (restore.current && trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open, ref]);
  return layer;
}
