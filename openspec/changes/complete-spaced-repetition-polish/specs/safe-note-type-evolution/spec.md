## Purpose

Defines the observable safe note type evolution guarantees added by the second spaced-repetition polish, preserving user content and predictable study behavior.

## ADDED Requirements

### Requirement: Identity-preserving evolution
The system SHALL preserve field values and card history across renaming or reordering. Changes that add or remove questions SHALL show their impact before application.

#### Scenario: Identity-preserving evolution in use
- **WHEN** an author renames a field or reorders templates used by reviewed notes
- **THEN** values move to the intended field and histories remain attached to the same questions

### Requirement: Consistent schema changes
The system SHALL reject ambiguous field names and invalid template references, detect conflicting versions, reconcile generated cards and refresh dependent displays and search indexes.

#### Scenario: Consistent schema changes in use
- **WHEN** two clients edit a type while its notes are being created or edited
- **THEN** the result uses one consistent version or a recoverable conflict and never a mixture

### Requirement: Safe destructive changes
The system SHALL show complete user-scoped deletion counts and allow preserving or converting affected notes before deleting a type.

#### Scenario: Safe destructive changes in use
- **WHEN** a user deletes an in-use type
- **THEN** all affected notes and histories are disclosed and no other user is affected

### Requirement: Isolated and recoverable operation
The system SHALL scope all data to the authenticated owner and preserve usable study and editing controls when an optional service fails.

#### Scenario: Foreign data or unavailable dependency
- **WHEN** a request references another user's resource or an optional dependency fails
- **THEN** no foreign data is exposed or modified and the user receives a recoverable result without losing unrelated work

#### Scenario: Preview against existing content
- **WHEN** an author previews a template change
- **THEN** the system checks existing notes, shows bounded owner-scoped examples and omitted optional templates, and refuses to apply a change that leaves a note without a usable question or typed answer


### Requirement: Explicit answer-mode conversion
Changing the render kind SHALL be a separate owner-scoped preview/apply operation with a required source version and exact impact confirmation. Ordinary basic/custom transitions SHALL preserve question identity and history. Transitions involving cloze or typed-answer modes SHALL disclose replacement questions and history removal instead of silently reusing their schedules.

#### Scenario: Changed answer method
- **WHEN** an owner changes the answer mode of an existing type
- **THEN** all existing notes are validated, the preview explains new/retained/removed cards and removed reviews, and apply uses the exact current confirmation token

#### Scenario: Incompatible input or intervening study
- **WHEN** a cloze transition has no usable cloze, a typed-answer field is exposed on the question or absent from the answer, or a new review changes the confirmed impact
- **THEN** apply is rejected and the previous type, cards and history remain intact


### Requirement: Explicit note-to-type conversion
Owners SHALL be able to convert selected notes to an accessible target type with explicit field and question mappings. Preview SHALL disclose note scope, preserved/discarded fields and card/history impact. Apply SHALL atomically use the exact current consent while leaving the source definition and unselected notes unchanged.

#### Scenario: Apply a customized builtin copy
- **WHEN** an owner saves a personal copy of a builtin type and selects existing notes to use it
- **THEN** the UI explains that the original notes remain unchanged until converted, scopes selection by source type identity and offers the saved copy as the target

#### Scenario: Preserve compatible history
- **WHEN** an owner maps fields and corresponding templates in a compatible answer mode
- **THEN** matched card identities, schedules and reviews remain attached to the mapped questions, including reordered templates and numbered clozes

#### Scenario: Unmapped content and incompatible questions
- **WHEN** fields or questions have no correspondence
- **THEN** field values are preserved by default or explicitly disclosed for discard, incompatible questions start fresh only after the impact is confirmed, and any invalid note blocks the whole batch

#### Scenario: Concurrent changes or foreign selection
- **WHEN** source/target definitions, selected notes or reviews change after preview, or a selected resource is foreign
- **THEN** no partial conversion occurs and the operation requires a fresh authorized preview
