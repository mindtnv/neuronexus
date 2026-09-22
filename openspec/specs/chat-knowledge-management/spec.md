# chat-knowledge-management

## Purpose
Make personal library and notebook operations available in global chat while preserving ownership, explicit approvals, recoverable failures and readable activity previews.

## Requirements

### Requirement: Current discoverable knowledge tools
Global chat SHALL describe its actual enabled tool registry and SHALL support discovery and reading of library materials, notebook metadata, attached sources, written notes and generated artifacts. Parsed document reading SHALL remain available without semantic indexing. Notebook-scoped chat SHALL retain its existing checked-source boundary.

#### Scenario: Read a book without embeddings
- **WHEN** a user asks global chat about a parsed library PDF while embeddings are disabled
- **THEN** the agent can list the user's library and read its text chunks with source links without claiming semantic search succeeded.

#### Scenario: Foreign resource
- **WHEN** a tool is supplied another user's resource identifier
- **THEN** it returns no private resource content and cannot mutate that resource.

### Requirement: Explicit, durable write previews
Every added management or import write SHALL validate arguments and ownership and present an impact preview before mutation. The preview SHALL survive chat reload. Approval SHALL be rejected when the preview's relevant resource state has changed. Rejection SHALL perform no mutation.

#### Scenario: Confirm notebook update
- **WHEN** an update is proposed and the user reloads before confirming
- **THEN** the same target and proposed changes remain visible, and the unchanged operation can be applied once.

#### Scenario: Stale approval
- **WHEN** the target changes between preview and confirmation
- **THEN** the old approval does not mutate it and a fresh proposal is required.

### Requirement: Atomic execution and post-commit work
Confirmed mutations SHALL commit atomically with their chat tool result. Concurrent/replayed approvals SHALL not apply twice. Source import processing SHALL start only after commit.

#### Scenario: Rollback
- **WHEN** a confirmation transaction fails or loses a replay race
- **THEN** its mutation is rolled back and no import worker is scheduled by that transaction.

### Requirement: Honest bounded failures
Tool responses SHALL be bounded, omit credentials/storage internals, and distinguish unavailable indexing, missing resources and invalid arguments. Reads SHALL not fabricate data or modify resources.

#### Scenario: Oversized read
- **WHEN** a result exceeds the response budget
- **THEN** the tool requests a smaller range instead of silently dropping pages or inventing a cursor.
