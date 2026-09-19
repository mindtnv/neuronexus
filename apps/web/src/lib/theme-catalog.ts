import { BASE_THEME_TOKENS, PALETTE_SEEDS } from './theme-seeds';

export type PaletteId = keyof typeof PALETTE_SEEDS;
export type ThemeMode = 'light' | 'dark';
export const PALETTE_IDS = Object.keys(PALETTE_SEEDS) as PaletteId[];
export const LEGACY_MODES: Record<string, ThemeMode> = { dark: 'dark', light: 'light', ...Object.fromEntries(PALETTE_IDS.filter(id => id !== 'default').map(id => [id, PALETTE_SEEDS[id].nativeMode])) };

function rgb(hex: string): number[] { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); }
export function mixColor(from: string, to: string, amount: number): string {
  const end = rgb(to);
  return '#' + rgb(from).map((value, i) => Math.round(value * (1 - amount) + end[i] * amount).toString(16).padStart(2, '0')).join('');
}
function luminance(hex: string): number {
  const linear = rgb(hex).map(v => { const x = v / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; });
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
function readable(color: string, backgrounds: string[], mode: ThemeMode, minimum = 4.5): string {
  for (let step = 0; step <= 100; step++) {
    const candidate = mixColor(color, mode === 'light' ? '#111111' : '#ffffff', step / 100);
    if (backgrounds.every(bg => contrastRatio(candidate, bg) >= minimum)) return candidate;
  }
  return mode === 'light' ? '#111111' : '#ffffff';
}
function onColor(bg: string): string { return contrastRatio(bg, '#ffffff') >= contrastRatio(bg, '#111111') ? '#ffffff' : '#111111'; }
function resolveColor(name: string, source: Record<string, string>, seen = new Set<string>()): string {
  if (seen.has(name)) throw new Error(`Circular theme token: ${name}`);
  seen.add(name);
  const value = source[name];
  const ref = /^var\(--([\w-]+)\)$/.exec(value ?? '');
  if (ref) return resolveColor(ref[1], source, seen);
  if (!/^#[0-9a-f]{6}$/i.test(value ?? '')) throw new Error(`Invalid color token: ${name}`);
  return value;
}
export type ThemeVariant = { tokens: Record<string, string>; swatches: readonly [string, string, string]; chrome: string };
function createVariant(palette: PaletteId, mode: ThemeMode): ThemeVariant {
  const seed = PALETTE_SEEDS[palette];
  const source: Record<string, string> = { ...BASE_THEME_TOKENS, ...seed.tokens, ...(mode !== seed.nativeMode ? seed.counterpart : {}) };
  const tokens: Record<string, string> = {};
  for (const name of ['bg', 'surface', 'surface-2', 'surface-3', 'border', 'border-2', 'text', 'text-muted', 'text-dim']) tokens[name] = resolveColor(name, source);
  const backgrounds = ['bg', 'surface', 'surface-2', 'surface-3'].map(key => tokens[key]);
  tokens.text = readable(tokens.text, backgrounds, mode);
  tokens['text-muted'] = readable(tokens['text-muted'], backgrounds, mode);
  tokens['text-dim'] = readable(tokens['text-dim'], backgrounds, mode, 3);
  for (const name of Object.keys(source)) {
    if (!/^(lime|amber|violet|sky|rose|accent)-\d+$/.test(name)) continue;
    const color = resolveColor(name, source);
    tokens[name] = /-(400|500|600)$/.test(name) ? readable(color, backgrounds, mode) : color;
  }
  tokens['text-on-accent'] = onColor(tokens['accent-500']);
  tokens['text-on-violet'] = onColor(tokens['violet-500']);
  tokens['text-on-amber'] = onColor(tokens['amber-500']);
  tokens['selection-text'] = tokens['text-on-violet'];
  tokens['code-link'] = tokens['sky-400']; tokens['code-selector'] = tokens['amber-400']; tokens['code-deletion'] = tokens['rose-400'];
  const shadow = mode === 'light' ? 'rgba(16,20,28,.08)' : 'rgba(0,0,0,.32)';
  tokens['shadow-sm'] = `0 1px 3px ${shadow}`;
  tokens['shadow-md'] = `0 4px 16px ${shadow}`;
  tokens['shadow-lg'] = `0 16px 40px ${shadow}`;
  tokens['ambient-shadow'] = shadow;
  tokens['inset-shadow'] = mode === 'light' ? 'rgba(16,20,28,.08)' : 'rgba(0,0,0,.25)';
  tokens.scrim = mode === 'light' ? 'rgba(16,20,28,.28)' : 'rgba(0,0,0,.55)';
  tokens['scrim-soft'] = mode === 'light' ? 'rgba(16,20,28,.18)' : 'rgba(0,0,0,.4)';
  tokens['scrim-strong'] = mode === 'light' ? 'rgba(16,20,28,.4)' : 'rgba(0,0,0,.65)';
  tokens['hairline-contrast'] = mode === 'light' ? 'rgba(16,20,28,.04)' : 'rgba(255,255,255,.04)';
  return { tokens, chrome: tokens.surface, swatches: [tokens.bg, tokens['surface-2'], tokens['accent-500']] };
}
export const PALETTE_VARIANTS = Object.fromEntries(PALETTE_IDS.map(palette => [palette, { light: createVariant(palette, 'light'), dark: createVariant(palette, 'dark') }])) as Record<PaletteId, Record<ThemeMode, ThemeVariant>>;
// Used by the server head, live controls, preview swatches and prepaint bootstrap.
export const THEME_CSS = PALETTE_IDS.flatMap(palette => (['light', 'dark'] as const).map(mode => `:root[data-theme="${palette}"][data-theme-mode="${mode}"]{color-scheme:${mode};${Object.entries(PALETTE_VARIANTS[palette][mode].tokens).map(([key, value]) => `--${key}:${value};`).join('')}}`)).join('\n');
