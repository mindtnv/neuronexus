'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useNN } from '@/lib/store';
import { useUI, readSidebarCollapsed, detectDisplayMode, readWindowControlsOverlay } from '@/lib/ui-store';
import { NNSidebar } from './shell';
import { BottomTabs } from './bottom-tabs';
import GlobalOverlays from './overlays/global-overlays';
import { ToastsStack, raiseToast } from './toasts';

export const AppShellWrapper = ({ children }: { children: React.ReactNode }) => {
  const bp = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const bootstrapped = useNN((s) => s.bootstrapped);
  const sidebarCollapsed = useUI((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUI((s) => s.setSidebarCollapsed);
  const zenMode = useUI((s) => s.zenMode);
  const setZen = useUI((s) => s.setZen);

  // Track the previous pathname so we can detect real route changes (not first mount)
  const prevPathnameRef = useRef<string | null>(null);
  const [fadeKey, setFadeKey] = useState(0);

  // Hydrate the persisted sidebar preference on mount (client-only) so SSR/first
  // paint always renders the default (false) and we never get a hydration
  // mismatch. readSidebarCollapsed is try/catch-guarded → no-throw.
  useEffect(() => {
    const persisted = readSidebarCollapsed();
    if (persisted !== null) setSidebarCollapsed(persisted);
  }, [setSidebarCollapsed]);

  // Zen is /review-only: leaving /review (route change) auto-exits focus mode.
  useEffect(() => {
    if (zenMode && pathname !== '/review') setZen(false);
  }, [pathname, zenMode, setZen]);

  // One-time WCO onboarding hint: Chromium only merges the app into the window
  // titlebar after the user clicks the ⌄ toggle (then the choice persists), and
  // that affordance is easy to miss. If this is an installed desktop PWA where
  // the overlay is AVAILABLE but not enabled, nudge once via an info toast.
  // All conditions are read at fire time (3 s after mount) — the overlay state
  // resolves asynchronously, so checking navigator directly avoids stale state.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem('nn:wco:hint') === '1') return;
        if (detectDisplayMode(window, navigator) !== 'standalone') return;
        const hasWco = (navigator as Navigator & { windowControlsOverlay?: unknown }).windowControlsOverlay != null;
        const { active } = readWindowControlsOverlay(navigator);
        if (!hasWco || active) return;
        raiseToast({ kind: 'info', titleKey: 'chrome.wcoHintTitle', descriptionKey: 'chrome.wcoHint', durationMs: 12000 });
        window.localStorage.setItem('nn:wco:hint', '1');
      } catch {
        // localStorage unavailable — skip the hint, never crash the shell.
      }
    }, 3000);
    return () => window.clearTimeout(timer);
  }, []);

  // Listen for global "open drawer" event so the mobile topbar can trigger it without prop drilling
  useEffect(() => {
    const open = () => setDrawerOpen(true);
    const close = () => setDrawerOpen(false);
    window.addEventListener('nn:open-drawer', open);
    window.addEventListener('nn:close-drawer', close);
    return () => {
      window.removeEventListener('nn:open-drawer', open);
      window.removeEventListener('nn:close-drawer', close);
    };
  }, []);

  // Close drawer when breakpoint returns to non-mobile (D1: tablet gets inline sidebar)
  useEffect(() => {
    if (bp !== 'mobile') setDrawerOpen(false);
  }, [bp]);

  // D2: trigger crossfade only after bootstrap + on actual pathname changes
  useEffect(() => {
    if (!bootstrapped) {
      // Record current pathname so the first post-bootstrap navigation can compare
      prevPathnameRef.current = pathname;
      return;
    }
    if (prevPathnameRef.current === null) {
      prevPathnameRef.current = pathname;
      return;
    }
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      setFadeKey((k) => k + 1);
    }
  }, [pathname, bootstrapped]);

  // D1: tablet (720–1100px) gets the inline sidebar in collapsed (60px) mode.
  // Sidebar is fully hidden in zen mode or when the user collapsed it (desktop
  // toggle / ⌘B) — content reflows to full width (the content div is already flex:1).
  const showSidebarInline = bp !== 'mobile' && !zenMode && !sidebarCollapsed;
  const showDrawer = bp === 'mobile' && drawerOpen;
  const showBottomTabs = bp === 'mobile' && !zenMode;

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        minHeight: '100dvh',
        overflow: 'hidden',
        background: 'var(--bg)',
        position: 'relative',
      }}
    >
      {showSidebarInline && <NNSidebar collapsed={bp === 'tablet'} />}

      {/* D2: opacity-only crossfade on route change, gated behind bootstrapped */}
      <div
        key={bootstrapped ? fadeKey : 'skeleton'}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
          paddingBottom: showBottomTabs ? 68 : 0,
          animation: bootstrapped && fadeKey > 0 ? 'nn-page-fade 150ms ease' : undefined,
        }}
      >
        {children}
      </div>

      {showDrawer && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--scrim-strong)',
            zIndex: 80,
            display: 'flex',
            animation: 'nn-fade-in 140ms ease',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 260,
              maxWidth: '86vw',
              height: '100%',
              boxShadow: '4px 0 32px var(--scrim-strong)',
              animation: 'nn-slide-in 200ms ease',
              display: 'flex',
            }}
          >
            <NNSidebar fullWidth />
          </div>
        </div>
      )}

      {showBottomTabs && !drawerOpen && <BottomTabs />}

      <GlobalOverlays />
      <ToastsStack />

      <style>{`
        @keyframes nn-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes nn-slide-in { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        @keyframes nn-page-fade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
};

export default AppShellWrapper;
