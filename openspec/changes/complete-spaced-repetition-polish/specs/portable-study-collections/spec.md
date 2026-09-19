## Purpose

Defines the observable portable study collections guarantees added by the second spaced-repetition polish, preserving user content and predictable study behavior.

## ADDED Requirements

### Requirement: History survives organization
The system SHALL preserve the history of a moved card when its former deck is deleted, and protect independent profile changes from review undo.

#### Scenario: History survives organization in use
- **WHEN** a reviewed card moves from A to B and A is deleted
- **THEN** the card and its complete review history remain available in B

### Requirement: Complete portable snapshot
The system SHALL export a versioned consistent user-scoped study snapshot with settings, notes, schedules, reviews and a media manifest and portable media archive.

#### Scenario: Complete portable snapshot in use
- **WHEN** an export runs during a review or a referenced media object is missing
- **THEN** the snapshot is coherent and missing objects are disclosed without exposing credentials

### Requirement: Validated import and recovery
The system SHALL preview restoration conflicts and CSV/TSV field mapping, preserve compatible schedules, prevent duplicate reimports and support selected text export.

#### Scenario: Validated import and recovery in use
- **WHEN** a user imports their snapshot twice or imports quoted multiline text
- **THEN** the preview and resulting counts agree and no existing data is silently overwritten

### Requirement: Isolated and recoverable operation
The system SHALL scope all data to the authenticated owner and preserve usable study and editing controls when an optional service fails.

#### Scenario: Foreign data or unavailable dependency
- **WHEN** a request references another user's resource or an optional dependency fails
- **THEN** no foreign data is exposed or modified and the user receives a recoverable result without losing unrelated work
