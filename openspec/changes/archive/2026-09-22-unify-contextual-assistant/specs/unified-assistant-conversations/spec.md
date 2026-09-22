## Purpose

Keep every assistant conversation discoverable and resumable with its original context regardless of the page or presentation where it was created.

## ADDED Requirements

### Requirement: Unified conversation library
Chats SHALL list all of the authenticated user's persisted conversations, including existing notebook conversations and new object-started conversations. Every presentation SHALL open the same conversation identity, transcript, title, pinned state, model selection behavior, and pending actions. The list SHALL support context labels and object filters without duplicating conversations.

#### Scenario: Reopen a book conversation
- **WHEN** a user starts a conversation from a book, sends a message, closes the window, and later opens Chats
- **THEN** the conversation appears once with the book context and opens the original transcript

#### Scenario: Existing notebook history
- **WHEN** an existing notebook conversation is opened through the unified list
- **THEN** its identity, transcript, checked-source semantics, and pending approval remain available

### Requirement: Explicit conversation and message context
Conversations SHALL support persisted pinned context and a visible focus-versus-strict policy; messages SHALL retain the effective policy, context, and bounded snapshots used for that message. New conversations SHALL default to focus, while legacy restricted scopes SHALL retain strict semantics until explicitly changed by the user. A new object-started conversation SHALL visibly propose the initiating object as context. Navigating to another page SHALL NOT change an existing conversation's context or policy. Explicit object Ask actions SHALL offer adding to the current conversation or starting a separate one, without a mutation-approval dialogue merely to attach readable context. The global launcher on Review and Decks SHALL open a session for the active card or selected deck. While the floating assistant is open, selecting another such page object SHALL switch to its contextual session or a new draft, preserving the previous conversation, draft, stream and pending approval unchanged. Resolving the new context SHALL temporarily prevent sending with stale page context.

#### Scenario: Navigate from Review to a selected deck
- **WHEN** a card conversation is floating and the user navigates to Decks and selects a deck
- **THEN** the assistant opens a deck-scoped session without carrying the card into its new context, preserves the card conversation unchanged, and restores that contextual session when returning to the card

#### Scenario: Change pinned context
- **WHEN** a user changes the conversation's pinned objects after several messages
- **THEN** future messages use the new visible context and earlier messages retain their original context snapshots

#### Scenario: Reopen a strict conversation
- **WHEN** a user requests answers only from selected materials, then reopens the conversation from Chats
- **THEN** strict policy and its selected context remain visible and are used for the next message unless the user changes them

### Requirement: Durable and honest replay
Reopening, continuing, regenerating, and resuming SHALL reconstruct the applicable stored context rather than infer it from the current route. Historical labels and excerpts SHALL remain understandable after edits, while access to current object content SHALL be revalidated. Regeneration SHALL reuse the stored user message's context unless an explicit edit replaces it. A pending mutation SHALL remain bound to its original preview and relevant state.

#### Scenario: Regenerate from another page
- **WHEN** a source-grounded answer is regenerated while the user is viewing an unrelated deck
- **THEN** the original user message's source context is used and the unrelated deck is not attached

#### Scenario: Context changes after a proposal
- **WHEN** a user changes pinned context while a write awaits confirmation
- **THEN** confirmation applies only the originally previewed operation if still valid and never retargets it to the new context

### Requirement: Context deletion does not delete conversation history
Deleting a referenced source, card, deck, or notebook SHALL NOT delete the conversation solely because of that reference. The history SHALL retain bounded historical context and display unavailable links honestly; deleted objects SHALL not be read or mutated. Deletion SHALL not change the context policy: an empty strict scope stays empty, while focus mode discloses missing primary context and cannot claim to have consulted it.

#### Scenario: Delete a notebook
- **WHEN** a notebook containing an existing conversation is deleted
- **THEN** the conversation remains in Chats, the notebook context is unavailable, and the assistant does not substitute unrelated sources as if they were that notebook's evidence

### Requirement: Backward-compatible conversation access
Existing conversation IDs and deep links SHALL continue to resolve for their owner. Legacy notebook, source-selection, deck-scope, and card-mention request forms SHALL retain their defined restrictions through compatibility handling. A legacy-only global listing filter SHALL remain available for older consumers that require it. Mixed clients SHALL not silently lose new context metadata or execute unsupported pending tools.

#### Scenario: Old source selection
- **WHEN** a legacy notebook client sends an explicitly empty source selection
- **THEN** the request has an empty document scope rather than all notebook or account sources

#### Scenario: Server version changes after capability discovery
- **WHEN** a modern client with cached context support reaches an older server for a conversation mutation, stream, resume, or regeneration
- **THEN** the context-v1 request fails without inserting a message or consuming a pending action through a legacy route, and the client preserves its draft or pending decision

### Requirement: Owner isolation
Conversation listing, context metadata, retrieval, links, and mutations SHALL enforce owner access independently of supplied object or conversation identifiers.

#### Scenario: Foreign conversation identifier
- **WHEN** a user attempts to open or resume another user's conversation
- **THEN** no transcript, context labels, or action metadata is returned and no action occurs
