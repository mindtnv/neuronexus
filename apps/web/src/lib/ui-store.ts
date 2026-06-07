'use client';

import { create } from 'zustand';
import { useEffect, useState } from 'react';

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
