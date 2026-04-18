import type { IconName } from './ui';

export type AppNavItem = {
  id: string;
  href: string;
  icon: IconName;
  labelKey: string;
};

export const APP_NAV: AppNavItem[] = [
  { id: 'home', href: '/', icon: 'home', labelKey: 'nav.home' },
  { id: 'review', href: '/review', icon: 'bolt', labelKey: 'nav.review' },
  { id: 'graph', href: '/graph', icon: 'graph', labelKey: 'nav.graph' },
  { id: 'decks', href: '/decks', icon: 'stack', labelKey: 'nav.decks' },
  { id: 'garden', href: '/garden', icon: 'garden', labelKey: 'nav.garden' },
  { id: 'editor', href: '/editor', icon: 'edit', labelKey: 'nav.editor' },
  { id: 'stats', href: '/stats', icon: 'graph', labelKey: 'nav.stats' },
  { id: 'settings', href: '/settings', icon: 'settings', labelKey: 'nav.settings' },
];

export const BOTTOM_TABS = APP_NAV.filter((item) =>
  ['home', 'review', 'decks', 'graph', 'garden'].includes(item.id),
);

export function getActiveNavId(pathname: string | null | undefined, items: AppNavItem[]): string {
  return (
    items
      .slice()
      .reverse()
      .find((item) => (item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href)))?.id ?? 'home'
  );
}
