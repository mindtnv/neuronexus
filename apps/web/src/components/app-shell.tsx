'use client';

import React, { useEffect, useLayoutEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useNN } from '@/lib/store';
import { useUI, readSidebarCollapsed, detectDisplayMode, readWindowControlsOverlay } from '@/lib/ui-store';
import { NNSidebar } from './shell';
import { BottomTabs } from './bottom-tabs';
import GlobalOverlays from './overlays/global-overlays';
import { ToastsStack, raiseToast } from './toasts';
import { NNLoadError } from './ui';

const AppShellContent = ({ children }: { children: React.ReactNode }) => {
  const bp = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const sidebarCollapsed = useUI((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUI((s) => s.setSidebarCollapsed);
  const zenMode = useUI((s) => s.zenMode);
  const setZen = useUI((s) => s.setZen);
  const bootstrapStatus = useNN((s) => s.bootstrapStatus);
  const bootstrapError = useNN((s) => s.bootstrapError);
  const bootstrap = useNN((s) => s.bootstrap);

  // Resolve the persisted preference before the browser paints the hydrated
  // shell. The server markup remains deterministic, while the first visible
  // client frame already has the user's actual sidebar choice.
  useLayoutEffect(() => {
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

  return (
    <div
      className="nn-app-shell"
      style={{
        display: 'flex',
        height: '100vh',
        minHeight: '100dvh',
        overflow: 'hidden',
        background: 'var(--bg)',
        position: 'relative',
      }}
    >
      {!zenMode && !sidebarCollapsed ? (
        <div className="nn-app-sidebar-slot">
          <NNSidebar responsive />
        </div>
      ) : null}

      <div
        className="nn-route-slot"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {bootstrapStatus === 'error' ? (
          <div
            style={{
              flex: 1,
              display: 'grid',
              placeItems: 'center',
              padding: 24,
              overflow: 'auto',
            }}
          >
            <div style={{ width: 'min(520px, 100%)' }}>
              <NNLoadError
                title="Не удалось загрузить данные"
                description="Проверь соединение и повтори попытку. Введённые локально данные не будут очищены."
                retryLabel="Повторить"
                requestId={bootstrapError?.requestId}
                onRetry={() => void bootstrap().catch(() => {})}
              />
            </div>
          </div>
        ) : children}
      </div>

      {drawerOpen ? (
        <div
          className="nn-mobile-drawer-backdrop"
          onClick={() => setDrawerOpen(false)}
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--scrim-strong)',
            zIndex: 80,
            display: 'flex',
          }}
        >
          <div
            className="nn-mobile-drawer-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            style={{
              width: 260,
              maxWidth: '86vw',
              height: '100%',
              boxShadow: '4px 0 32px var(--scrim-strong)',
              display: 'flex',
            }}
          >
            <NNSidebar fullWidth />
          </div>
        </div>
      ) : null}

      {!zenMode && !drawerOpen ? <BottomTabs /> : null}

      <GlobalOverlays />
      <ToastsStack />
    </div>
  );
};

export const AppShellWrapper = AppShellContent;

export default AppShellWrapper;
