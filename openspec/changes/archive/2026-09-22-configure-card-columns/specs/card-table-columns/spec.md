## Purpose
Allow users to choose relevant card fields while keeping table headers, rows and the final column aligned and accessible at every viewport width.

## ADDED Requirements

### Requirement: Configurable visible columns
The cards browser SHALL provide a Columns control for showing or hiding optional fields. Question and bulk selection SHALL remain available. Changing visibility SHALL preserve filtering, sort state and card selection.

#### Scenario: Hide and restore fields
- **WHEN** the user turns Answer or Updated off and on in Columns
- **THEN** the corresponding header and all matching cells disappear and reappear together without changing the search or selected cards.

### Requirement: Remember visibility safely
The browser SHALL remember desktop and mobile column choices separately. Defaults SHALL preserve the existing desktop fields and compact mobile fields. A reset SHALL restore defaults. Invalid or unavailable storage SHALL never prevent use of the table.

#### Scenario: Reload and reset
- **WHEN** a user hides fields and reloads at the same viewport class
- **THEN** the previous choice remains, and Reset restores that viewport's defaults.

#### Scenario: Damaged preference
- **WHEN** stored preferences are malformed or contain removed field identifiers
- **THEN** unsupported identifiers are ignored, Question remains visible, and controls still work.

### Requirement: Reachable aligned columns
All visible headers and cells SHALL share one horizontal layout. Overflow SHALL scroll within the table, with the final column fully reachable and no page-wide overflow.

#### Scenario: Narrow table with all fields
- **WHEN** selected fields exceed the available width
- **THEN** horizontal scrolling reveals the entire final column and row backgrounds and separators extend across every field.
