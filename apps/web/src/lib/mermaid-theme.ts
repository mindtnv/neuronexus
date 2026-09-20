import { PALETTE_VARIANTS } from './theme-catalog';
import type { PaletteId } from './theme-catalog';

export function mermaidTheme(palette: string, mode: string) {
  const variants = PALETTE_VARIANTS[palette as PaletteId] ?? PALETTE_VARIANTS.default;
  const darkMode = mode !== 'light';
  const c = variants[darkMode ? 'dark' : 'light'].tokens;
  return {
    darkMode, background: c.surface, primaryColor: c['surface-2'], primaryTextColor: c.text,
    primaryBorderColor: c['accent-500'], secondaryColor: c['surface-3'], secondaryTextColor: c.text,
    secondaryBorderColor: c['border-2'], tertiaryColor: c.surface, tertiaryTextColor: c.text,
    tertiaryBorderColor: c['border-2'], lineColor: c['text-muted'], textColor: c.text,
    mainBkg: c['surface-2'], nodeBorder: c['accent-500'], clusterBkg: c.surface,
    clusterBorder: c['border-2'], edgeLabelBackground: c.surface,
    actorBkg: c['surface-2'], actorBorder: c['accent-500'], actorTextColor: c.text,
    actorLineColor: c['text-muted'], signalColor: c['text-muted'], signalTextColor: c.text,
    labelBoxBkgColor: c['surface-2'], labelBoxBorderColor: c['border-2'], labelTextColor: c.text,
    loopTextColor: c.text, noteBkgColor: c['surface-3'], noteTextColor: c.text,
    noteBorderColor: c['border-2'], activationBkgColor: c['surface-3'], activationBorderColor: c['accent-500'],
    fontFamily: 'Golos Text, system-ui, sans-serif',
  };
}
