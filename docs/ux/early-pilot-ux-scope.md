# Early Pilot UX Scope

## Goal

The early pilot validates one clear learner loop: create a deck, add cards, review due cards, and see progress. Anything that does not strengthen that loop is removed from primary navigation for pilot users.

## IA Decision

### Shipped core

- Home route `/`: launchpad for today learning. Primary CTA is `Start review`; secondary CTA is `Add card`. Keep compact progress only: due count, daily goal or streak or plant, and one supporting status block max.
- Review route `/review`: only the classic review flow ships. It must cover cards due, queue empty, and session complete without dead links or demo variants.
- Decks route `/decks`: collection management for the pilot. Users can create, rename, move, and delete decks, see aggregate counts, and enter card creation or review from here.
- Editor route `/editor`: contextual create and edit surface, not a primary destination. It is entered from Home, Decks, or edit actions; it should not live in main nav or mobile tabs.
- Settings route `/settings`: secondary utility surface only. Keep account and study-preference controls that are already real; do not expand it for pilot polish.

### Deferred from pilot IA

- Graph route `/graph`: not part of the pilot loop. Remove from sidebar, bottom tabs, command palette, and empty-state CTAs. Keep only as an internal route if engineering wants to preserve it behind the shipped shell.
- Garden route `/garden`: keep garden feedback embedded on Home, but defer the dedicated route from primary IA.
- Stats route `/stats`: defer from pilot IA.
- Achievements route `/achievements`: optional internal route only; do not make it a required part of the shipped loop.

### Mock-only or out of contour

- Coming-soon routes: `/import`, `/tutor`, `/leagues`
- Demo or preview routes: `/mobile`, `/mobile/review`, `/graph-hover`, `/palette`, `/cheatsheet`
- Preserved visual variants that are explicitly marked as mockups in code: extra review variants and extra graph variants
- Editor sidecars that are labeled TODO or visibly disabled: AI assistant, FSRS detail panel as a decision surface, history placeholder blocks
- First-run options that do not have real behavior yet: import PDF, from Anki, starter deck chips
- Any CTA that points to a missing or non-shipped route such as `/session/complete`

## Navigation Model

### Desktop

- Primary nav: `Home`, `Review`, `Decks`
- Secondary nav: `Settings`
- No primary-nav entries for `Graph`, `Garden`, `Editor`, `Stats`, `Import`, `Tutor`, or `Leagues`

### Mobile

- Bottom tabs: `Home`, `Review`, `Decks`
- `Editor` is opened contextually from CTA or row action, never as a tab
- No `Graph` or `Garden` mobile tabs for the pilot

## Screen-Level Requirements

### First-run onboarding

- After sign-in, a user with no decks gets one dominant next step: `Create first deck`
- After deck creation, route directly into card creation with that deck preselected
- After first card save, offer only two next actions: `Add another card` or `Start review`
- Do not expose import or sample-deck flows in the pilot onboarding

### Home

Home should answer three questions only:

1. What should I review now?
2. How am I doing today?
3. Where do I go to add or organize material?

Home should not act as an exploration hub for deferred surfaces. If space needs to be cut, keep the review hero and progress card first; remove graph or achievement browsing before touching core CTAs.

### Review

- Ship only the classic variant already wired on `/review`
- Deck-specific entry is allowed, but it must still feel like the same review product, not a second mode
- End-of-session summary must resolve inside the shipped flow: inline state on `/review` or a real shipped summary surface. No dead-end navigation.

### Decks

- Treat Decks as the management screen for structure, not as a feature showroom
- Hide inert controls, for example toolbar actions with no behavior, until they are functional
- Keep nested-deck semantics and the destructive-delete warning, because both match the data model and reduce ambiguity

### Editor

- Keep only fields and actions needed to create or edit a real card
- Remove disabled side panels and TODO blocks from the shipped editor surface
- Save and cancel behavior must return the user to the flow they came from without exposing unfinished AI affordances

## Acceptance Criteria For Engineering

- Signed-in users can complete the pilot loop without seeing a coming-soon, demo, or dead-link surface from normal navigation
- Sidebar, drawer, bottom tabs, and command palette expose only shipped pilot destinations
- First-run users have one obvious path: create deck to add card to start review
- Home remains focused on review launch plus compact progress; it does not advertise deferred routes as peers of the core loop
- Review uses one production variant and has a real completion state
- Decks and Editor show only working controls; disabled or TODO-backed panels are removed from shipped UI, not merely dimmed
- Mobile IA matches desktop IA: three core destinations, contextual editor, no preview-only shell
- [NEU-14](/NEU/issues/NEU-14) can implement shell simplification and flow hardening directly from this spec without reopening product scope

## Recommended Implementation Order

1. Simplify navigation and command palette to the shipped route set
2. Fix first-run onboarding so it feeds directly into deck and card creation
3. Remove mock-only editor and review affordances, including dead-end completion links
4. Tighten Home to the launchpad and progress role and demote deferred destinations
