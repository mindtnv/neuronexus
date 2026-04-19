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
  { id: 'decks', href: '/decks', icon: 'stack', labelKey: 'nav.decks' },
  { id: 'settings', href: '/settings', icon: 'settings', labelKey: 'nav.settings' },
];

export const BOTTOM_TABS = APP_NAV.filter((item) =>
  ['home', 'review', 'decks'].includes(item.id),
);

export function getActiveNavId(pathname: string | null | undefined, items: AppNavItem[]): string {
  return (
    items
      .slice()
      .reverse()
      .find((item) => (item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href)))?.id ?? 'home'
  );
}
