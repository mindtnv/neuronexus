'use client';

import { create } from 'zustand';
import { useEffect, useState } from 'react';
import { useBreakpoint } from './use-breakpoint';

// UI-only / ephemeral+pref store, separate from the `useNN` server mirror.
// Holds chrome preferences that never touch the API:
//   - `sidebarCollapsed`: desktop sidebar fully hidden; persisted to
//     localStorage so the choice survives reloads.
//   - `zenMode`: /review focus mode; ephemeral (never persisted), auto-exits
//     when leaving /review (see app-shell.tsx).
//
// SSR-safe: the store always initializes to `false`. localStorage is NEVER read
// at module top-level — the sidebar pref is hydrated in a mount effect
// (AppShellWrapper) to avoid a server/client hydration mismatch. All
// localStorage access is try/catch-guarded so a throwing/absent storage is a
// no-op.

const SIDEBAR_KEY = 'nn:sidebar-collapsed';

function persistSidebar(collapsed: boolean): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  } catch {
    // localStorage unavailable / quota / disabled — best-effort, ignore.
  }
}

/** Read the persisted sidebar pref. Returns `null` when unavailable/unset. */
export function readSidebarCollapsed(): boolean | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(SIDEBAR_KEY);
    if (raw === '1') return true;
    if (raw === '0') return false;
    return null;
  } catch {
    return null;
  }
}

interface UIState {
  /** Desktop sidebar fully hidden (persisted). */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;

  /** /review focus mode — ephemeral, never persisted. */
  zenMode: boolean;
  toggleZen: () => void;
  setZen: (v: boolean) => void;
}

export const useUI = create<UIState>((set, get) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    persistSidebar(next);
    set({ sidebarCollapsed: next });
  },
  setSidebarCollapsed: (v: boolean) => {
    persistSidebar(v);
    set({ sidebarCollapsed: v });
  },

  zenMode: false,
  toggleZen: () => set((s) => ({ zenMode: !s.zenMode })),
  setZen: (v: boolean) => set({ zenMode: v }),
}));

// ── Display mode (PWA standalone vs browser tab) ─────────────────────────────
//
// SSR-safe like the sidebar pref: never read matchMedia at module top-level.
// `detectDisplayMode` is a pure, synchronous helper (win/nav passed as args) so
// it is trivially unit-testable; `useDisplayMode` is the thin React wrapper that
// defaults to 'browser' on first paint and resolves the real value in a mount
// effect (no hydration mismatch).

export type DisplayMode = 'standalone' | 'browser';

/** Pure detector — returns 'standalone' for installed PWAs, else 'browser'. */
export function detectDisplayMode(win: Window | undefined, nav: Navigator | undefined): DisplayMode {
  if (!win || typeof win.matchMedia !== 'function') return 'browser';
  try {
    if (win.matchMedia('(display-mode: standalone)').matches) return 'standalone';
  } catch {
    // matchMedia can throw on malformed queries / locked-down environments.
  }
  // iOS Safari exposes standalone PWAs via `navigator.standalone`.
  if (nav && (nav as Navigator & { standalone?: boolean }).standalone === true) return 'standalone';
  return 'browser';
}

// ── Window Controls Overlay (installed desktop PWA) ─────────────────────────
//
// With `display_override: ['window-controls-overlay']` in the manifest, a
// Chromium-installed PWA can extend the viewport into the OS titlebar: the
// window controls (macOS traffic lights / Windows ✕▢―) float OVER the page and
// `navigator.windowControlsOverlay` reports the free titlebar strip. The app
// chrome (topbar + sidebar logo plate) then doubles as the titlebar — top strips
// get `data-wco="1"` (drag region, see globals.css) and shift their content out
// from under the controls using the geometry below. Same SSR-safe pattern as
// useDisplayMode: inactive on first paint, resolved in a mount effect.

export interface TitlebarAreaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WcoNavigator extends Navigator {
  windowControlsOverlay?: EventTarget & {
    visible: boolean;
    getTitlebarAreaRect: () => TitlebarAreaRect;
  };
}

/** Pure detector — active only when the overlay is actually visible (user-toggleable in Chrome). */
export function readWindowControlsOverlay(nav: Navigator | undefined): {
  active: boolean;
  rect: TitlebarAreaRect | null;
} {
  const wco = (nav as WcoNavigator | undefined)?.windowControlsOverlay;
  if (!wco || wco.visible !== true) return { active: false, rect: null };
  try {
    const r = wco.getTitlebarAreaRect();
    return { active: true, rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
  } catch {
    // Geometry unavailable — still draggable, callers just skip the insets.
    return { active: true, rect: null };
  }
}

/**
 * Pure inset math. `leftOffset` = width of whatever chrome sits LEFT of the
 * strip (the inline sidebar) — the controls may already be covered by it.
 * Left inset clears left-side controls (macOS), right inset clears right-side
 * controls (Windows/Linux: rect.x = 0, free strip ends before the buttons).
 */
export function wcoTopInsets(
  rect: TitlebarAreaRect,
  viewportWidth: number,
  leftOffset: number,
): { left: number; right: number } {
  return {
    left: Math.max(0, rect.x - leftOffset),
    right: Math.max(0, viewportWidth - rect.x - rect.width),
  };
}

interface WcoState {
  active: boolean;
  rect: TitlebarAreaRect | null;
  viewportWidth: number;
}

/** React hook — inactive on first render; follows `geometrychange` + window resize. */
export function useWindowControlsOverlay(): WcoState {
  const [state, setState] = useState<WcoState>({ active: false, rect: null, viewportWidth: 0 });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    const update = () => {
      const { active, rect } = readWindowControlsOverlay(navigator);
      setState({ active, rect, viewportWidth: window.innerWidth });
    };
    update();
    const wco = (navigator as WcoNavigator).windowControlsOverlay;
    try {
      wco?.addEventListener('geometrychange', update);
    } catch {
      // EventTarget surface missing in odd embedders — resize still covers us.
    }
    window.addEventListener('resize', update);
    return () => {
      try {
        wco?.removeEventListener('geometrychange', update);
      } catch {
        // ignore
      }
      window.removeEventListener('resize', update);
    };
  }, []);

  return state;
}

// Inline-sidebar widths (shell.tsx renders from these same constants).
export const SIDEBAR_WIDTH_EXPANDED = 232;
export const SIDEBAR_WIDTH_COLLAPSED = 60;

/**
 * Convenience for top-of-window strips: how far to pad so content clears the
 * overlaid window controls. `fullBleed` = the route renders WITHOUT the inline
 * sidebar (e.g. /library/[id]), so the strip starts at the window's left edge.
 */
export function useWcoTopInsets(fullBleed = false): { wco: boolean; left: number; right: number } {
  const { active, rect, viewportWidth } = useWindowControlsOverlay();
  const bp = useBreakpoint();
  const sidebarCollapsed = useUI((s) => s.sidebarCollapsed);
  const zenMode = useUI((s) => s.zenMode);
  if (!active || !rect) return { wco: active, left: 0, right: 0 };
  const sidebarWidth =
    fullBleed || bp === 'mobile' || zenMode || sidebarCollapsed
      ? 0
      : bp === 'tablet'
        ? SIDEBAR_WIDTH_COLLAPSED
        : SIDEBAR_WIDTH_EXPANDED;
  const { left, right } = wcoTopInsets(rect, viewportWidth, sidebarWidth);
  return { wco: true, left, right };
}

/** React hook — 'browser' on first render, resolves to the detected value after mount. */
export function useDisplayMode(): DisplayMode {
  const [mode, setMode] = useState<DisplayMode>('browser');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setMode(detectDisplayMode(window, navigator));

    let mql: MediaQueryList | null = null;
    const onChange = () => setMode(detectDisplayMode(window, navigator));
    try {
      mql = window.matchMedia('(display-mode: standalone)');
      mql.addEventListener('change', onChange);
    } catch {
      // matchMedia unavailable / throwing — leave mode at its current value.
    }
    return () => {
      try {
        mql?.removeEventListener('change', onChange);
      } catch {
        // ignore
      }
    };
  }, []);

  return mode;
}
