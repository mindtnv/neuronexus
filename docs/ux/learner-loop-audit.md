# Learner Loop Audit

## Readout

The shipped learner loop is materially closer to pilot-ready than the earlier broad-shell state. The main IA cleanup has landed:

- primary nav is reduced to Home, Review, Decks, and Settings
- mobile bottom tabs are reduced to Home, Review, and Decks
- first-run empty state now points to Create first deck only
- first root-deck creation routes directly into the editor
- review completion no longer points to a dead `/session/complete` route

The remaining UX risk is not breadth anymore. It is handoff clarity between Home, Decks, Editor, and Review.

## Main Friction

### 1. Home still launches card creation without clear deck context

Home has a strong Start review CTA, but Add card goes straight to `/editor?from=home`. In a multi-deck setup that creates a choice tax inside the editor instead of before it. The user has to infer where the new card belongs after already committing to creation.

### 2. Decks is structurally strong but action hierarchy is still too hidden

The tree model, nested counts, and first-deck handoff are good. The remaining friction is discoverability:

- desktop spreads actions across small inline buttons plus a kebab menu
- mobile compresses the row until the primary actions disappear into the menu
- the empty Decks state is passive if the user lands there without the first-run shortcut

The screen reads like a management table, but the product loop needs it to read like the main place to continue work on a deck.

### 3. Editor creation flow is better than edit flow

The create flow has a useful post-save state with Add another card and Start review. The edit flow is weaker:

- editing an existing card does not give a clear “saved, now what” outcome
- save keeps the user in place even when they entered from Review for a quick fix
- Home-origin creation is still under-specified because deck intent is unresolved

### 4. Review is functional, but still exposes expert-mode noise

The core review mechanics are usable now, but the surface still contains more scheduler detail than a regular-use pilot needs:

- stability, reps, lapses, and keyboard shortcut hints compete with the answer and grading task
- skip and backwards navigation suggest a non-linear session model, but the loop is framed everywhere else as a linear queue
- the user-facing decision is “grade this card”, while the UI still spends attention on system internals

### 5. Home is still more of a dashboard than a learner launchpad

The hero card is correct. The problem is what comes after it: the second large activity block reinforces analytics over continuation. For a regular-use learner loop, Home should mainly answer:

1. what is due now
2. what I should do next
3. how my streak or progress is doing

The current Home answers 1 and 3 well, but it still under-serves 2.

## Acceptance Criteria

### Home

- Home must keep one dominant action: Start review
- Home must keep one secondary action: Add card
- If the user has more than one deck, Add card from Home must not drop them into an ambiguous deck choice inside the editor. Engineering should either:
  - route the user through a deck picker before opening the editor, or
  - redirect Home add-card intent to Decks as the deck-selection surface
- Home secondary content must stay subordinate to the launch task. One progress block is enough; analytics must not push the next-action affordances below the fold on common laptop or mobile sizes

### Decks

- Decks must present one obvious next step on both desktop and mobile: create a card or start review for a deck
- The same primary actions must be visible without opening a secondary menu on mobile for the common case
- If the user reaches Decks with zero decks, the screen must provide a direct Create deck CTA, not just explanatory copy
- Nested deck management can stay, but destructive and structural actions should remain clearly secondary to Add card and Review

### Editor

- New-card flow:
  - first-deck creation must continue directly into card creation with that deck preselected
  - after a successful create, the editor must offer Add another card and Start review for the same deck
- Existing-card edit flow:
  - if launched from Review, Save must return the user to Review
  - if launched from Decks, Save must return the user to Decks or show an explicit back-to-deck path without requiring interpretation
- The editor should not require the user to infer where they came from or where they should go next

### Review

- Review must keep one primary task visible at a time: reveal answer, then grade card
- Advanced scheduler telemetry should be demoted or hidden from the default pilot surface
- Non-linear controls like backwards or skip should be removed from the default UI unless the session model intentionally supports them and the rest of the flow explains that behavior
- When the queue is empty, the CTA must point to a real next step:
  - deck-specific queue: add card to that deck
  - global queue: add card or return home
- Session completion must keep the user in the shipped loop and not branch into extra summary products

### Mobile Shell

- Bottom tabs remain Home, Review, and Decks only
- Review action bar must stay safely above the tab bar on small screens
- Decks mobile rows must surface the common action without forcing the user through the overflow menu every time
- The top-right new-card affordance is acceptable only if its deck-selection behavior is unambiguous

## Implementation Priorities

1. Resolve Home add-card deck ambiguity
2. Make Decks actions obvious on mobile and in empty state
3. Define explicit return behavior for Editor save by entry point
4. Reduce Review footer noise to the default learner task
5. Trim Home secondary analytics until the next-action path is visually dominant

## Handoff

Engineering should treat this as design acceptance criteria for the current learner-loop implementation, not as a request to reopen graph, garden, tutor, import, or other deferred surfaces.
