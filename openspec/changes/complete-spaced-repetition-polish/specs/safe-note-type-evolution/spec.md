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

#### Scenario: Complete deletion impact and current consent
- **WHEN** an owner opens deletion for a type used beyond the loaded card page
- **THEN** a read-only consistent snapshot reports all owned notes, cards and reviews, including notes without cards; delete requires its exact token and rejects changed membership, content or study history without partial deletion

#### Scenario: Preserve before deleting
- **WHEN** the owner chooses conversion or JSON export from the deletion preview
- **THEN** no deletion runs, selection is scoped by source type ID, JSON includes persisted notes without cards, and converted notes/cards/reviews survive subsequent deletion of the old type

#### Scenario: Interrupted deletion
- **WHEN** deletion times out during a cascade or the browser loses its response
- **THEN** a database timeout rolls back the entire operation, while an uncertain browser result requires state reconciliation before further action

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

### Requirement: Bounded type-wide edits
Type-wide regeneration SHALL admit at most 1000 notes, 2000 existing or resulting cards, and 2 MiB of source, field-expanded templates or generated search text per operation. Exceeding the limit SHALL leave the type and its notes/cards unchanged and offer a copy-and-convert path. Metadata-only edits SHALL not regenerate the collection.

#### Scenario: Large collection or slow database
- **WHEN** an edit exceeds admission limits, cannot obtain a lock within 750 ms, or exceeds its 5-second transaction work budget or 2-second SQL statement timeout
- **THEN** it returns a recoverable error without partially applying the type, preserves the editor draft, and does not enqueue rolled-back card changes

#### Scenario: Copy a large type
- **WHEN** an owner saves the preserved draft as a new type
- **THEN** the original definition and notes remain unchanged and the new copy can be applied through explicit bounded note conversion
