'use client';

import { useEffect } from 'react';
import { useSession } from './auth';
import { useNN } from './store';
import { countDueCards } from './cards';
import { setBadge } from './app-badge';
import { notifyDue } from './notify';

// Pulls the user snapshot (profile / decks / cards) as soon as a session is
// present. Fires once per app load; resets if the user signs out and signs
// back in as someone else.

let lastBootstrappedUserId: string | null = null;
let inFlight: Promise<void> | null = null;
// Guard: fire the app-open notification only once per bootstrap cycle.
let notifiedThisSession = false;

export function Bootstrap() {
  const bootstrap = useNN((s) => s.bootstrap);
  const reset = useNN((s) => s.reset);
  const { data, isPending } = useSession();

  // ── App badge (E1) ──────────────────────────────────────────────────────
  // Value-keyed selector: returns a NUMBER so the effect re-runs only when the
  // count changes — not on cards-array identity. Flat countDueCards (not
  // aggregateCounts which is per-deck-subtree).
  const due = useNN((s) => countDueCards(s.cards));

  useEffect(() => {
    setBadge(due);
  }, [due]);

  // ── Bootstrap + app-open notification (E2) ─────────────────────────────
  useEffect(() => {
    if (isPending) return;
    const userId = data?.session?.userId ?? null;

    // Signed out: clear mirror.
    if (!userId) {
      if (lastBootstrappedUserId) {
        reset();
        lastBootstrappedUserId = null;
        notifiedThisSession = false;
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
        notifiedThisSession = false;
      } catch (err) {
        console.error('[neuronexus] bootstrap failed', err);
        lastBootstrappedUserId = null;
      } finally {
        inFlight = null;
      }
    })();
  }, [bootstrap, reset, data, isPending]);

  // ── App-open notification (E2) ─────────────────────────────────────────
  // Fires once after bootstrap completes, when due > 0 and opt-in enabled.
  // `due` is correct here because bootstrap() commits `bootstrapped:true` and
  // the populated cards in the same render snapshot — both effects observe it.
  const bootstrapped = useNN((s) => s.bootstrapped);
  useEffect(() => {
    if (!bootstrapped) return;
    if (notifiedThisSession) return;
    notifiedThisSession = true;
    notifyDue(due);
  }, [bootstrapped, due]);

  return null;
}
