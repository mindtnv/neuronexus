// «Урожай выделений → карточки» (feature #2) — PURE wizard helpers (no DOM, no
// fetch), unit-tested directly (arrays in → array out), mirroring the chat
// confirm-wizard's `buildCardSelections` pattern in chat-activity.ts.
//
// The harvest wizard walks the AI-proposed `HarvestCandidate[]` one card at a
// time: each card can be EXCLUDED, or kept with inline-edited front/back. This
// module turns the wizard's per-card decision state into the apply payload the
// server consumes (`POST /sources/:id/harvest-cards/apply` → `{ deckId, cards }`).
//
// The apply contract carries the FULL candidate (`{ origin, page, front, back,
// quote }`) so the server can stamp `harvested_at` on the right origin marking —
// we therefore echo the original candidate back, overriding only the edited
// front/back. Excluded cards are dropped entirely (the server never sees them,
// so their origin markings stay un-harvested and a re-run re-offers them).

import type { HarvestCandidate } from '@/lib/types';

/** One card's decision in the wizard. `include:false` → dropped from the apply.
 *  `front`/`back` are the (possibly edited) current values from the textareas. */
export interface HarvestDecision {
  include: boolean;
  front: string;
  back: string;
}

/**
 * Build the apply payload's `cards` array from the original candidates + the
 * wizard's per-card decision state. Excluded cards are omitted; included cards
 * echo the original candidate (origin/page/quote preserved) with the wizard's
 * current front/back trimmed in. A card whose front trims to empty is dropped
 * too (the server rejects `empty_card`; we never send one). Returns the cards in
 * their original order.
 */
export function buildHarvestSelection(
  candidates: HarvestCandidate[],
  decisions: HarvestDecision[],
): HarvestCandidate[] {
  const out: HarvestCandidate[] = [];
  for (let i = 0; i < candidates.length && i < decisions.length; i++) {
    const d = decisions[i]!;
    if (!d.include) continue;
    const front = d.front.trim();
    const back = d.back.trim();
    // Never emit a card the server would reject as empty_card.
    if (front.length === 0) continue;
    out.push({ ...candidates[i]!, front, back });
  }
  return out;
}

/** Number of cards that would be created from the current wizard state (drives
 *  the «Применить (N)» button label + its disabled state at N=0). */
export function harvestSelectionCount(
  candidates: HarvestCandidate[],
  decisions: HarvestDecision[],
): number {
  return buildHarvestSelection(candidates, decisions).length;
}

/** Seed a fresh decision array from the candidates — every card included, the
 *  textareas pre-filled with the AI's proposed front/back (full values). */
export function initialDecisions(candidates: HarvestCandidate[]): HarvestDecision[] {
  return candidates.map((c) => ({ include: true, front: c.front, back: c.back }));
}
