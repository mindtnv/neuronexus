export type Appearance = { version: 2; mode: 'system' | 'light' | 'dark'; palette: string };
export type ThemeRuntimeConfig = { key: string; event: string; palettes: string[]; legacyModes: Record<string, 'light' | 'dark'>; chrome: Record<string, { light: string; dark: string }> };

/** Self-contained: the SAME implementation is serialized into the synchronous head script. */
export function createThemeRuntime(config: ThemeRuntimeConfig) {
  let volatile = false;
  let memory: Appearance = { version: 2, mode: 'system', palette: 'default' };
  function normalize(value: unknown): Appearance {
    if (typeof value === 'string') {
      if (value === 'system') return { version: 2, mode: 'system', palette: 'default' };
      if (Object.prototype.hasOwnProperty.call(config.legacyModes, value)) return { version: 2, mode: config.legacyModes[value], palette: value === 'dark' || value === 'light' ? 'default' : value };
      try { return normalize(JSON.parse(value)); } catch {}
    }
    if (value && typeof value === 'object') {
      const input = value as Partial<Appearance>;
      if (input.version === 2 && (input.mode === 'light' || input.mode === 'dark' || input.mode === 'system') && typeof input.palette === 'string' && config.palettes.includes(input.palette)) return { version: 2, mode: input.mode, palette: input.palette };
    }
    return { version: 2, mode: 'system', palette: 'default' };
  }
  function read(): Appearance {
    if (volatile) return memory;
    try {
      const raw = localStorage.getItem(config.key);
      memory = normalize(raw);
      if (raw && (raw === 'system' || Object.prototype.hasOwnProperty.call(config.legacyModes, raw))) {
        try { localStorage.setItem(config.key, JSON.stringify(memory)); } catch {}
      }
    } catch {}
    return memory;
  }
  function resolve(preference: Appearance): { palette: string; mode: 'light' | 'dark' } {
    const pref = normalize(preference);
    let mode: 'light' | 'dark' = pref.mode === 'light' ? 'light' : 'dark';
    if (pref.mode === 'system') {
      try { mode = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch {}
    }
    return { palette: pref.palette, mode };
  }
  function apply(preference = read()): void {
    if (typeof document === 'undefined') return;
    const resolved = resolve(preference);
    document.documentElement.setAttribute('data-theme', resolved.palette);
    document.documentElement.setAttribute('data-theme-mode', resolved.mode);
    const color = config.chrome[resolved.palette][resolved.mode];
    const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
    if (!metas.length) {
      const meta = document.createElement('meta'); meta.name = 'theme-color'; meta.content = color; document.head.appendChild(meta);
    } else metas.forEach(meta => { meta.content = color; meta.removeAttribute('media'); });
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(config.event));
  }
  function set(preference: Appearance): void {
    memory = normalize(preference);
    try { localStorage.setItem(config.key, JSON.stringify(memory)); volatile = false; } catch { volatile = true; }
    apply(memory);
  }
  return { normalize, read, resolve, apply, set };
}
