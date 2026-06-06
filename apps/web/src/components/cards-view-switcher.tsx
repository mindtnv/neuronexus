'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NNIcon, type IconName } from './ui';
import { useT } from '@/lib/i18n';

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
    <div
      role="tablist"
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: 2,
        borderRadius: 10,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
      }}
    >
      {VIEWS.map((v) => {
        const active = pathname.startsWith(v.match);
        return (
          <Link
            key={v.href}
            href={v.href}
            role="tab"
            aria-selected={active}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 500,
              letterSpacing: -0.1,
              textDecoration: 'none',
              background: active ? 'var(--surface-3)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-muted)',
            }}
          >
            <NNIcon name={v.icon} size={14} />
            <span>{t(v.labelKey)}</span>
          </Link>
        );
      })}
    </div>
  );
};

export default CardsViewSwitcher;
