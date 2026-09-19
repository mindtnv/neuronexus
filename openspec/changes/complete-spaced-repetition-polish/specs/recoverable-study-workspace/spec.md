## Purpose

Defines the observable recoverable study workspace guarantees added by the second spaced-repetition polish, preserving user content and predictable study behavior.

## ADDED Requirements

### Requirement: Recoverable writes and drafts
The system SHALL restore owner-scoped drafts and study context after reload or reauthentication and resolve retried writes without duplicate notes, grades or rewards.

#### Scenario: Recoverable writes and drafts in use
- **WHEN** a commit succeeds but the response is lost
- **THEN** retry or reconciliation returns the committed result and restores accurate session totals without another write

### Requirement: Intent-preserving authoring
The system SHALL support mapped note conversion, duplicate detection, repeated creation, copying and consistent tags while previewing changes that remove reviewed questions.

#### Scenario: Intent-preserving authoring in use
- **WHEN** an author changes fields so that an existing question disappears
- **THEN** the destructive impact is confirmed and unrelated content or history is preserved

### Requirement: Manageable collection
The system SHALL support complete scoped search counts, bulk impact and recovery, tag management, deck archive and merge, orphan recovery and keyboard navigation.

#### Scenario: Manageable collection in use
- **WHEN** a user performs an operation on a selection larger than the loaded page
- **THEN** the disclosed complete scope is processed once with user isolation and an actionable result

### Requirement: Bounded ongoing study
The system SHALL support pause, session targets, card inspection and a bounded history of completed sessions with consistent cross-tab results.

#### Scenario: Bounded ongoing study in use
- **WHEN** a long study session resumes after sleep or another client changes a card
- **THEN** time excludes pauses, stale versions are reconciled and the user retains their input

### Requirement: Isolated and recoverable operation
The system SHALL scope all data to the authenticated owner and preserve usable study and editing controls when an optional service fails.

#### Scenario: Foreign data or unavailable dependency
- **WHEN** a request references another user's resource or an optional dependency fails
- **THEN** no foreign data is exposed or modified and the user receives a recoverable result without losing unrelated work
