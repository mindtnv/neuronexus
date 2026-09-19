'use client';

import { usePathname } from 'next/navigation';
import { NNIcon, type IconName } from './ui';
import { useT } from '@/lib/i18n';
import { AppLink } from './navigation';

type ViewDef = { href: string; icon: IconName; labelKey: string; match: string };

const VIEWS: ViewDef[] = [
  { href: '/cards', icon: 'grid', labelKey: 'cards.view.table', match: '/cards' },
  { href: '/graph', icon: 'graph', labelKey: 'cards.view.graph', match: '/graph' },
];

/**
 * Segmented control that unifies the Cards table (/cards) and the Graph (/graph)
 * as two views of the same "Cards" area. Highlights the active view from the
 * current pathname; navigation is plain client-side routing.
 */
export const CardsViewSwitcher = () => {
  const t = useT();
  const pathname = usePathname() ?? '';

  return (
    <nav className="reomi-view-switcher" aria-label={t('cards.title')}>
      {VIEWS.map((v) => {
        const active = pathname.startsWith(v.match);
        return (
          <AppLink
            key={v.href}
            href={v.href}
            aria-current={active ? 'page' : undefined}
          >
            <NNIcon name={v.icon} size={14} />
            <span>{t(v.labelKey)}</span>
          </AppLink>
        );
      })}
    </nav>
  );
};

export default CardsViewSwitcher;
