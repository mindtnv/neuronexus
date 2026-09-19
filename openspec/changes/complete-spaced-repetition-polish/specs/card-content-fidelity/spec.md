## Purpose

Defines the observable card content fidelity guarantees added by the second spaced-repetition polish, preserving user content and predictable study behavior.

## ADDED Requirements

### Requirement: Lossless source and inert code
The system SHALL preserve Markdown field source on save and reload. Literal code SHALL NOT be interpreted as HTML, math or cloze. Search SHALL preserve code text without media URLs.

#### Scenario: Lossless source and inert code in use
- **WHEN** an author saves code containing Array<T>, HTML examples or mathematical delimiters
- **THEN** reloaded source is unchanged, search finds its text and rendered examples remain inert

### Requirement: Explicit generated questions
The system SHALL create independent questions for distinct cloze numbers, support hints and balanced content, and preserve the identity and history of existing questions during conversion. Typed answers SHALL have an explicit target independent of field ordering.

#### Scenario: Explicit generated questions in use
- **WHEN** an author edits a multi-cloze or adds an explanatory field to a typed-answer note
- **THEN** each intended question keeps its own schedule and the expected typed answer does not silently change

#### Scenario: Splitting an existing aggregate cloze
- **WHEN** a user chooses to split an existing aggregate question and selects which numbered question retains its history
- **THEN** the preview discloses that choice, the selected question keeps the existing card ID and schedule, and other questions start new; without this action the legacy question remains unchanged

#### Scenario: Literal and malformed cloze syntax
- **WHEN** cloze-like text occurs inside code or a real cloze contains invalid numbering, unbalanced braces or excessive nesting
- **THEN** code is displayed literally, invalid new source is rejected with an authoring error, and invalid historical content does not crash the study screen or reveal a hidden answer

### Requirement: Diagnosable rendering
The system SHALL show all generated questions in preview, diagnose malformed rich content and avoid claiming unsupported styling works. Media-only questions SHALL be validated by renderable content.

#### Scenario: Diagnosable rendering in use
- **WHEN** a field contains malformed math, a diagram or an image-only question
- **THEN** the author receives a useful preview or diagnosis and can continue editing without losing the source

### Requirement: Isolated and recoverable operation
The system SHALL scope all data to the authenticated owner and preserve usable study and editing controls when an optional service fails.

#### Scenario: Foreign data or unavailable dependency
- **WHEN** a request references another user's resource or an optional dependency fails
- **THEN** no foreign data is exposed or modified and the user receives a recoverable result without losing unrelated work

### Requirement: Explicit typed answer contract
Type-in SHALL compare rendered plain text of a stable designated field. Authors MAY store up to 20 explicit plain-text alternatives of up to 256 characters. Matching SHALL ignore case, Unicode normalization and surrounding whitespace only, without choosing a review grade for the learner.

#### Scenario: Formatted answer and explicit alternative
- **WHEN** the answer field contains Markdown formatting and the learner enters its text or an explicitly accepted alternative
- **THEN** the comparison shows a match without including formatting or helper fields and the learner still selects the grade

#### Scenario: Legacy answer role migration
- **WHEN** an existing Type-in note type has no designated answer field
- **THEN** migration pins the previous last-by-ordinal field without changing source, field order, card identity or history


#### Scenario: Rich-content failure before and during study
- **WHEN** a visible math or diagram block cannot render in a preview or study card
- **THEN** its field and block are identified, a safe literal source and repair hint remain readable, neighboring content and study/edit/exit controls stay available, and hidden answer blocks are not disclosed
