'use client';

// useArtifactStatus — lightweight studio-artifact polling (N2). The studio panel
// refetches the artifact LIST every `intervalMs` while any artifact is in a
// non-terminal job status (pending|generating) and stops once the whole set is
// terminal (ready|error).
//
// This is DELIBERATELY a separate hook from `use-source-status`: artifact
// statuses (pending|generating|ready|error) are a DIFFERENT enum from source
// ingest statuses (pending|parsing|indexing|ready|error|deleting). The plan (§5)
// says not to mix the enums — `isNonTerminal(SourceStatus)` would not type-check
// against an ArtifactStatus and the terminal sets differ. So this hook owns its
// own tiny terminal-set check; the pure helper is exported for unit tests.

import { useEffect, useRef } from 'react';
import { ARTIFACT_STATUSES, type ArtifactStatus } from '@neuronexus/shared';

const NONTERMINAL = new Set<ArtifactStatus>(['pending', 'generating']);

// Compile-time guard: the non-terminal set is a subset of the shared status enum.
// (Referenced so an accidental drift of ARTIFACT_STATUSES surfaces in review.)
void ARTIFACT_STATUSES;

/** Whether an artifact job is still running (and thus needs polling). */
export function isArtifactNonTerminal(status: ArtifactStatus): boolean {
  return NONTERMINAL.has(status);
}

/** Whether ANY artifact in the set is still running. Pure (exported for tests). */
export function anyArtifactNonTerminal(items: { status: ArtifactStatus }[]): boolean {
  return items.some((a) => NONTERMINAL.has(a.status));
}

export interface UseArtifactStatusOptions {
  /** The current artifact list to watch (LIGHT list rows are enough). */
  items: { status: ArtifactStatus }[];
  /** Refetch the artifact list (the studio panel's list refresher). */
  refresh: () => void | Promise<void>;
  /** Poll cadence in ms (default 2500). */
  intervalMs?: number;
  /** Disable polling entirely (e.g. while chat is unconfigured). */
  enabled?: boolean;
}

/**
 * Poll the artifact list while any job is non-terminal; stop when all are
 * terminal. Returns whether any artifact is currently running (handy for a
 * "generating…" affordance). The interval re-subscribes only when the
 * has-pending flag flips, reading `refresh` from a ref so a fresh closure each
 * render doesn't churn the timer.
 */
export function useArtifactStatus({
  items,
  refresh,
  intervalMs = 2500,
  enabled = true,
}: UseArtifactStatusOptions): boolean {
  const hasPending = anyArtifactNonTerminal(items);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled || !hasPending) return;
    let cancelled = false;
    const interval = setInterval(() => {
      if (cancelled) return;
      void refreshRef.current();
    }, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, hasPending, intervalMs]);

  return hasPending;
}
