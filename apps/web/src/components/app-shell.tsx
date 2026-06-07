'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useNN } from '@/lib/store';
import { NNSidebar } from './shell';
import { BottomTabs } from './bottom-tabs';
import GlobalOverlays from './overlays/global-overlays';
import { ToastsStack } from './toasts';

export const AppShellWrapper = ({ children }: { children: React.ReactNode }) => {
  const bp = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const bootstrapped = useNN((s) => s.bootstrapped);

  // Track the previous pathname so we can detect real route changes (not first mount)
  const prevPathnameRef = useRef<string | null>(null);
  const [fadeKey, setFadeKey] = useState(0);

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

  // D1: tablet (720–1100px) gets the inline sidebar in collapsed (60px) mode
  const showSidebarInline = bp !== 'mobile';
  const showDrawer = bp === 'mobile' && drawerOpen;
  const showBottomTabs = bp === 'mobile';

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
            background: 'rgba(0,0,0,0.68)',
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
              boxShadow: '4px 0 32px rgba(0,0,0,0.6)',
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
