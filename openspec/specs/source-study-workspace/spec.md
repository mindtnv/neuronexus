# source-study-workspace

## Purpose

Let a user read, discuss, annotate, and retain knowledge from an uploaded source immediately, with notebooks serving as optional collections of study materials.

## Requirements

### Requirement: A source is independently usable for study
Opening an owned library source SHALL provide reading, contextual assistant access, written notes, the existing supported study-artifact and quiz types, and card creation without requiring or automatically creating a notebook. Applicable AI capabilities SHALL retain their independent availability gates. Source-started conversations SHALL be available from the source and from Chats.

#### Scenario: First uploaded book in an empty account
- **WHEN** a user uploads a supported book, opens it, and asks about a passage
- **THEN** the assistant opens over the reader with that context and a conversation can be saved without any notebook being created

### Requirement: Same full reader from a notebook
Opening a source through a notebook SHALL expose the same reading and annotation capabilities as opening it through the library. The user SHALL retain the originating notebook and return position without losing the active conversation or duplicating the source. Source-specific Ask actions SHALL make their proposed source/passage context visible rather than silently use every notebook source. The notebook's active tab, inspected saved work and reading origin SHALL survive same-tab reload and browser Back/Forward. Following a card or another source from that reader SHALL retain the nested origin chain; return SHALL restore the reader first and its notebook on the next return. Restoration SHALL use the authenticated account's currently accessible objects and preserve existing draft and assistant ownership.

#### Scenario: Read and annotate a PDF from a notebook
- **WHEN** a user opens a notebook PDF
- **THEN** full PDF reading, selection, annotation, and card actions are available, and returning restores the notebook workspace

#### Scenario: Reload a nested notebook reader
- **WHEN** a user opens a source from a notebook, scrolls to a passage and reloads the tab
- **THEN** the same source and passage reopen and the return action restores the notebook's prior stable workspace state

#### Scenario: Notebook reader to card and back
- **WHEN** a user opens a linked card from a notebook's reader and returns twice
- **THEN** the first return restores that source location and the second restores the notebook, without recreating a conversation or source

#### Scenario: Browser Back closes the reader
- **WHEN** a user opens the full reader from a notebook and presses browser Back
- **THEN** the reader closes to the originating notebook state; Forward reopens that reader entry

#### Scenario: Notebook origin becomes unavailable
- **WHEN** the originating notebook is deleted or no longer accessible before return
- **THEN** the independently owned source remains usable when accessible and return offers the notebook collection rather than resurrecting the unavailable notebook

### Requirement: Text sources support selection-to-study actions
Readable web-page, EPUB, and pasted-text representations SHALL support selecting a passage and asking about it, saving a highlight/note, or proposing a card while preserving source location. PDF-specific drawing tools SHALL remain available for PDFs without being implied for text sources. If a format cannot provide a stable selection location, the UI SHALL preserve the supplied quote and disclose the available source-level location instead of inventing one.

#### Scenario: Study a documentation page
- **WHEN** a user selects text in an imported web page and chooses Ask or Create card
- **THEN** the selected text and source location are attached through the same context/provenance mechanism used elsewhere

### Requirement: Source-owned notes and artifacts
Written notes and generated study artifacts created in a standalone source workspace SHALL persist for the user with their source origin and remain accessible on reopen. Notebook-owned notes and artifacts SHALL retain their existing ownership. Attaching a source to a notebook SHALL expose its existing study work without cloning or moving it; detaching it SHALL not delete source-origin work. Source deletion SHALL preserve written notes, completed study artifacts/quizzes, quiz attempts, created cards, and conversations with historical source labels and unavailable live links. Retained notes/artifacts SHALL remain discoverable and openable through the library and `@`, without requiring a live source or a newly created notebook. Deleting retained work SHALL be a separate explicit action.

#### Scenario: Attach a studied book later
- **WHEN** a user attaches a book with notes, quiz attempts, and cards to a notebook
- **THEN** the source's existing study work remains the same data and is accessible when opening the book from that notebook

#### Scenario: Detach or delete a notebook
- **WHEN** a notebook membership is removed or the notebook is deleted
- **THEN** source-owned study work remains with the source while notebook-owned study work follows the notebook's documented deletion rules

#### Scenario: Delete a studied source
- **WHEN** a user deletes a book with written notes, a completed quiz and attempts, cards, and conversations
- **THEN** those study results retain their identities, remain accessible to their owner, and show that the original source is unavailable

#### Scenario: Use retained study work
- **WHEN** a user opens a retained note or completed quiz after deleting its source
- **THEN** the note remains editable, the quiz remains playable with its attempt history, and regeneration that needs the missing source is unavailable with an explanation

#### Scenario: Delete a source during generation
- **WHEN** a source is deleted while one of its artifacts is pending or generating
- **THEN** generation stops with a terminal unavailable-source result, cannot overwrite completed work, and does not delete other retained study results

### Requirement: Card creation can start from an empty collection
A user studying a source with no decks SHALL be able to create or select a destination deck without losing the reader position or draft card. Assistant-created decks and cards SHALL use the shared confirmation workflow; direct user-created cards SHALL retain their normal explicit save behavior. Saved cards SHALL appear in the existing study system with source backlinks.

#### Scenario: First card from the first book
- **WHEN** a user with no decks asks for a card from a passage
- **THEN** the user can establish a destination deck, review the card and its source, save it, and continue reading without visiting an unrelated setup screen

### Requirement: Reading and study remain resilient and isolated
Source loading, parsing, chat, embedding, and artifact failures SHALL show distinct actionable states and SHALL not erase existing annotations, notes, cards, or conversations. All source-study operations SHALL validate source and owner access. Manual reading, annotations, notes, and card creation SHALL remain available when their required source content is readable and AI services are unavailable.

#### Scenario: Artifact generation fails
- **WHEN** a source quiz generation fails
- **THEN** the failure is shown on that artifact and existing reading progress, notes, and cards remain available

#### Scenario: Foreign source study endpoint
- **WHEN** a user requests notes, artifacts, or card creation for another user's source
- **THEN** no private study data is returned and no study object is created
