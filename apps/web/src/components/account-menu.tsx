'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { AppLink } from './navigation';
import { NNIcon } from './ui';
import { useT } from '@/lib/i18n';

/** Native disclosure: keyboard activation, tab navigation, Escape and outside dismissal. */
export function AccountMenu({ name, onSignOut }: { name: string; onSignOut: () => Promise<void> }) {
  const t = useT();
  const pathname = usePathname();
  const root = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  useEffect(() => { if (root.current) root.current.open = false; }, [pathname]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && root.current && !root.current.contains(event.target)) root.current.open = false;
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  const close = () => { if (root.current) root.current.open = false; };
  return (
    <details ref={root} className="nn-account" onKeyDown={event => {
      if (event.key === 'Escape' && root.current?.open) {
        event.preventDefault(); event.stopPropagation(); close(); trigger.current?.focus();
      }
    }} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
    }}>
      <summary ref={trigger} className="nn-account-trigger" aria-label={`${t('settings.nav.account')}: ${name}`} title={t('settings.nav.account')}>
        <span className="nn-account-avatar" aria-hidden="true">{name.trim().slice(0, 2).toUpperCase()}</span>
        <span className="nn-account-copy"><strong>{name}</strong><span>{t('settings.nav.account')}</span></span>
        <span className="nn-account-chevron"><NNIcon name="chevd" size={14} /></span>
      </summary>
      <nav className="nn-account-panel" aria-label={t('settings.nav.account')}>
        <AppLink href="/settings" onClick={() => { close(); window.dispatchEvent(new CustomEvent('nn:close-drawer')); }}>
          <NNIcon name="settings" size={17} />{t('nav.settings')}
        </AppLink>
        <div className="nn-account-divider" />
        <button type="button" onClick={() => { close(); void onSignOut(); }}>
          <NNIcon name="logout" size={17} />{t('auth.signOut')}
        </button>
      </nav>
    </details>
  );
}
