/** Reomi originals: intentionally different paper, night and accent colours. */
function blend(a: string, b: string, amount: number): string {
  return '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - amount) + parseInt(b.slice(i, i + 2), 16) * amount).toString(16).padStart(2, '0')).join('');
}
function palette(night: string, paper: string, accent: string, companion: string) {
  return {
    nativeMode: 'dark' as const,
    tokens: {
      bg: night, surface: blend(night, '#ffffff', .035), 'surface-2': blend(night, '#ffffff', .065), 'surface-3': blend(night, '#ffffff', .105),
      border: blend(night, '#ffffff', .15), 'border-2': blend(night, '#ffffff', .22),
      text: blend(paper, '#ffffff', .5), 'text-muted': blend(night, paper, .68), 'text-dim': blend(night, paper, .5),
      'accent-600': blend(accent, night, .2), 'accent-500': accent, 'accent-400': blend(accent, '#ffffff', .18), 'accent-300': blend(accent, '#ffffff', .38), 'accent-100': blend(accent, '#ffffff', .8),
      'violet-600': blend(companion, night, .2), 'violet-500': companion, 'violet-400': blend(companion, '#ffffff', .2), 'violet-200': blend(companion, '#ffffff', .65),
    },
    counterpart: {
      bg: paper, surface: blend(paper, '#ffffff', .7), 'surface-2': blend(paper, night, .035), 'surface-3': blend(paper, night, .075),
      border: blend(paper, night, .15), 'border-2': blend(paper, night, .24),
      text: blend(night, '#000000', .15), 'text-muted': blend(night, paper, .33), 'text-dim': blend(night, paper, .45),
    },
  };
}

export const ORIGINAL_PALETTE_SEEDS = {
  porcelain: palette('#141c2a', '#f3f0e9', '#759df4', '#c79e70'),
  copper: palette('#251917', '#f5eae0', '#e69a72', '#92bab5'),
  lagoon: palette('#082529', '#e5f4f1', '#5edbc3', '#91adf0'),
  matcha: palette('#1b241b', '#edf1df', '#b4ce7c', '#d8ad85'),
  mulberry: palette('#291525', '#f6e9ef', '#e798ba', '#b0a2e7'),
  saffron: palette('#292111', '#faf1d6', '#edc761', '#9badcf'),
  glacier: palette('#13232f', '#e9f4f8', '#82c9ef', '#b5b6ed'),
  terracotta: palette('#2c1b18', '#f5e9dd', '#e8957d', '#bbc58a'),
  inkstone: palette('#1a1e23', '#eaecef', '#c3cbd7', '#88b5d0'),
  orchid: palette('#251a32', '#f0eaf8', '#c4a0ed', '#e3a3b0'),
  dune: palette('#29251d', '#f5eedf', '#d6b67b', '#a9c2b8'),
  petrol: palette('#12282d', '#e8eff0', '#edaf72', '#7dbec6'),
  cherry: palette('#2a171e', '#fbeced', '#f28c9b', '#b6b6e4'),
  moonstone: palette('#202231', '#edecf4', '#acb3ed', '#9cc9c8'),
  seaglass: palette('#16302d', '#e9f4ea', '#94d6be', '#d6c08b'),
  espresso: palette('#261c16', '#f4ecdf', '#d8ae89', '#b7bd85'),
  bluehour: palette('#141c3a', '#eaeefa', '#829ef3', '#dcadc4'),
  papaya: palette('#302018', '#fff0e3', '#ffb27f', '#9ec9bb'),
  lichen: palette('#24291b', '#f0f2e2', '#c3d48a', '#c3a7be'),
  cosmos: palette('#21132f', '#f3eafa', '#e69cdd', '#88c5e7'),
} as const;
export const ORIGINAL_PALETTE_IDS = Object.keys(ORIGINAL_PALETTE_SEEDS) as (keyof typeof ORIGINAL_PALETTE_SEEDS)[];
