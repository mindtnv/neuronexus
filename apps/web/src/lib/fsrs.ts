import type { Card as FsrsCard } from 'ts-fsrs';

// Client-side FSRS helpers. Scheduling/preview logic lives in @neuronexus/shared
// (single source of truth, honors per-user requestRetention) — this module only
// keeps the pure display helper that has no scheduler dependency.

export function humanInterval(card: FsrsCard, now: Date = new Date()): string {
  const ms = new Date(card.due).getTime() - now.getTime();
  if (ms <= 0) return 'now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.round(months / 12)}y`;
}
