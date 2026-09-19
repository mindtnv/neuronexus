## Purpose

Make card study dependable from entry to completion: preserve scheduling, continue learning steps, show accurate availability, and recover without losing or duplicating grades.

## ADDED Requirements

### Requirement: Safe grade and undo
The system SHALL serialize an authenticated user's grade and undo effects and SHALL reject stale conditional grade or undo requests without changing cards, review history or profile. Existing grade/undo request shapes SHALL remain accepted. Updated clients SHALL send the displayed card's version and the specific review to undo.

#### Scenario: Concurrent grades of different cards
- **WHEN** a user grades two different cards concurrently
- **THEN** both successful grades contribute exactly once to history, XP and daily counters

#### Scenario: Duplicate or stale displayed card
- **WHEN** a conditional grade references a card version that has already changed
- **THEN** it fails with a conflict and no additional grade or rollup is written

#### Scenario: Undo after another session graded
- **WHEN** the requested review is no longer the user's latest review
- **THEN** undo fails with a conflict and does not revert the other session

#### Scenario: User isolation
- **WHEN** a grade, undo, queue or availability request references another user's resource
- **THEN** it does not expose or mutate that resource

### Requirement: Learning steps remain available
Regular study SHALL offer due learning and relearning cards independently of the daily review-card cap. A learning step SHALL neither introduce another new card nor consume the mature-review budget. Short steps scheduled within the current session SHALL return when due; users SHALL be able to end while waiting without losing saved grades.

#### Scenario: Review cap exhausted
- **WHEN** the review-card budget is exhausted and a learning card becomes due
- **THEN** that learning card remains available while capped review cards remain unavailable

#### Scenario: Again during regular study
- **WHEN** a successful grade schedules a short learning step
- **THEN** other ready cards remain studyable and the graded card returns only when due

#### Scenario: Nothing ready yet
- **WHEN** the session has only future learning steps
- **THEN** it shows waiting with the next due time and an explicit finish action instead of claiming that all learning is finished

### Requirement: Honest availability and recovery
Study entry points SHALL derive collection and deck counts from the complete server collection, exclude suspended cards from study availability, and apply existing daily caps. Loading, request failure, genuinely empty queues and exhausted daily limits SHALL be distinguishable. Failed requests SHALL offer recovery without reporting success.

#### Scenario: Large collection
- **WHEN** a user owns more cards than the bootstrap page contains
- **THEN** home and deck study availability includes cards outside that page

#### Scenario: Queue unavailable
- **WHEN** fetching the queue fails
- **THEN** the reviewer shows an error and retry action without showing completion or overwriting session results

#### Scenario: Filtered study
- **WHEN** a filtered session is launched
- **THEN** it communicates that ratings change scheduling while bypassing regular daily counters, and its gradeable queue excludes suspended cards

### Requirement: Predictable study interaction
Grades SHALL require answer reveal and SHALL not be submitted while another grade or undo is pending. Session history SHALL reflect successfully saved actions; repeated undo SHALL restore the matching card and exact session tallies. Keyboard shortcuts SHALL respect text editing, composition, interactive controls and open dialogs.

#### Scenario: Fast input
- **WHEN** a user double-clicks or holds a grading shortcut
- **THEN** at most one grade is submitted for that displayed version

#### Scenario: Undo across multiple cards
- **WHEN** the user successively undoes several grades from the session
- **THEN** each correct card is restored with corresponding count, duration and XP removed

#### Scenario: Type-in and rich cards
- **WHEN** the user types, selects card text, follows a link or interacts with a dialog
- **THEN** those interactions do not accidentally flip, skip or grade a card

### Requirement: Trustworthy session results
Session results SHALL use successful grade records from the current user and distinguish answers from unique cards. Unavailable forecasts SHALL not be displayed as measured zeroes. Ending or undoing a session SHALL not leave a stale success summary.

#### Scenario: Shared browser
- **WHEN** another user signs in on the same browser
- **THEN** they do not see the previous user's session summary

#### Scenario: Storage unavailable
- **WHEN** browser storage is unavailable
- **THEN** saving a grade still succeeds and the reviewer remains usable
