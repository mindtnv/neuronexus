// Shared media constants (Milestone 2 — single source of truth, like the FSRS
// `ANKI_DEFAULTS`). DOM-free, Node-free: plain values consumed by BOTH edges so
// the web pre-check and the server presign/finalize agree byte-for-byte on what
// is an allowed upload.
//
//   - the web image pre-check (`apps/web/src/components/card-form.tsx`) — a fast
//     UX gate before presign,
//   - the API media module (`apps/api/src/modules/media.ts`) — the security
//     boundary; the server MAY still read `MAX_MEDIA_BYTES` from env, falling
//     back to `MAX_MEDIA_BYTES` here.
//
// Keeping the allowlist + cap here (not duplicated per consumer) means a future
// format addition / cap change happens in exactly one place.

/** Allowed image MIME types for media uploads (png / jpeg / webp / gif). */
export const MEDIA_MIME_ALLOWLIST = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export type MediaMime = (typeof MEDIA_MIME_ALLOWLIST)[number];

/** Hard upload ceiling in BYTES. Default 5 MiB (5 * 1024 * 1024). */
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

/** Human-readable label for `MAX_MEDIA_BYTES` (e.g. `5 MiB`), derived from the
 * byte cap so the UI copy can never drift from the real limit. */
export const MAX_MEDIA_LABEL = `${MAX_MEDIA_BYTES / (1024 * 1024)} MiB`;
