## Purpose
Help users find relevant decks in a nested collection without changing their cards or losing tree context.

## ADDED Requirements

### Requirement: Filter the deck tree
The deck browser SHALL combine case-insensitive name search with All, Due and Empty filters based on its displayed aggregate counts. Matching descendants SHALL retain their ancestors. A matching parent name SHALL include its descendants that satisfy the status filter.

#### Scenario: Find a nested deck
- **WHEN** a user searches for a child of a collapsed deck
- **THEN** the matching child and ancestor path are visible

#### Scenario: Combine search and status
- **WHEN** a user chooses Due or Empty and enters a name
- **THEN** matching decks satisfy both filters, with nonmatching ancestors retained only as context

### Requirement: Preserve browsing state
Clearing filters SHALL restore the saved unfiltered expansion state. Expand/collapse-all SHALL affect the active view. Empty results SHALL offer a clear-filter action.

#### Scenario: Clear a search
- **WHEN** the user clears all active filters
- **THEN** the original tree expansion preference is restored

#### Scenario: No matches
- **WHEN** no deck matches
- **THEN** a visible empty state offers to reset search and status
