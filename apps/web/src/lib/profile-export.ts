import { api, ok } from './api';

/** Existing account JSON export, shared by settings and destructive previews. */
export async function downloadProfileExport(isCurrent: () => boolean = () => true): Promise<boolean> {
  const data = await ok(await (api as any).profile.export.get());
  if (!isCurrent()) return false;
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'neuronexus-export.json';
    anchor.click();
  } finally { URL.revokeObjectURL(url); }
  return true;
}
