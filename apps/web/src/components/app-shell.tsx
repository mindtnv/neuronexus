'use client';

import React, { useEffect, useState } from 'react';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { NNSidebar } from './shell';
import { BottomTabs } from './bottom-tabs';
import GlobalOverlays from './overlays/global-overlays';
import { ToastsStack } from './toasts';

export const AppShellWrapper = ({ children }: { children: React.ReactNode }) => {
  const bp = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  // Close drawer when breakpoint returns to desktop or pathname changes effectively
  useEffect(() => {
    if (bp === 'desktop') setDrawerOpen(false);
  }, [bp]);

  const showSidebarInline = bp === 'desktop';
  const showDrawer = bp !== 'desktop' && drawerOpen;
  const showBottomTabs = bp === 'mobile';

  return (
    <div
      data-testid="app-shell"
      style={{
        display: 'flex',
        height: '100vh',
        minHeight: '100dvh',
        overflow: 'hidden',
        background: 'var(--bg)',
        position: 'relative',
      }}
    >
      {showSidebarInline && <NNSidebar />}

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
          paddingBottom: showBottomTabs ? 68 : 0,
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
      `}</style>
    </div>
  );
};

export default AppShellWrapper;
