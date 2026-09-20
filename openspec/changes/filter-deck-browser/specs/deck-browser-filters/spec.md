## Purpose
Help users find relevant decks in a nested collection without changing their cards or losing tree context.

## ADDED Requirements

### Requirement: Filter the deck tree
The deck browser SHALL provide case-insensitive name search. Matching descendants SHALL retain their ancestors. A matching parent name SHALL include its descendants. The retired All, Due and Empty status controls SHALL be absent.

#### Scenario: Find a nested deck
- **WHEN** a user searches for a child of a collapsed deck
- **THEN** the matching child and ancestor path are visible

#### Scenario: Search without status controls
- **WHEN** a user opens the deck browser
- **THEN** name search and tree expansion controls are available without All, Due or Empty status filters

### Requirement: Preserve browsing state
Clearing filters SHALL restore the saved unfiltered expansion state. Expand/collapse-all SHALL affect the active view. Empty results SHALL offer a clear-filter action.

#### Scenario: Clear a search
- **WHEN** the user clears all active filters
- **THEN** the original tree expansion preference is restored

#### Scenario: No matches
- **WHEN** no deck matches
- **THEN** a visible empty state offers to reset search
