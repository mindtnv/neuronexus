## Purpose

Defines the observable trustworthy study insights guarantees added by the second spaced-repetition polish, preserving user content and predictable study behavior.

## ADDED Requirements

### Requirement: Honest metric definitions
The system SHALL count Hard as successful recall, distinguish first daily retention from all-answer success, preserve known review source and label unknown historical source.

#### Scenario: Honest metric definitions in use
- **WHEN** a user views retention after Again, Hard, Good and Easy responses
- **THEN** recall success is 75 percent and other measures state their exact population

### Requirement: Complete scoped analytics
The system SHALL compute deck and subtree metrics over all owned cards, use actual FSRS metrics and effective targets, and expose bounded aggregates and paginated history.

#### Scenario: Complete scoped analytics in use
- **WHEN** a collection exceeds the bootstrap page and contains nested decks
- **THEN** metrics match the full selected scope and drill-down uses the same definitions

### Requirement: No fabricated observations
The system SHALL distinguish missing data from zero, show sample size, align calendar buckets and separate scheduled due dates from hypothetical workload.

#### Scenario: No fabricated observations in use
- **WHEN** a day has no reviews or a forecast omits not-yet-studied cards
- **THEN** charts and labels state the limitation without fabricated retention or activity

### Requirement: Isolated and recoverable operation
The system SHALL scope all data to the authenticated owner and preserve usable study and editing controls when an optional service fails.

#### Scenario: Foreign data or unavailable dependency
- **WHEN** a request references another user's resource or an optional dependency fails
- **THEN** no foreign data is exposed or modified and the user receives a recoverable result without losing unrelated work
