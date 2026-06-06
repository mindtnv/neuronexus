import type { IconName } from './ui';

export type NavSection = 'overview' | 'learning' | 'progress';

export type AppNavItem = {
  id: string;
  href: string;
  icon: IconName;
  labelKey: string;
  section: NavSection;
};

export const APP_NAV: AppNavItem[] = [
  { id: 'home', href: '/', icon: 'home', labelKey: 'nav.home', section: 'overview' },
  { id: 'review', href: '/review', icon: 'bolt', labelKey: 'nav.review', section: 'learning' },
  { id: 'decks', href: '/decks', icon: 'stack', labelKey: 'nav.decks', section: 'learning' },
  { id: 'cards', href: '/cards', icon: 'grid', labelKey: 'nav.cards', section: 'learning' },
  { id: 'stats', href: '/stats', icon: 'graph', labelKey: 'nav.stats', section: 'progress' },
  { id: 'garden', href: '/garden', icon: 'garden', labelKey: 'nav.garden', section: 'progress' },
];

// Settings renders apart from the sections (pinned to the bottom of the nav).
export const SETTINGS_NAV: AppNavItem = {
  id: 'settings',
  href: '/settings',
  icon: 'settings',
  labelKey: 'nav.settings',
  section: 'overview',
};

// Ordered sections + their header label keys (consumed by the sidebar).
export const NAV_SECTIONS: NavSection[] = ['overview', 'learning', 'progress'];

export const NAV_SECTION_LABEL: Record<NavSection, string> = {
  overview: 'nav.sections.overview',
  learning: 'nav.sections.learning',
  progress: 'nav.sections.progress',
};

const BOTTOM_TAB_IDS = ['home', 'review', 'decks', 'cards', 'garden'];

export const BOTTOM_TABS = BOTTOM_TAB_IDS.map(
  (id) => APP_NAV.find((item) => item.id === id)!,
).filter(Boolean);

export function getActiveNavId(pathname: string | null | undefined, items: AppNavItem[]): string {
  // Card-area sub-views (graph, editor) are no longer nav items but live in the
  // Cards domain — highlight 'cards' for them.
  if (pathname?.startsWith('/graph') || pathname?.startsWith('/editor')) {
    if (items.some((item) => item.id === 'cards')) return 'cards';
  }
  return (
    items
      .slice()
      .reverse()
      .find((item) => (item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href)))?.id ?? 'home'
  );
}
