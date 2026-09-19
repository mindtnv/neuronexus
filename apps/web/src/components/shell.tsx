'use client';

import React, { CSSProperties, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { NNIcon, NNLogo } from './ui';
import { AppLink, useAppNavigation } from './navigation';
import { APP_NAV, FOOTER_NAV, NAV_SECTIONS, NAV_SECTION_LABEL, getActiveNavId, type AppNavItem } from './nav-config';
import { useStudyOverview } from '@/lib/use-study-overview';
import { signOut } from '@/lib/auth';
import { useNN } from '@/lib/store';
import {
  useUI,
  useDisplayMode,
  useWcoTopInsets,
  useWindowControlsOverlay,
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
} from '@/lib/ui-store';
import { useT } from '@/lib/i18n';
import { LocaleToggle } from './locale-toggle';

// Single nav-item row. Shared across grouped sections + the pinned Settings item.
const renderNavItem = ({
  item,
  isActive,
  badge,
  collapsed,
  responsive,
  label,
}: {
  item: AppNavItem;
  isActive: boolean;
  badge?: number;
  collapsed?: boolean;
  responsive?: boolean;
  label: string;
}) => (
  <AppLink
    key={item.id}
    href={item.href}
    className="nn-sidebar-nav-item"
    title={label}
    aria-label={label}
    aria-current={isActive ? 'page' : undefined}
    onClick={() => window.dispatchEvent(new CustomEvent('nn:close-drawer'))}
  >
    <span className="nn-sidebar-nav-icon" aria-hidden="true">
      <NNIcon name={item.icon} size={20} strokeWidth={1.75} />
    </span>
    {(!collapsed || responsive) && <span className="nn-sidebar-label">{label}</span>}
    {(!collapsed || responsive) && badge != null && (
      <span className="nn-sidebar-badge">{badge}</span>
    )}
    {(collapsed || responsive) && badge != null && (
      <span className="nn-sidebar-badge-dot" aria-hidden="true" />
    )}
  </AppLink>
);

export const NNSidebar = ({
  active,
  collapsed,
  fullWidth,
  responsive,
}: {
  active?: string;
  collapsed?: boolean;
  fullWidth?: boolean;
  responsive?: boolean;
}) => {
  const pathname = usePathname();
  const router = useAppNavigation();
  const t = useT();
  const currentId = active ?? getActiveNavId(pathname, [...APP_NAV, ...FOOTER_NAV]);
  const resetStore = useNN((s) => s.reset);

  const handleSignOut = async () => {
    if (!(await router.confirmLeave())) return;
    try {
      await signOut();
    } finally {
      resetStore();
      router.replace('/auth/sign-in');
    }
  };

  const study = useStudyOverview();
  const dueCount = study.data?.overall.totalAvailable ?? 0;
  const profile = useNN((s) => s.profile);

  // Leave the installed PWA's traffic-light area clear and draggable.
  const { active: wcoActive } = useWindowControlsOverlay();

  const totalCards = study.data?.overall.total ?? '—';
  const workspaceName = t('app.workspace', { name: (profile?.name ?? '…').toLowerCase() });
  const workspaceInitials = (profile?.name ?? '').slice(0, 2).toUpperCase();

  return (
    <aside
      className={`nn-chrome nn-sidebar${responsive ? ' nn-sidebar-responsive' : ''}`}
      data-collapsed={collapsed ? '1' : undefined}
      style={{
        width: fullWidth ? '100%' : responsive ? undefined : collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
      }}
    >
      <div className="nn-sidebar-brand" data-wco={wcoActive ? '1' : undefined}>
        {!wcoActive && responsive ? (
          <>
            <span className="nn-sidebar-logo-expanded"><NNLogo /></span>
            <span className="nn-sidebar-logo-compact"><NNLogo showText={false} /></span>
          </>
        ) : !wcoActive ? <NNLogo showText={!collapsed} /> : null}
      </div>

      {(!collapsed || responsive) && (
        <div className="nn-sidebar-expanded-only nn-sidebar-workspace">
          <div className="nn-sidebar-avatar" aria-hidden="true">{workspaceInitials}</div>
          <div className="nn-sidebar-workspace-copy">
            <div className="nn-sidebar-workspace-name" title={workspaceName}>{workspaceName}</div>
            <div className="nn-sidebar-workspace-meta">
              {t('app.cardCount', { n: totalCards })}
            </div>
          </div>
        </div>
      )}

      <nav className="nn-sidebar-navigation" aria-label={t('topbar.menuLabel')}>
        <div className="nn-sidebar-primary">
          {NAV_SECTIONS.map((section) => {
            const items = APP_NAV.filter((item) => item.section === section);
            if (items.length === 0) return null;
            const labelKey = NAV_SECTION_LABEL[section];
            return (
              <React.Fragment key={section}>
                {(!collapsed || responsive) && labelKey && (
                  <div className="nn-sidebar-section-label">
                    {t(labelKey)}
                  </div>
                )}
                {(collapsed || responsive) && labelKey && (
                  <div className="nn-sidebar-section-divider" />
                )}
                {items.map((item) =>
                  renderNavItem({ item, isActive: currentId === item.id, badge: item.id === 'review' && dueCount > 0 ? dueCount : undefined, collapsed, responsive, label: t(item.labelKey) }),
                )}
              </React.Fragment>
            );
          })}

        </div>
        <div className="nn-sidebar-secondary">
          {FOOTER_NAV.map((item) =>
            renderNavItem({ item, isActive: currentId === item.id, collapsed, responsive, label: t(item.labelKey) }),
          )}
        </div>
      </nav>

      {(!collapsed || responsive) && (
        <div className="nn-sidebar-expanded-only nn-sidebar-footer">
          <LocaleToggle size="sm" />
          <button
            type="button"
            className="nn-sidebar-signout"
            onClick={handleSignOut}
            title={t('auth.signOut')}
            aria-label={t('auth.signOut')}
          >
            <NNIcon name="logout" size={16} />
            <span>{t('auth.signOut')}</span>
          </button>
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
  const t = useT();
  const zenMode = useUI((s) => s.zenMode);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const sidebarCollapsed = useUI((s) => s.sidebarCollapsed);
  const displayMode = useDisplayMode();
  // Window Controls Overlay (installed desktop PWA): the topbar doubles as the
  // OS titlebar — draggable via data-wco, padded clear of the overlaid window
  // controls (left inset covers macOS lights minus the sidebar already under
  // them; right inset covers Windows-style right-side controls).
  const { wco, left: wcoLeft, right: wcoRight } = useWcoTopInsets();
  // Zen (focus) mode hides the whole chrome — the per-page topbar disappears.
  // Zen is only ever true on /review (guarded in app-shell), so this is safe.
  if (zenMode) return null;

  return (
    <header
      className="nn-chrome nn-topbar"
      data-wco={wco ? '1' : undefined}
      style={{
        '--nn-topbar-wco-left': `${wcoLeft}px`,
        '--nn-topbar-wco-right': `${wcoRight}px`,
        // Only installed mobile apps need the device's top safe area.
        paddingTop: displayMode === 'standalone' ? 'env(safe-area-inset-top, 0px)' : undefined,
      } as CSSProperties}
    >
      <div className="nn-topbar-leading">
        <button
          type="button"
          aria-label={t('chrome.toggleSidebar')}
          aria-expanded={!sidebarCollapsed}
          title={`${t('chrome.toggleSidebar')} (⌘B)`}
          onClick={() => toggleSidebar()}
          className="nn-topbar-icon-button nn-topbar-desktop-only"
        >
          <NNIcon name="panel" size={20} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label={t('topbar.menuLabel')}
          onClick={() => window.dispatchEvent(new CustomEvent('nn:open-drawer'))}
          className="nn-topbar-icon-button nn-topbar-mobile-only"
        >
          <NNIcon name="menu" size={20} strokeWidth={1.75} />
        </button>
        <span className="nn-topbar-divider" aria-hidden="true" />
        <div className="nn-topbar-title-group">
          <h1 className="nn-topbar-title">{title}</h1>
          {subtitle && <span className="nn-topbar-subtitle">{subtitle}</span>}
        </div>
      </div>
      <div className="nn-topbar-actions">
        <button
          type="button"
          aria-label={t('topbar.searchLabel')}
          title={t('topbar.searchPlaceholder')}
          onClick={() => window.dispatchEvent(new CustomEvent('nn:open-palette'))}
          className="nn-topbar-search"
        >
          <NNIcon name="search" size={18} strokeWidth={1.75} />
          <span className="nn-topbar-search-label">{t('topbar.searchLabel')}</span>
          <kbd className="nn-topbar-search-shortcut" aria-hidden="true">⌘ K</kbd>
        </button>
        {actions && <div className="nn-topbar-desktop-only nn-topbar-page-actions">{actions}</div>}
        <AppLink
          href="/editor"
          className="nn-topbar-create"
          title={t('topbar.newCard')}
          aria-label={t('topbar.newCardLabel')}
        >
          <NNIcon name="plus" size={18} strokeWidth={2} />
          <span>{t('topbar.newCard')}</span>
        </AppLink>
      </div>
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
