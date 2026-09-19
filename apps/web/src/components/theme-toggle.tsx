'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { useAppearance } from '@/lib/use-appearance';
import { getTheme, resolveTheme, subscribeSystemTheme } from '@/lib/theme';

/** Fast mode switch; palette choice remains independent in Settings. */
export function ThemeToggle() {
  const t = useT();
  const [preference, setTheme] = useAppearance();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () => setDark(resolveTheme(getTheme()).mode === 'dark');
    sync();
    return subscribeSystemTheme(sync);
  }, [preference]);
  const label = t(dark ? 'topbar.switchToLight' : 'topbar.switchToDark');
  return <button type="button" className="nn-topbar-icon-button reomi-theme-toggle"
    aria-label={label} data-tooltip={label}
    onClick={() => {
      const current = getTheme();
      setTheme({ ...current, mode: resolveTheme(current).mode === 'dark' ? 'light' : 'dark' });
    }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
        : <path d="M20.8 13.1A9 9 0 0 1 10.9 3.2a9 9 0 1 0 9.9 9.9Z" />}
    </svg>
  </button>;
}
