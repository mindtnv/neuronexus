## MODIFIED Requirements

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
