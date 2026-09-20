## Why
Deck rows waste wide-screen space and cannot be arranged as a personal hierarchy. Users need recognizable icons, meaningful study counts and direct organization without losing mobile access.

## What Changes
- Choose a named icon and color for new and existing decks.
- Persist sibling order and move subtrees before, after or inside another deck, including back to root.
- Share right-click, keyboard and visible touch context actions.
- Display compact server study counts in rows and a selected-deck detail panel with a seven-day forecast; use a separate detail view on narrow screens.

## Capabilities
### New Capabilities
- `deck-workspace`: personal deck appearance, ordered hierarchy and contextual study details.
### Modified Capabilities
None.

## Impact
Deck schema gets an additive order field and migration; authenticated API gets an atomic move operation. Web tree ordering, store, deck screen and tests change. No new dependencies, scheduling algorithm changes, garden work, agent tools, content mutations or production deployment.
