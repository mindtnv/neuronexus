// Theme preference (P3.3a) — dark / light / system.
//
// Dark is the product default. The CSS in globals.css keys ALL light overrides
// off `[data-theme="light"]` on <html>; the absence of the attribute = dark. So
// applying a theme is just: set the attribute for 'light', remove it for 'dark',
// and (for 'system') mirror the OS `prefers-color-scheme`.
//
// The persisted PREFERENCE ('dark'|'light'|'system') lives in localStorage; the
// anti-FOUC inline script in app/layout.tsx reads it synchronously before paint.
// This module owns the same resolution logic for the React side + the live
// system-change subscription.

export type ThemePref = 'dark' | 'light' | 'system';

export const THEME_LS_KEY = 'nn:theme';

/** Read the persisted preference; defaults to 'system' when unset/unavailable. */
export function getTheme(): ThemePref {
  try {
    const raw = localStorage.getItem(THEME_LS_KEY);
    if (raw === 'dark' || raw === 'light' || raw === 'system') return raw;
  } catch {
    /* localStorage unavailable (SSR / private mode) — fall through. */
  }
  return 'system';
}

/** True when the OS currently prefers a light scheme (false on the server). */
function systemPrefersLight(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: light)').matches;
}

/** Resolve a preference to the concrete scheme to paint ('dark' | 'light'). */
export function resolveTheme(pref: ThemePref): 'dark' | 'light' {
  if (pref === 'system') return systemPrefersLight() ? 'light' : 'dark';
  return pref;
}

/** Apply a preference to <html>: set data-theme='light' or remove it for dark. */
export function applyTheme(pref: ThemePref): void {
  if (typeof document === 'undefined') return;
  const scheme = resolveTheme(pref);
  if (scheme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
}

/** Persist + apply a new preference in one call. */
export function setTheme(pref: ThemePref): void {
  try {
    localStorage.setItem(THEME_LS_KEY, pref);
  } catch {
    /* ignore — apply still runs so the current tab reflects the choice. */
  }
  applyTheme(pref);
}

/**
 * Subscribe to OS scheme changes — only meaningful while the preference is
 * 'system'. Returns an unsubscribe fn. The caller re-reads the current
 * preference at change time so a stale closure can't re-apply 'system' after the
 * user switched to an explicit scheme.
 */
export function subscribeSystemTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const handler = () => onChange();
  // addEventListener is the modern API; older Safari only has addListener.
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  mq.addListener(handler);
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  return () => mq.removeListener(handler);
}
