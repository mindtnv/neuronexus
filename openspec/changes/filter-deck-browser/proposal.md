# Proposal

## Why
The deck tree has no way to narrow a long list. Add useful controls while retaining its hierarchy and existing actions.

## What Changes
- Search deck names and filter All, Due or Empty using the same aggregate counts displayed in rows.
- Preserve ancestor context and reveal matching nested decks without overwriting saved expansion preferences.
- Add expand/collapse-all and a clear-filter empty state.

## Capabilities
### New Capabilities
- `deck-browser-filters`: Local filtering of the existing deck tree.
### Modified Capabilities
None.

## Impact
Web deck screen, pure tree helper and localized labels. No API, database or deployment changes.
