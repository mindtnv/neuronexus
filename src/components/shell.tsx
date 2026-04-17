'use client';

import React, { CSSProperties, ReactNode, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NNBtn, NNIcon, NNKbd, NNLogo, IconName } from './ui';
import { useNN } from '@/lib/store';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';
import { LocaleToggle } from './locale-toggle';
import { aggregateCounts } from '@/lib/decks';

export type NavItem = {
  id: string;
  label: string;
  icon: IconName;
  href: string;
};

export const NN_NAV: NavItem[] = [
  { id: 'home', label: 'Home', icon: 'home', href: '/' },
  { id: 'review', label: 'Review', icon: 'bolt', href: '/review' },
  { id: 'graph', label: 'Graph', icon: 'graph', href: '/graph' },
  { id: 'decks', label: 'Decks', icon: 'stack', href: '/decks' },
  { id: 'garden', label: 'Garden', icon: 'garden', href: '/garden' },
  { id: 'editor', label: 'Editor', icon: 'edit', href: '/editor' },
  { id: 'stats', label: 'Stats', icon: 'graph', href: '/stats' },
  { id: 'settings', label: 'Settings', icon: 'settings', href: '/settings' },
];

const NAV_KEYS: Record<string, string> = {
  home: 'nav.home',
  review: 'nav.review',
  graph: 'nav.graph',
  decks: 'nav.decks',
  garden: 'nav.garden',
  editor: 'nav.editor',
  stats: 'nav.stats',
  settings: 'nav.settings',
};

const FALLBACK_RECENT: { name: string; count: number; color: 'amber' | 'violet' | 'sky' | 'rose' }[] = [
  { name: 'German vocab', count: 342, color: 'amber' },
  { name: 'System Design', count: 118, color: 'violet' },
  { name: 'Rust std lib', count: 87, color: 'sky' },
  { name: 'Cognitive biases', count: 64, color: 'rose' },
];

export const NNSidebar = ({
  active,
  collapsed,
  fullWidth,
}: {
  active?: string;
  collapsed?: boolean;
  fullWidth?: boolean;
}) => {
  const pathname = usePathname();
  const t = useT();
  const currentId =
    active ??
    (NN_NAV.slice()
      .reverse()
      .find((n) => (n.href === '/' ? pathname === '/' : pathname?.startsWith(n.href)))?.id ??
      'home');

  const bootstrapped = useNN((s) => s.bootstrapped);
  const decks = useNN((s) => s.decks);
  const cards = useNN((s) => s.cards);
  const profile = useNN((s) => s.profile);

  const dueCount = useMemo(() => {
    const now = Date.now();
    return cards.filter((c) => new Date(c.fsrs.due).getTime() <= now).length;
  }, [cards]);

  const recentDecks = useMemo(() => {
    if (!bootstrapped || decks.length === 0) return FALLBACK_RECENT.slice(0, 4);
    // Show root decks (those without a parent) with their aggregate card counts.
    const roots = decks.filter((d) => !d.parentId);
    const source = roots.length > 0 ? roots : decks;
    return source
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 4)
      .map((d) => ({
        name: d.name,
        color: (d.color === 'lime' || d.color === 'neutral' ? 'violet' : d.color) as
          | 'amber'
          | 'violet'
          | 'sky'
          | 'rose',
        count: aggregateCounts(decks, cards, d.id).total,
      }));
  }, [bootstrapped, decks, cards]);

  const totalCards = cards.length || 0;
  const workspaceName = t('app.workspace', { name: (profile?.name ?? 'Alex').toLowerCase() });
  const workspaceInitials = (profile?.name ?? 'Alex').slice(0, 2).toUpperCase();
  const streakDays = profile?.streakDays ?? 0;
  const nextLevel = (profile?.level ?? 1) + 1;

  return (
    <aside
      style={{
        width: fullWidth ? '100%' : collapsed ? 60 : 232,
        flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 180ms ease',
        height: '100%',
      }}
    >
      <div
        style={{
          padding: collapsed ? '18px 12px' : '18px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 61,
        }}
      >
        <NNLogo showText={!collapsed} />
      </div>

      {!collapsed && (
        <div style={{ padding: '12px 14px 4px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 8,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: 'linear-gradient(135deg, #9ad155, #55c4d6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                color: '#0a0b0d',
              }}
            >
              {workspaceInitials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)' }}>{workspaceName}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>
                free · {totalCards} {t(totalCards === 1 ? 'units.card' : 'units.cards')}
              </div>
            </div>
            <NNIcon name="chevd" size={12} color="var(--text-dim)" />
          </div>
        </div>
      )}

      <nav style={{ padding: collapsed ? '8px 6px' : '8px 10px', flex: 1, overflowY: 'auto' }}>
        {!collapsed && (
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 500,
              color: 'var(--text-dim)',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              padding: '10px 8px 6px',
            }}
          >
            {t('nav.workspace')}
          </div>
        )}
        {NN_NAV.map((item) => {
          const isActive = currentId === item.id;
          const badge = item.id === 'review' && dueCount > 0 ? dueCount : undefined;
          const label = t(NAV_KEYS[item.id] ?? `nav.${item.id}`);
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => window.dispatchEvent(new CustomEvent('nn:close-drawer'))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: collapsed ? '9px 0' : '8px 10px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: 8,
                marginBottom: 2,
                cursor: 'pointer',
                background: isActive ? 'var(--surface-3)' : 'transparent',
                color: isActive ? 'var(--text)' : 'var(--text-muted)',
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: -0.1,
                position: 'relative',
                textDecoration: 'none',
              }}
            >
              <NNIcon name={item.icon} size={16} />
              {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
              {!collapsed && badge != null && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    background: 'var(--lime-500)',
                    color: '#0d1608',
                    padding: '2px 6px',
                    borderRadius: 999,
                    minWidth: 20,
                    textAlign: 'center',
                  }}
                >
                  {badge}
                </span>
              )}
              {collapsed && badge != null && (
                <span
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    background: 'var(--lime-500)',
                  }}
                />
              )}
            </Link>
          );
        })}

        {!collapsed && (
          <>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 500,
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                padding: '20px 8px 6px',
              }}
            >
              {t('nav.recentDecks')}
            </div>
            {recentDecks.map((d) => (
              <div
                key={d.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 10px',
                  borderRadius: 8,
                  marginBottom: 1,
                  color: 'var(--text-muted)',
                  fontSize: 12.5,
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: 7, height: 7, borderRadius: 2, background: `var(--${d.color}-500)` }} />
                <span style={{ flex: 1 }}>{d.name}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: 11 }} className="mono">
                  {d.count}
                </span>
              </div>
            ))}
          </>
        )}
      </nav>

      {!collapsed && (
        <div style={{ padding: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(232,154,43,0.12), rgba(243,182,85,0.06))',
              border: '1px solid rgba(243,182,85,0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 22 }}>
              <NNIcon name="flame" size={22} color="var(--amber-500)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                {t('streak.dayStreak', { days: streakDays })}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t('streak.nextLevel', { n: nextLevel })}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 2px 0' }}>
            <LocaleToggle size="sm" />
            <Link
              href="/screens"
              onClick={() => window.dispatchEvent(new CustomEvent('nn:close-drawer'))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 6px',
                color: 'var(--text-dim)',
                fontSize: 10.5,
                textDecoration: 'none',
                letterSpacing: 0.2,
              }}
            >
              <span>{t('nav.allScreens')}</span>
              <NNIcon name="arrow" size={11} color="var(--text-dim)" />
            </Link>
          </div>
        </div>
      )}
    </aside>
  );
};

export const NNTopbar = ({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) => {
  const bp = useBreakpoint();
  const t = useT();
  const isDesktop = bp === 'desktop';
  const isMobile = bp === 'mobile';
  return (
    <header
      style={{
        height: isMobile ? 54 : 61,
        padding: isMobile ? '0 12px' : '0 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: isMobile ? 8 : 16,
        background: 'var(--bg)',
        flexShrink: 0,
      }}
    >
      {!isDesktop && (
        <button
          type="button"
          aria-label={t('topbar.menuLabel')}
          onClick={() => window.dispatchEvent(new CustomEvent('nn:open-drawer'))}
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <NNIcon name="stack" size={16} color="var(--text)" />
        </button>
      )}
      <div style={{ flex: 1, display: 'flex', alignItems: isMobile ? 'center' : 'baseline', gap: isMobile ? 0 : 12, minWidth: 0, flexDirection: isMobile ? 'column' : 'row' }}>
        <h1
          style={{
            margin: 0,
            fontSize: isMobile ? 15 : 18,
            fontWeight: 600,
            letterSpacing: -0.3,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%',
            alignSelf: isMobile ? 'flex-start' : undefined,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <span
            style={{
              fontSize: isMobile ? 11 : 13,
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
              alignSelf: isMobile ? 'flex-start' : undefined,
            }}
          >
            {subtitle}
          </span>
        )}
      </div>
      {isDesktop ? (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('nn:open-palette'))}
          style={{
            height: 34,
            minWidth: 260,
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 9,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <NNIcon name="search" size={14} color="var(--text-dim)" />
          <span style={{ fontSize: 13, color: 'var(--text-dim)', flex: 1, textAlign: 'left' }}>{t('topbar.searchPlaceholder')}</span>
          <NNKbd>⌘K</NNKbd>
        </button>
      ) : (
        <button
          type="button"
          aria-label={t('topbar.searchLabel')}
          onClick={() => window.dispatchEvent(new CustomEvent('nn:open-palette'))}
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <NNIcon name="search" size={16} color="var(--text)" />
        </button>
      )}
      {isDesktop && actions}
      {isDesktop ? (
        <Link href="/editor">
          <NNBtn size="md" variant="primary" icon="plus">
            {t('topbar.newCard')}
          </NNBtn>
        </Link>
      ) : (
        <Link href="/editor" aria-label={t('topbar.newCardLabel')} style={{ display: 'inline-flex' }}>
          <button
            type="button"
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: 'var(--lime-500)',
              color: '#0d1608',
              border: '1px solid var(--lime-500)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <NNIcon name="plus" size={16} color="#0d1608" />
          </button>
        </Link>
      )}
    </header>
  );
};

export const AppShell = ({
  title,
  subtitle,
  actions,
  active,
  children,
  style,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  active?: string;
  children?: ReactNode;
  style?: CSSProperties;
}) => (
  <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)', ...style }}>
    <NNSidebar active={active} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      <NNTopbar title={title} subtitle={subtitle} actions={actions} />
      {children}
    </div>
  </div>
);
