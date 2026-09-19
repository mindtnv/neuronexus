/** Stable keyboard selection, even when asynchronous result groups change. */
export function paletteSelection(ids: readonly string[], active: string | null): string | null {
  return active && ids.includes(active) ? active : ids[0] ?? null;
}
export function movePaletteSelection(ids: readonly string[], active: string | null, key: string): string | null {
  if (!ids.length) return null;
  if (key === 'Home') return ids[0];
  if (key === 'End') return ids[ids.length - 1];
  const current = ids.indexOf(paletteSelection(ids, active)!);
  return ids[(current + (key === 'ArrowUp' ? -1 : 1) + ids.length) % ids.length];
}
export function paletteDeckHref(name: string): string {
  const quoted = `deck:"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return `/cards?q=${encodeURIComponent(quoted)}`;
}
