## Purpose

Defines the observable study scheduling controls guarantees added by the second spaced-repetition polish, preserving user content and predictable study behavior.

## ADDED Requirements

### Requirement: Explicit day and budgets
The system SHALL use one configurable study-day boundary and explain collection, ancestor and deck budgets consistently. Existing users SHALL retain UTC defaults until changed.

#### Scenario: Explicit day and budgets in use
- **WHEN** a user studies across midnight, a timezone transition or concurrent tabs
- **THEN** budget usage and day statistics follow the selected policy without an accidental reset or hidden overrun

### Requirement: Reversible scheduling controls
The system SHALL distinguish daily bury, sibling bury, suspension, reset and set-due, provide predictable learning and new-card ordering, and disclose preset effects.

#### Scenario: Reversible scheduling controls in use
- **WHEN** a user modifies scheduling or returns a leech to study
- **THEN** the resulting state and next availability are explained, retained across reload and compatible with undo

### Requirement: Separate practice mode
The system SHALL provide practice without schedule changes separately from rescheduling filtered study, with previewed bounded selection and stable session order.

#### Scenario: Separate practice mode in use
- **WHEN** a user starts non-rescheduling practice from a deck or search
- **THEN** only the selected available cards appear and normal FSRS and daily counters remain unchanged

### Requirement: Isolated and recoverable operation
The system SHALL scope all data to the authenticated owner and preserve usable study and editing controls when an optional service fails.

#### Scenario: Foreign data or unavailable dependency
- **WHEN** a request references another user's resource or an optional dependency fails
- **THEN** no foreign data is exposed or modified and the user receives a recoverable result without losing unrelated work
