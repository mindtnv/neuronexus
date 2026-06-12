'use client';

import React, { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { NNBtn, NNIcon, NNLogo } from './ui';
import { APP_NAV, FOOTER_NAV, NAV_SECTIONS, NAV_SECTION_LABEL, getActiveNavId, type AppNavItem } from './nav-config';
import { countDueCards } from '@/lib/cards';
import { signOut } from '@/lib/auth';
import { useNN } from '@/lib/store';
import { useUI, useDisplayMode } from '@/lib/ui-store';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';
import { LocaleToggle } from './locale-toggle';

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
  const currentId = active ?? getActiveNavId(pathname, [...APP_NAV, ...FOOTER_NAV]);
  const resetStore = useNN((s) => s.reset);

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      resetStore();
      router.replace('/auth/sign-in');
    }
  };

  const cards = useNN((s) => s.cards);
  const dueCount = useNN((s) => countDueCards(s.cards));
  const profile = useNN((s) => s.profile);

  const totalCards = cards.length || 0;
  const workspaceName = t('app.workspace', { name: (profile?.name ?? 'Alex').toLowerCase() });
  const workspaceInitials = (profile?.name ?? 'Alex').slice(0, 2).toUpperCase();

  return (
    <aside
      className="nn-chrome"
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
          // Match the NNTopbar height (44px content + 1px border = 45px total,
          // border-box here) so the sidebar logo plate and the toolbar share one
          // continuous bottom hairline instead of a 16px step at the corner.
          padding: collapsed ? '0 12px' : '0 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 45,
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
                {totalCards} {t(totalCards === 1 ? 'units.card' : 'units.cards')}
              </div>
            </div>
          </div>
        </div>
      )}

      <nav style={{ padding: collapsed ? '8px 6px' : '8px 10px', flex: 1, overflowY: 'auto' }}>
        {NAV_SECTIONS.map((section) => {
          const items = APP_NAV.filter((item) => item.section === section);
          if (items.length === 0) return null;
          const labelKey = NAV_SECTION_LABEL[section];
          return (
            <React.Fragment key={section}>
              {!collapsed && labelKey && (
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 500,
                    color: 'var(--text-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.8,
                    padding: '14px 8px 6px',
                  }}
                >
                  {t(labelKey)}
                </div>
              )}
              {collapsed && labelKey && (
                <div style={{ height: 1, background: 'var(--border)', margin: '8px 6px' }} />
              )}
              {items.map((item) =>
                renderNavItem({ item, isActive: currentId === item.id, badge: item.id === 'review' && dueCount > 0 ? dueCount : undefined, collapsed, label: t(item.labelKey) }),
              )}
            </React.Fragment>
          );
        })}

        {/* Stats + Settings — pinned below the sections behind a thin divider. */}
        <div style={{ height: 1, background: 'var(--border)', margin: collapsed ? '10px 6px' : '12px 4px' }} />
        {FOOTER_NAV.map((item) =>
          renderNavItem({ item, isActive: currentId === item.id, collapsed, label: t(item.labelKey) }),
        )}
      </nav>

      {!collapsed && (
        <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
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
  const zenMode = useUI((s) => s.zenMode);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const displayMode = useDisplayMode();
  const isDesktop = bp === 'desktop';
  const isMobile = bp === 'mobile';

  // Zen (focus) mode hides the whole chrome — the per-page topbar disappears.
  // Zen is only ever true on /review (guarded in app-shell), so this is safe.
  if (zenMode) return null;

  return (
    <header
      className="nn-chrome"
      style={{
        height: isMobile ? 48 : 44,
        padding: isMobile ? '0 12px' : '0 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: isMobile ? 8 : 16,
        background: 'var(--surface)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        // Standalone PWA only: pad past the device top inset. A normal browser
        // tab already places the status/URL bar inside that inset, so padding it
        // unconditionally on mobile would double-pad.
        paddingTop: displayMode === 'standalone' ? 'env(safe-area-inset-top, 0px)' : undefined,
        boxSizing: 'content-box',
        flexShrink: 0,
      }}
    >
      {isDesktop && (
        <button
          type="button"
          aria-label={t('chrome.toggleSidebar')}
          title={`${t('chrome.toggleSidebar')} (⌘B)`}
          onClick={() => toggleSidebar()}
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
            fontSize: isMobile ? 13 : 14,
            fontWeight: isMobile ? 600 : 500,
            letterSpacing: 0,
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
            className="mono"
            style={{
              fontSize: 11,
              color: 'var(--text-dim)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              alignSelf: isMobile ? 'flex-start' : undefined,
            }}
          >
            {subtitle}
          </span>
        )}
      </div>
      <button
        type="button"
        aria-label={t('topbar.searchLabel')}
        title={t('topbar.searchPlaceholder')}
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
      {isDesktop && actions}
      {isDesktop ? (
        <Link href="/editor" style={{ display: 'inline-flex' }}>
          <NNBtn
            size="md"
            variant="soft"
            icon="plus"
            title={t('topbar.newCard')}
            ariaLabel={t('topbar.newCard')}
            style={{ width: 36, padding: 0 }}
          />
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
