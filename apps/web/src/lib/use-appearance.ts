'use client';
import { useEffect, useState } from 'react';
import { DEFAULT_THEME, THEME_CHANGE_EVENT, getTheme, setTheme, type ThemePref } from './theme';

export function useAppearance(): [ThemePref, typeof setTheme] {
  const [preference, setPreference] = useState<ThemePref>(DEFAULT_THEME);
  useEffect(() => {
    const sync = () => setPreference(getTheme());
    sync(); window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);
  return [preference, setTheme];
}
