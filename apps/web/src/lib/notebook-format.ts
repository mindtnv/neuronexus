// Shared notebook formatting helpers (P2.6 dedup). Three identical copies of
// this relative-time formatter lived in notebooks.tsx / notebook-workspace.tsx
// (`relativeUpdated`) and studio-panel.tsx (`relativeWhen`) — one definition now.
//
// NOTE: this is intentionally distinct from chat-threads' `relativeUpdated`,
// which reads `chat.threads.*` keys and wraps the result as "updated N ago".
// The notebook surfaces want a BARE relative time (e.g. "5 мин назад") because
// their callers add their own prefix ("обновлён {time}", "Готово · {time}").

type Tfn = (key: string, params?: Record<string, string | number>) => string;

/** Hand-rolled relative «N ago» (no dep) — uses the `notebooks.meta.*` keys. */
export function relativeUpdated(iso: string | undefined, t: Tfn): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const diff = Date.now() - ms;
  if (diff < 60_000) return t('notebooks.meta.relativeNow');
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return t('notebooks.meta.relativeMinutes', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('notebooks.meta.relativeHours', { count: hours });
  return t('notebooks.meta.relativeDays', { count: Math.floor(hours / 24) });
}
