import type { IconName } from './ui';

// 'root' renders without a section header (top-level destinations);
// 'memory' = the SRS core, 'knowledge' = materials (library/notebooks).
export type NavSection = 'root' | 'memory' | 'knowledge';

export type AppNavItem = {
  id: string;
  href: string;
  icon: IconName;
  labelKey: string;
  section: NavSection;
};

export const APP_NAV: AppNavItem[] = [
  { id: 'home', href: '/', icon: 'home', labelKey: 'nav.home', section: 'root' },
  { id: 'chat', href: '/chat', icon: 'sparkle', labelKey: 'nav.chat', section: 'root' },
  { id: 'review', href: '/review', icon: 'bolt', labelKey: 'nav.review', section: 'memory' },
  { id: 'decks', href: '/decks', icon: 'stack', labelKey: 'nav.decks', section: 'memory' },
  { id: 'cards', href: '/cards', icon: 'grid', labelKey: 'nav.cards', section: 'memory' },
  { id: 'library', href: '/library', icon: 'book', labelKey: 'nav.library', section: 'knowledge' },
  { id: 'notebooks', href: '/notebooks', icon: 'doc', labelKey: 'nav.notebooks', section: 'knowledge' },
];

// Stats + Settings render apart from the sections (pinned below a divider).
// Gamification (garden, streak) deliberately has no sidebar entry — its entry
// points are the plant on Home and the streak panel on Stats.
export const FOOTER_NAV: AppNavItem[] = [
  { id: 'stats', href: '/stats', icon: 'graph', labelKey: 'nav.stats', section: 'root' },
  { id: 'settings', href: '/settings', icon: 'settings', labelKey: 'nav.settings', section: 'root' },
];

// Ordered sections + their header label keys (consumed by the sidebar).
// 'root' has no header — null label keeps the items unlabelled at the top.
export const NAV_SECTIONS: NavSection[] = ['root', 'memory', 'knowledge'];

export const NAV_SECTION_LABEL: Record<NavSection, string | null> = {
  root: null,
  memory: 'nav.sections.memory',
  knowledge: 'nav.sections.knowledge',
};

const BOTTOM_TAB_IDS = ['home', 'review', 'decks', 'cards', 'library'];

export const BOTTOM_TABS = BOTTOM_TAB_IDS.map(
  (id) => APP_NAV.find((item) => item.id === id)!,
).filter(Boolean);

export function getActiveNavId(pathname: string | null | undefined, items: AppNavItem[]): string {
  // Card-area sub-views (graph, editor) are no longer nav items but live in the
  // Cards domain — highlight 'cards' for them.
  if (pathname?.startsWith('/graph') || pathname?.startsWith('/editor')) {
    if (items.some((item) => item.id === 'cards')) return 'cards';
  }
  // The garden has no nav item of its own — it's a progress feature entered
  // from Home/Stats, so highlight 'stats' while the user is there.
  if (pathname?.startsWith('/garden')) {
    if (items.some((item) => item.id === 'stats')) return 'stats';
  }
  return (
    items
      .slice()
      .reverse()
      .find((item) => (item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href)))?.id ?? 'home'
  );
}
