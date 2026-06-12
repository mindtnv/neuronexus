// Pure formatters for the studio's LIVE artifact-progress affordance (N2 streaming
// follow-up). A generating job shows a ticking elapsed timer + a growing character
// count derived from the server's `progressChars`. DOM-free so they unit-test
// under `bun test`.

/**
 * Elapsed seconds from a duration in ms (floored). Negatives/NaN → 0.
 */
export function formatElapsedSeconds(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 1000);
}

/**
 * Split a total second-count into `{ minutes, seconds }` for an i18n template —
 * the UI renders «N sec» under a minute and «N min M sec» past it.
 */
export function splitElapsed(totalSeconds: number): { minutes: number; seconds: number } {
  const s = Math.max(0, Math.floor(totalSeconds));
  return { minutes: Math.floor(s / 60), seconds: s % 60 };
}

/** A char count formatted for display: either a space-grouped exact number
 *  (<10 000) or a one-decimal "thousands" value the caller pairs with a localized
 *  unit. */
export interface CharCount {
  /** The display string: grouped digits (e.g. "1 234") OR the thousands value (e.g. "12,3"). */
  display: string;
  /** When true the caller appends a localized thousands unit after `display`. */
  isThousands: boolean;
}

/**
 * Format a raw character count: under 10 000 → space-grouped digits ("1 234",
 * `isThousands:false`); at/above → a one-decimal thousands value ("12,3", trailing
 * ",0" trimmed → "12", `isThousands:true`) so the caller can append its localized
 * unit. The decimal separator is a comma (RU/most-EU). Negatives/NaN → "0".
 */
export function formatCharCount(n: number): CharCount {
  if (!Number.isFinite(n) || n <= 0) return { display: '0', isThousands: false };
  const v = Math.floor(n);
  if (v < 10_000) {
    return { display: v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '), isThousands: false };
  }
  const oneDp = Math.round((v / 1000) * 10) / 10;
  const display = oneDp % 1 === 0 ? String(oneDp) : oneDp.toFixed(1).replace('.', ',');
  return { display, isThousands: true };
}
