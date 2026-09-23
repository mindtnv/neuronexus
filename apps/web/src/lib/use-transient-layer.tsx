'use client';
import { createContext, useContext, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useNN } from './store';
import { transientLayers, type CloseReason } from './layer-stack';

export const LayerParent = createContext<string | null | false>(null);
/** Keep a mounted pane's draft but suspend its guards while another pane is shown. */
export function ActiveLayerScope({ active, children }: { active: boolean; children: ReactNode }) {
  const parent = useContext(LayerParent);
  return <LayerParent.Provider value={active ? parent : false}>{children}</LayerParent.Provider>;
}
let currentWindow: Window | null = null;
let currentDocument: Document | null = null;
let cleanupEvents: (() => void) | null = null;

export function restoreLayerFocus(preferred: Element | null | undefined) {
  const usable = preferred instanceof HTMLElement && preferred !== document.body && preferred.isConnected
    && !preferred.matches(':disabled') && !preferred.closest('[inert]');
  const target = usable ? preferred : transientLayers.top()?.root() ?? document.querySelector<HTMLElement>('main,[role="main"],[data-layer-focus-fallback]');
  if (!target) return;
  if (!target.hasAttribute('tabindex') && !target.matches('button,input,textarea,select,a[href]')) target.tabIndex = -1;
  target.focus({ preventScroll: true });
}

function installEvents() {
  if (currentWindow === window && currentDocument === document) return;
  cleanupEvents?.(); currentWindow = window; currentDocument = document;
  const doc = document; let swallowClick = false;
  const key = (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229) return;
    const top = transientLayers.top();
    if (event.key === 'Tab' && top?.modal) {
      const roots = [top.root(), ...(top.portals?.() ?? [])].filter((root): root is HTMLElement => Boolean(root));
      const controls = roots.flatMap(root => [...root.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]')])
        .filter(node => !node.matches(':disabled') && node.tabIndex >= 0 && !node.closest('[inert],[aria-hidden="true"]') && node.getClientRects().length > 0);
      const first = controls[0] ?? top.root(), last = controls.at(-1) ?? first;
      if (!transientLayers.owns(top, doc.activeElement) || (event.shiftKey ? doc.activeElement === first : doc.activeElement === last)) {
        event.preventDefault(); event.stopImmediatePropagation(); (event.shiftKey ? last : first)?.focus({ preventScroll: true });
      }
      return;
    }
    if (event.key !== 'Escape') { swallowClick = false; return; }
    if (!transientLayers.hasLayers()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    void transientLayers.dismissTop('escape');
  };
  const outside = (event: PointerEvent) => {
    swallowClick = false;
    if (event.button !== 0) return;
    const layer = transientLayers.top(); if (!layer) return;
    const node = event.target as Node | null, root = layer.root();
    let inside = transientLayers.owns(layer, node);
    if (root?.tagName === 'DIALOG' && node === root) {
      const rect = root.getBoundingClientRect();
      inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    }
    if (inside) return;
    const dangerous = event.target instanceof Element && event.target.closest('[data-danger="true"],[data-destructive],.nn-btn-danger,[data-variant="danger"]');
    if (layer.modal || transientLayers.hasGuard(layer.id) || dangerous) {
      swallowClick = true; event.preventDefault(); event.stopImmediatePropagation();
    }
    void transientLayers.dismiss(layer.id, 'outside');
  };
  const click = (event: MouseEvent) => { if (swallowClick) { swallowClick = false; event.preventDefault(); event.stopImmediatePropagation(); } };
  doc.addEventListener('keydown', key, true); doc.addEventListener('pointerdown', outside, true); doc.addEventListener('click', click, true);
  cleanupEvents = () => { doc.removeEventListener('keydown', key, true); doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('click', click, true); };
}

export function useTransientLayer({ root, enabled = true, onClose, busy = false, modal = false, history = true, portals, parent, restoreFocus = true }: {
  root: RefObject<HTMLElement | null>; enabled?: boolean; onClose: (reason: CloseReason) => void;
  busy?: boolean; modal?: boolean; history?: boolean; portals?: () => Array<HTMLElement | null>;
  parent?: string | null;
  restoreFocus?: boolean;
}) {
  const owner = useNN(state => state.profile?.userId) ?? '', token = useId(), contextParent = useContext(LayerParent);
  const inherited = parent === undefined ? contextParent : parent;
  const id = `${owner}:${token}`;
  const live = useRef({ onClose, busy, portals }); live.current = { onClose, busy, portals };
  useLayoutEffect(() => {
    if (!enabled || inherited === false) return;
    installEvents();
    const invoker = document.activeElement;
    const parent = inherited ?? transientLayers.closest(invoker)?.id ?? null;
    return transientLayers.register({ id, owner, parent, root: () => root.current, portals: () => live.current.portals?.() ?? [], modal, history,
      canClose: () => !live.current.busy,
      close: reason => {
        live.current.onClose(reason);
        if (!restoreFocus || reason === 'outside' || reason === 'navigation' || useNN.getState().profile?.userId !== (owner || undefined)) return;
        restoreLayerFocus(invoker);
      },
    });
  }, [id, owner, enabled, inherited, root, modal, history, restoreFocus]);
  return { id, close: (reason: CloseReason = 'button') => transientLayers.dismiss(id, reason),
    contains: (node: Node | null) => { const layer = transientLayers.get(id); return Boolean(layer && transientLayers.owns(layer, node)); } };
}
