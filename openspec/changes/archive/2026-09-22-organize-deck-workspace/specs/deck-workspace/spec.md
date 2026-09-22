## Purpose
Let users recognize, arrange and study their personal deck hierarchy across desktop and touch devices.

## ADDED Requirements
### Requirement: Deck appearance is personal and persistent
Users SHALL choose among at least 48 named icons and 30 colors when creating or editing a deck. Existing decks without a recognized icon SHALL retain a readable default.
#### Scenario: Reload an appearance edit
- **WHEN** an owner saves an icon and color and reloads
- **THEN** the deck retains both values without altering its cards

### Requirement: Hierarchy moves are atomic and durable
Owners SHALL move a deck with its subtree before, after or inside a target, or to root. Sibling ordering SHALL survive reload. Moves MUST reject cycles, missing targets and foreign decks, including concurrent conflicting moves.
#### Scenario: Reorder siblings
- **WHEN** a deck is moved before another sibling
- **THEN** the requested order persists and descendants remain attached to their original parent
#### Scenario: Invalid destination
- **WHEN** a move targets the deck itself, its descendant or another owner's deck
- **THEN** no hierarchy or order changes are committed
#### Scenario: Concurrent cycle
- **WHEN** opposite moves race to nest two decks inside each other
- **THEN** at most one succeeds and the final hierarchy is acyclic

### Requirement: Organization works with keyboard and touch
The list SHALL offer desktop dragging with visible insertion feedback and equivalent explicit move actions through right-click, keyboard and visible touch menus. Deletion SHALL retain confirmation including descendant impact.
#### Scenario: Touch movement
- **WHEN** a touch user opens a deck menu and chooses Move
- **THEN** they can select a destination and relative placement without dragging

### Requirement: Deck study details use authoritative counts
Rows SHALL show compact study counts and a selected deck SHALL show server-derived state totals and a seven-day forecast including its descendants. Wide layouts SHALL place details beside the list; narrow layouts SHALL provide a returnable detail view.
#### Scenario: Partial card cache
- **WHEN** the cached card list contains only some cards
- **THEN** deck counts still represent the complete server scope
#### Scenario: Read failure
- **WHEN** counts or forecast fail to load
- **THEN** the UI shows unavailable data and a retry rather than fabricated zeroes
