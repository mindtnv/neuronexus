'use client';

import { useEffect } from 'react';
import { useSession } from './auth';
import { useNN } from './store';

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
    if (isPending) return;
    const userId = data?.session?.userId ?? null;

    // Signed out: clear mirror.
    if (!userId) {
      if (lastBootstrappedUserId) {
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
        reset();
        await bootstrap();
        lastBootstrappedUserId = userId;
      } catch (err) {
        console.error('[neuronexus] bootstrap failed', err);
        lastBootstrappedUserId = null;
      } finally {
        inFlight = null;
      }
    })();
  }, [bootstrap, reset, data, isPending]);

  return null;
}
