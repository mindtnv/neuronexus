# contextual-assistant-tools

## Purpose

Give the assistant consistent, context-aware abilities everywhere while retaining source boundaries, explicit approvals, and trustworthy links from generated cards to evidence.

## Requirements

### Requirement: Presentation-independent capabilities
The same account, enabled services, and explicitly selected context SHALL expose equivalent supported assistant operations from the floating window, Chats, a source, or a notebook. A notebook SHALL NOT remove otherwise available collection-management operations solely because the conversation started there. Unavailable services SHALL be described honestly.

#### Scenario: Create a deck while reading
- **WHEN** a user asks the assistant in a source or notebook to create a deck for new cards
- **THEN** the same preview and confirmed creation workflow available in Chats is available there

### Requirement: Primary context and explicit strict grounding
New conversations SHALL treat attached objects as primary context rather than a hard retrieval boundary. Supplementary explanation or retrieved material SHALL be distinguished from claims grounded in the attached sources, with actual evidence links where available. Users SHALL be able to request Only these materials through a visible control or an explicit conversational instruction. In strict mode, evidence-bearing reads/search SHALL be restricted to the effective selected context; unsupported answers SHALL acknowledge insufficient evidence instead of filling gaps from other materials. The model SHALL NOT relax strict mode through its tool arguments. Legacy notebook/deck scopes SHALL retain strict semantics until explicitly changed. Account-level metadata discovery and management SHALL retain ownership and preview checks in both modes.

#### Scenario: Broader explanation while reading
- **WHEN** a user mentions a book in focus mode and asks for an explanation
- **THEN** the assistant prioritizes that book and distinguishes supplementary explanation from facts supported by the book

#### Scenario: User requests only these sources
- **WHEN** a user selects Only these materials or explicitly asks to answer only from the attached sources
- **THEN** the effective strict policy is visible, retrieval is restricted before further content reads, and the answer acknowledges any evidence gap

#### Scenario: Notebook subset with general tools available
- **WHEN** a strict or legacy notebook conversation selects one of three notebook sources and asks a question about that source
- **THEN** source retrieval uses only the selected source even though the assistant also has collection-management tools

#### Scenario: Explicit cross-source comparison
- **WHEN** a user attaches a second owned source to that strict conversation
- **THEN** the next message visibly includes both sources and can compare them without changing earlier messages' context

### Requirement: Existing confirmation semantics everywhere
All assistant domain writes SHALL retain validated impact previews, explicit approval, relevant-state freshness checks, atomic execution with confirmation consumption, replay protection, and post-commit work scheduling. Context mentions, UI navigation, and reading referenced conversations SHALL not count as approval. Pending actions SHALL survive reload and presentation changes.

#### Scenario: Approve from a different presentation
- **WHEN** an unchanged card-edit preview created in the floating window is approved from Chats
- **THEN** the original edit commits once with its action result

#### Scenario: Referenced conversation contains a proposal
- **WHEN** the assistant reads a referenced conversation containing an unapproved write
- **THEN** that write remains unapproved and cannot be executed by reading or summarizing it

### Requirement: Grounded card provenance without notebook dependence
Cards created from supplied or retrieved source passages SHALL retain verified source provenance regardless of conversation origin. The creation preview SHALL identify the evidence selected for each proposed card. New explicit per-card evidence SHALL be checked against owned passages actually supplied/read for that turn, and unrelated passages SHALL not be attached to every card by default. Provenance and cards SHALL commit together; rejection, exclusion, and rollback SHALL not leave links for uncreated cards.

#### Scenario: Two cards from different sources
- **WHEN** two proposed cards use different verified passages and the user confirms them
- **THEN** each card links only to its selected evidence and can open the corresponding source location

#### Scenario: Create a source-backed card without a notebook
- **WHEN** a source-only conversation reads a passage and the user approves a card based on it
- **THEN** the card has a source backlink despite the conversation having no notebook

#### Scenario: Invented evidence or changed source
- **WHEN** proposed provenance names an unread/foreign passage or a source version that changed before approval
- **THEN** the new proposal or stale approval fails safely and cannot create a falsely grounded card

### Requirement: Context survives continuation and compression
Streaming, resume, regenerate, and history compression SHALL preserve explicit context, its focus/strict policy, and applicable source restrictions. Context text SHALL be treated as source data, not as instructions that can override ownership, scope, or approval rules. Pending actions SHALL use their stored context snapshot even when the current route or pins change.

#### Scenario: Long conversation is compressed
- **WHEN** older messages are summarized and the user continues discussing a pinned source
- **THEN** the source remains available through its verified reference and compression does not broaden scope or authorize a write

### Requirement: Independent degradation and privacy
Parsed source reading and object discovery SHALL work without embeddings; unavailable semantic search or web search SHALL not be presented as successful retrieval. If chat itself is unavailable, reading and manual study SHALL remain usable. Context objects, quotes, prompts, and generated content SHALL not enter operational logs or readiness responses.

#### Scenario: Parsed source without embeddings
- **WHEN** a source has readable parsed text but embedding is disabled
- **THEN** the configured chat assistant can read bounded text and cite it while semantic search is identified as unavailable

#### Scenario: Foreign tool target
- **WHEN** any presentation supplies a foreign resource to a read or write tool
- **THEN** the resource's content and private metadata remain inaccessible and no mutation occurs
