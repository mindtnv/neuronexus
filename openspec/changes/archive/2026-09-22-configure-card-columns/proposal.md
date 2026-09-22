# Proposal

## Why
The cards table overflows its row backgrounds and clips its final column. Users cannot hide irrelevant fields to make the table fit their workflow.

## What Changes
- Give header and rows one shared minimum-width canvas with horizontal scrolling.
- Add a Columns picker with persistent desktop/mobile visibility preferences and reset defaults.
- Keep Question and bulk-selection controls visible; preserve sorting, filtering and editor behavior.

## Capabilities

### New Capabilities
- `card-table-columns`: Select visible card fields and retain a readable, aligned table at every width.

### Modified Capabilities
None.

## Impact
Web cards browser, shared column configuration, local preference storage and translations. No API, database, dependency or deployment changes.
