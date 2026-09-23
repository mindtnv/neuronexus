# Proposal

## Why

Moving from a filtered collection to a source, card or editor can lose the list, selection or reading location that led there. Reomi needs predictable return journeys so opening related work does not require reconstructing the previous workspace.

## What Changes

- Preserve navigation context through in-app navigation, browser Back/Forward and reload of the current tab, as explicitly selected by the user. A different device or a newly opened independent tab does not inherit this context.
- Restore Library, Cards, Decks and Notebooks list search/filter/sort state, the inspected object, stable workspace panels and their scroll positions. Restore individual notebook/source workspaces, including a nested source opened from a notebook.
- Distinguish return to an exact history entry from reopening a section through the sidebar or mobile tabs. Section navigation restores its last collection view; it does not unexpectedly reopen a child reader or editor.
- Preserve the origin chain for source/card/editor excursions and show a contextual return action. Explicit object/location links take priority over remembered context; direct entry without an origin has a predictable parent fallback.
- Restore locations using stable objects and reader anchors, reconcile current data, and stop late restoration when the user interacts. Deleted objects, unavailable storage and deep pagination have bounded, usable fallbacks.
- Integrate with existing editor draft guards, assistant ownership and the planned recoverable study-session controller, without introducing parallel persistence of their content or mutations.

## Capabilities

### New Capabilities

- `navigation-context-continuity`: tab-local workspace snapshots, explicit navigation intent, history/origin restoration, bounded reconciliation and account isolation.

### Modified Capabilities

- `source-study-workspace`: extend the existing same-reader return contract to history/reload and multi-step excursions, preserving the source and notebook origins.

## Impact

- Web shell/navigation and route adapters; Library, Cards, Decks, Notebooks, source/text/PDF readers, source links, editor and review entry/return integrations. Existing server-backed reading progress and preference stores remain authoritative for their own purposes.
- No new server endpoint, database table, index, required environment variable or dependency is planned. Existing links remain accepted. New URL view parameters are optional and contain no origin snapshots or private document contents.
- `complete-spaced-repetition-polish` already owns durable draft recovery and study-session recovery (especially R2-049 through R2-059). Exact review-session return/reload acceptance depends on its compatible session owner; this change owns routing to that owner, not a second session implementation. This prerequisite must be verified before this change is declared complete.
- Non-goals: cross-device synchronization; a promise to resume after browser/tab closure; offline study or mutation replay; new home-screen resume UI; a global activity feed; preservation of transient menus, native text selections, bulk-action selections or confirmation dialogs; comprehensive restoration of graph/stats/settings subviews. Existing behavior in those secondary views must not regress.
