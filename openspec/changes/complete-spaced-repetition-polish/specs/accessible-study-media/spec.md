## Purpose

Defines the observable accessible study media guarantees added by the second spaced-repetition polish, preserving user content and predictable study behavior.

## ADDED Requirements

### Requirement: Accessible rich study
The system SHALL support keyboard and screen-reader operation, enlarged text, RTL fields and accessible media alternatives without revealing answers early.

#### Scenario: Accessible rich study in use
- **WHEN** a user studies and edits with assistive technology or increased zoom
- **THEN** all required controls and content remain operable, understandable and reachable

### Requirement: Bounded private media lifecycle
The system SHALL provide inspectable images and cancellable uploads, enforce bounded decoding, protect private-card media access and clean only verified unreferenced objects.

#### Scenario: Bounded private media lifecycle in use
- **WHEN** an upload fails, an account is deleted or a user requests another owner's private image
- **THEN** recovery and cleanup preserve referenced media and unauthorized content is not disclosed

### Requirement: Failure recovery on supported devices
The system SHALL survive supported mobile browser and installed-app lifecycle events without claiming offline grading, and expose bounded content-free operational failure signals.

#### Scenario: Failure recovery on supported devices in use
- **WHEN** network responses are lost or the browser is evicted during study
- **THEN** the user can recover confirmed work and operators can detect the failure without logging card content

### Requirement: Isolated and recoverable operation
The system SHALL scope all data to the authenticated owner and preserve usable study and editing controls when an optional service fails.

#### Scenario: Foreign data or unavailable dependency
- **WHEN** a request references another user's resource or an optional dependency fails
- **THEN** no foreign data is exposed or modified and the user receives a recoverable result without losing unrelated work
