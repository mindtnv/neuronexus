'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NNIcon } from './ui';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';

// Mobile bottom tab bar — 5 primary sections.
const TABS = [
  { id: 'home', href: '/', labelKey: 'nav.home', icon: 'home' as const },
  { id: 'review', href: '/review', labelKey: 'nav.review', icon: 'bolt' as const },
  { id: 'decks', href: '/decks', labelKey: 'nav.decks', icon: 'stack' as const },
  { id: 'graph', href: '/graph', labelKey: 'nav.graph', icon: 'graph' as const },
  { id: 'garden', href: '/garden', labelKey: 'nav.garden', icon: 'garden' as const },
];

export const BottomTabs = () => {
  const pathname = usePathname() ?? '/';
  const t = useT();
  const cards = useNN((s) => s.cards);
  const dueCount = React.useMemo(() => {
    const now = Date.now();
    return cards.filter((c) => new Date(c.fsrs.due).getTime() <= now).length;
  }, [cards]);

  const activeTab =
    TABS.slice().reverse().find((tab) => (tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)))?.id ?? 'home';

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 68,
        paddingBottom: 'env(safe-area-inset-bottom, 4px)',
        background: 'rgba(10,11,13,0.92)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        zIndex: 40,
      }}
    >
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              color: active ? 'var(--lime-400)' : 'var(--text-dim)',
              padding: '8px 4px 4px',
              textDecoration: 'none',
              position: 'relative',
            }}
          >
            <NNIcon name={tab.icon} size={22} />
            <span style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: 0.1 }}>{t(tab.labelKey)}</span>
            {tab.id === 'review' && dueCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 'calc(50% - 24px)',
                  minWidth: 18,
                  height: 16,
                  padding: '0 4px',
                  borderRadius: 999,
                  background: 'var(--lime-500)',
                  color: '#0d1608',
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {dueCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
};

export default BottomTabs;
