'use client';

import { useEffect } from 'react';
import { getSession, useSession } from './auth';
import { useNN } from './store';
import { logTrace } from './trace';

// Pulls the user snapshot (profile / decks / cards) as soon as a session is
// present. Fires once per app load; resets if the user signs out and signs
// back in as someone else.

let lastBootstrappedUserId: string | null = null;
let inFlight: Promise<void> | null = null;

export function Bootstrap() {
  const bootstrap = useNN((s) => s.bootstrap);
  const reset = useNN((s) => s.reset);
  const { data, isPending } = useSession();

  useEffect(() => {
    // BetterAuth's hook does not eagerly load session state on a fresh static
    // page render, so kick off one read as soon as the app shell mounts.
    void getSession().catch((err) => {
      logTrace('session.prime.error', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, []);

  useEffect(() => {
    if (isPending) return;
    const userId = data?.session?.userId ?? null;

    // Signed out: clear mirror.
    if (!userId) {
      if (lastBootstrappedUserId) {
        logTrace('bootstrap.reset');
        reset();
        lastBootstrappedUserId = null;
      }
      return;
    }

    // Same user, already loaded.
    if (userId === lastBootstrappedUserId) return;

    // New user (or first load with session).
    if (inFlight) return;
    inFlight = (async () => {
      try {
        logTrace('bootstrap.start', { userId });
        reset();
        await bootstrap();
        lastBootstrappedUserId = userId;
        logTrace('bootstrap.success', { userId });
      } catch (err) {
        logTrace('bootstrap.error', {
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
        console.error('[neuronexus] bootstrap failed', err);
        lastBootstrappedUserId = null;
      } finally {
        inFlight = null;
      }
    })();
  }, [bootstrap, reset, data, isPending]);

  return null;
}
