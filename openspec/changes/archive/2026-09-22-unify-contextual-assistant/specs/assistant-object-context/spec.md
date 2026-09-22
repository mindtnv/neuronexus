## Purpose

Provide a consistent way to attach readable study objects to assistant messages and conversations with discoverable references, precise context, and durable provenance.

## ADDED Requirements

### Requirement: Typed object mentions
The composer SHALL allow `@` discovery and attachment of cards, decks, library sources, source passages/sections, notebooks, written notes, flashcard notes, readable note types, generated study artifacts including quizzes, and conversations. Results SHALL identify their type, title, and relevant parent so same-named objects can be distinguished. Private objects SHALL be owner-scoped; shared built-in note types SHALL retain their existing read-only access rules. Search SHALL find server-side objects beyond the locally loaded card page without requiring embeddings.

#### Scenario: Card outside the initial page
- **WHEN** a user searches for a matching owned card that is absent from the local bootstrap page
- **THEN** the picker can find and attach that card without loading every card into the client

#### Scenario: Same title across types
- **WHEN** a book, deck, and notebook share a title
- **THEN** the picker distinguishes them by type and parent and attaches the exact selected identity

### Requirement: One attachment model across entry points
Object-level Ask actions, reader selection actions, composer mentions, and pinned context SHALL produce the same typed references. Users SHALL be able to inspect, open, remove, or pin those references. Mentioning an object SHALL supply primary context without automatically enabling strict-only retrieval. In an explicitly strict conversation, references SHALL contribute to its selected allowed context. Mentioning a deck SHALL not silently replace another selected deck. Attaching an object SHALL NOT authorize its modification.

#### Scenario: Compare decks
- **WHEN** a user mentions two decks in one message
- **THEN** both explicit references remain visible and usable without one replacing the other

#### Scenario: Mention is a focus by default
- **WHEN** a user attaches a book to a new conversation without requesting strict grounding
- **THEN** the book is primary context and the assistant can provide clearly identified supplementary explanation without presenting it as a quotation or claim from that book

### Requirement: Precise passage context
A passage reference SHALL identify its source and available page, section, chunk, or selection location and retain a bounded selected-text snapshot. The message SHALL distinguish an exact supplied excerpt from an entire document reference. Source ingestion changes SHALL not silently map an old selection to unrelated text.

#### Scenario: Source is reingested
- **WHEN** a passage's original chunk no longer exists after reingestion
- **THEN** history still shows the supplied excerpt, its live location is marked unavailable or explicitly re-resolved, and no unrelated passage is substituted

### Requirement: Bounded and explicit context resolution
Object attachments SHALL be bounded in count, excerpt size, and total payload. Large books, decks, notebooks, and conversations SHALL be accessed through bounded reading/search rather than silently inserted in full. The user SHALL receive an actionable error when limits are exceeded; supported context SHALL not be silently truncated or discarded. Referencing conversations SHALL not recursively expand their referenced conversations or authorize their pending actions.

#### Scenario: Oversized attachment set
- **WHEN** the user exceeds the published attachment or excerpt limits
- **THEN** sending is rejected with a clear explanation and the draft and attachments remain editable

#### Scenario: Conversation reference cycle
- **WHEN** two referenced conversations link to each other
- **THEN** the assistant can read bounded authorized transcript slices without recursive expansion

### Requirement: Verified identities and unavailable objects
The server SHALL validate type, ownership, and parent-child relationships for every new reference, and SHALL derive object labels and retrieval authority independently of client-supplied text. Unknown, deleted, foreign, and unreadable references SHALL have a safe unavailable outcome without revealing foreign metadata or broadening scope. Existing historical snapshots SHALL remain displayable to the original conversation owner.

#### Scenario: Forged passage parent
- **WHEN** a caller attaches a chunk from another source or account under an owned source ID
- **THEN** resolution rejects the relationship before model access or transcript insertion

### Requirement: Accessible picker and historical links
The picker SHALL support keyboard and touch selection, loading, empty, and retry states. Sent messages SHALL render object references as inspectable links with historical labels. Removing a composer chip SHALL not delete the underlying object.

#### Scenario: Failed search and retry
- **WHEN** mention search fails while a user is composing
- **THEN** the composer preserves the draft and selected objects and provides a retry action
