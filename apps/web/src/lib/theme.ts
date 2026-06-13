// Theme preference (P3.3a) — system + concrete built-in themes.
//
// Dark is the product default, but the app now always stamps a concrete
// `data-theme` and its light/dark family (`data-theme-mode`) on <html>. Custom
// themes can opt into the light-mode component fixes without pretending to be
// the stock light theme.
//
// The persisted PREFERENCE lives in localStorage; the anti-FOUC inline script in
// app/layout.tsx mirrors this resolution synchronously before paint. Keep the
// theme ids and scheme map in lock-step with that script.

export type ThemeId =
  | 'dark'
  | 'light'
  | 'aurora'
  | 'bloom'
  | 'dracula'
  | 'nord'
  | 'solarized'
  | 'gruvbox'
  | 'catppuccin'
  | 'monokai'
  | 'rosepine';
export type ThemePref = ThemeId | 'system';
export type ThemeMode = 'dark' | 'light';

export const THEME_IDS = [
  'dark',
  'light',
  'aurora',
  'bloom',
  'dracula',
  'nord',
  'solarized',
  'gruvbox',
  'catppuccin',
  'monokai',
  'rosepine',
] as const satisfies readonly ThemeId[];
export const THEME_PREFS = ['system', ...THEME_IDS] as const satisfies readonly ThemePref[];

export const THEME_MODES: Record<ThemeId, ThemeMode> = {
  dark: 'dark',
  light: 'light',
  aurora: 'dark',
  bloom: 'light',
  dracula: 'dark',
  nord: 'dark',
  solarized: 'light',
  gruvbox: 'dark',
  catppuccin: 'dark',
  monokai: 'dark',
  rosepine: 'dark',
};

export const THEME_SWATCHES: Record<ThemePref, readonly [string, string, string]> = {
  system: ['#0a0b0d', '#faf8f3', '#9ad155'],
  dark: ['#0a0b0d', '#1c1f25', '#9ad155'],
  light: ['#faf8f3', '#ffffff', '#7bb53a'],
  aurora: ['#06110f', '#14342f', '#77d38e'],
  bloom: ['#f7faf7', '#ffffff', '#d85a82'],
  dracula: ['#282a36', '#44475a', '#bd93f9'],
  nord: ['#2e3440', '#3b4252', '#88c0d0'],
  solarized: ['#fdf6e3', '#eee8d5', '#268bd2'],
  gruvbox: ['#282828', '#3c3836', '#fabd2f'],
  catppuccin: ['#1e1e2e', '#313244', '#cba6f7'],
  monokai: ['#272822', '#3e3d32', '#a6e22e'],
  rosepine: ['#191724', '#26233a', '#ebbcba'],
};

export const THEME_LS_KEY = 'nn:theme';

function isThemePref(raw: string | null): raw is ThemePref {
  return (
    raw === 'system' ||
    raw === 'dark' ||
    raw === 'light' ||
    raw === 'aurora' ||
    raw === 'bloom' ||
    raw === 'dracula' ||
    raw === 'nord' ||
    raw === 'solarized' ||
    raw === 'gruvbox' ||
    raw === 'catppuccin' ||
    raw === 'monokai' ||
    raw === 'rosepine'
  );
}

/** Read the persisted preference; defaults to 'system' when unset/unavailable. */
export function getTheme(): ThemePref {
  try {
    const raw = localStorage.getItem(THEME_LS_KEY);
    if (isThemePref(raw)) return raw;
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

/** Resolve a preference to the concrete theme to paint. */
export function resolveTheme(pref: ThemePref): ThemeId {
  if (pref === 'system') return systemPrefersLight() ? 'light' : 'dark';
  return pref;
}

/** Apply a preference to <html>: set the concrete theme + its light/dark family. */
export function applyTheme(pref: ThemePref): void {
  if (typeof document === 'undefined') return;
  const theme = resolveTheme(pref);
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-theme-mode', THEME_MODES[theme]);
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
