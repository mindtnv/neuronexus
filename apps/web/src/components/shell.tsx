'use client';

import React, { CSSProperties, ReactNode, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { NNBtn, NNIcon, NNKbd, NNLogo } from './ui';
import { APP_NAV, NAV_SECTIONS, NAV_SECTION_LABEL, SETTINGS_NAV, getActiveNavId, type AppNavItem } from './nav-config';
import { countDueCards } from '@/lib/cards';
import { signOut } from '@/lib/auth';
import { useNN } from '@/lib/store';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';
import { LocaleToggle } from './locale-toggle';
import { aggregateCounts } from '@/lib/decks';

// Single nav-item row. Shared across grouped sections + the pinned Settings item.
const renderNavItem = ({
  item,
  isActive,
  badge,
  collapsed,
  label,
}: {
  item: AppNavItem;
  isActive: boolean;
  badge?: number;
  collapsed?: boolean;
  label: string;
}) => (
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
  const router = useRouter();
  const t = useT();
  const currentId = active ?? getActiveNavId(pathname, APP_NAV);
  const resetStore = useNN((s) => s.reset);

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      resetStore();
      router.replace('/auth/sign-in');
    }
  };

  const bootstrapped = useNN((s) => s.bootstrapped);
  const decks = useNN((s) => s.decks);
  const cards = useNN((s) => s.cards);
  const dueCount = useNN((s) => countDueCards(s.cards));
  const profile = useNN((s) => s.profile);

  const recentDecks = useMemo(() => {
    if (!bootstrapped || decks.length === 0) return [];
    // Show root decks (those without a parent) with their aggregate card counts.
    const roots = decks.filter((d) => !d.parentId);
    const source = roots.length > 0 ? roots : decks;
    return source
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 4)
      .map((d) => ({
        id: d.id,
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
        {NAV_SECTIONS.map((section) => {
          const items = APP_NAV.filter((item) => item.section === section);
          if (items.length === 0) return null;
          return (
            <React.Fragment key={section}>
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
                  {t(NAV_SECTION_LABEL[section])}
                </div>
              )}
              {items.map((item) =>
                renderNavItem({ item, isActive: currentId === item.id, badge: item.id === 'review' && dueCount > 0 ? dueCount : undefined, collapsed, label: t(item.labelKey) }),
              )}
            </React.Fragment>
          );
        })}

        {/* Settings — pinned below the sections behind a thin divider. */}
        <div style={{ height: 1, background: 'var(--border)', margin: collapsed ? '10px 6px' : '10px 4px' }} />
        {renderNavItem({ item: SETTINGS_NAV, isActive: currentId === SETTINGS_NAV.id, collapsed, label: t(SETTINGS_NAV.labelKey) })}

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
            {recentDecks.length > 0 ? (
              recentDecks.map((d) => (
                <Link
                  key={d.id}
                  href={`/cards?q=${encodeURIComponent(`deck:${JSON.stringify(d.name)}`)}`}
                  onClick={() => window.dispatchEvent(new CustomEvent('nn:close-drawer'))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '7px 10px',
                    borderRadius: 8,
                    marginBottom: 1,
                    color: 'var(--text-muted)',
                    fontSize: 12.5,
                    textDecoration: 'none',
                  }}
                >
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: `var(--${d.color}-500)` }} />
                  <span style={{ flex: 1 }}>{d.name}</span>
                  <span style={{ color: 'var(--text-dim)', fontSize: 11 }} className="mono">
                    {d.count}
                  </span>
                </Link>
              ))
            ) : (
              <Link
                href="/decks"
                onClick={() => window.dispatchEvent(new CustomEvent('nn:close-drawer'))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 8,
                  color: 'var(--text-dim)',
                  fontSize: 12,
                  textDecoration: 'none',
                  border: '1px dashed var(--border-2)',
                }}
              >
                <NNIcon name="plus" size={12} color="var(--text-dim)" />
                <span>Создать первую колоду</span>
              </Link>
            )}
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
            <button
              type="button"
              onClick={handleSignOut}
              title={t('auth.signOut')}
              aria-label={t('auth.signOut')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-muted)',
                fontSize: 11.5,
                cursor: 'pointer',
                letterSpacing: 0.1,
                fontFamily: 'inherit',
              }}
            >
              <NNIcon name="x" size={12} color="var(--text-muted)" />
              <span>{t('auth.signOut')}</span>
            </button>
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
