# navigation-context-continuity

## Purpose

Let users follow related study objects and return to their previous working position without rebuilding filters, selections or workspace panels, within the current authenticated browser tab.

## Requirements

### Requirement: Tab-local collection continuity
Library, Cards, Decks and Notebooks SHALL retain the current search, applicable filters and sort, inspected object, stable panel state and scroll position across navigation away and back, and reload of the same tab. Decks SHALL additionally retain the effective expanded tree state. A newly opened independent tab SHALL use its URL and existing preferences rather than another tab's navigation snapshots. Tab closure and cross-device restoration are outside this guarantee.

#### Scenario: Return to a filtered library
- **WHEN** a user searches the library, filters its sources, changes sort, scrolls to an item, opens it and returns
- **THEN** the same search, filters, sort and visible item position are restored without resetting the list to its default view

#### Scenario: Reload an inspected card
- **WHEN** a user reloads Cards with a selected card in its detail panel and a horizontally scrolled table
- **THEN** the same card, view settings and horizontal and vertical positions are restored after access and data validation, while unsaved edits remain governed by draft recovery

#### Scenario: Return to a deck or notebook collection
- **WHEN** a user returns to a searched deck tree or notebook list after opening related work
- **THEN** the query, applicable archive filter, inspected object and scroll position are restored, including the effective deck expansion state

### Requirement: Navigation intent determines restoration
Browser Back/Forward SHALL restore the addressed history entry, even when other entries use the same route. Sidebar and mobile-tab section navigation SHALL restore that section's most recent collection view without reopening its child reader or editor. An explicit object, query, filter or location link SHALL take priority over conflicting remembered state. A contextual object link without an explicit collection query SHALL open an unfiltered target collection with that object inspected. Resetting a collection view SHALL clear its search, filters, sort, inspected object and scroll state, retain appearance preferences, and replace its remembered view so reopening the section does not resurrect the reset state.

#### Scenario: Two visits to the same collection
- **WHEN** a user visits Cards with query A, follows another object to Cards with query B, then uses Back and Forward
- **THEN** each entry restores its own query and position, without the most recent Cards snapshot replacing both entries

#### Scenario: Explicit object outside remembered filters
- **WHEN** a source link or command-palette result opens a card excluded by the last remembered Cards filter
- **THEN** the requested card is shown in an unfiltered Cards view, and returning restores the original filtered view

#### Scenario: Section navigation and reset
- **WHEN** a user reopens Library through the sidebar, resets its view, leaves and opens Library again
- **THEN** the section opens the reset collection view, without reopening the last reader or restoring the cleared filters

### Requirement: Contextual returns preserve origin chains
Opening related sources, cards or editors SHALL retain the originating workspace entry and offer a labelled return action. Nested excursions SHALL preserve each origin independently. Browser history and application return actions SHALL agree on the destination; returning SHALL NOT create a repeated child-parent navigation loop. An unavailable or missing origin SHALL fall back to an accessible parent with a truthful label; no return action SHALL navigate to an arbitrary external URL.

#### Scenario: Library to source to card and back
- **WHEN** a user opens a book from Library, follows one of its cards, then uses the contextual return twice
- **THEN** the first return restores the book's reading location and panels, and the second restores the originating Library entry

#### Scenario: Reload preserves the return destination
- **WHEN** a user reloads the card reached from a reader and then chooses its contextual return
- **THEN** the reader origin remains available in the same tab and restores the prior location

#### Scenario: Direct entry has no origin
- **WHEN** a user opens a source URL in an independent tab
- **THEN** its return action leads to Library and does not claim an originating card, notebook or external page

### Requirement: Reading and stable workspace panels resume
Source and notebook workspaces SHALL restore the active reading representation, semantic reading location, applicable stable panels/tabs and their scroll positions. Restoration SHALL prefer the addressed history entry over the most recent reading position for that source, while a fresh explicit passage link SHALL take priority over both. Existing server-backed reading progress SHALL remain the fallback for entry without a tab snapshot. Restored panels SHALL refer to currently accessible objects and remain usable at the current viewport size.

#### Scenario: A citation does not replace the previous reading location
- **WHEN** a user reading page 42 follows a related card to a citation on page 8 of the same book and then returns through history
- **THEN** the citation visit shows page 8 and the prior reading entry resumes page 42

#### Scenario: Text reflows on a smaller viewport
- **WHEN** the user returns to a text source after its viewport width changed
- **THEN** the same available text anchor is brought into view rather than applying an obsolete absolute pixel position

#### Scenario: Workspace panel reload
- **WHEN** a user reloads a notebook or source with a saved-note or completed-artifact panel open
- **THEN** the same accessible object and panel tab reopen in the viewport-appropriate presentation without generating or saving anything

### Requirement: Restoration uses current data and bounded work
Restoration SHALL validate object access and current collection membership rather than treating snapshots as domain data. It SHALL recover positions beyond the first result page within a documented finite request/record budget. When an anchor is deleted, no longer matches, exceeds that budget or cannot load, the user SHALL retain the restored view settings, receive a usable available position and a non-blocking explanation with retry when applicable. Restoration SHALL NOT invent rows, clear valid filters, fetch indefinitely or treat failed requests as an empty collection.

#### Scenario: Anchor beyond the first page
- **WHEN** a user returns to a collection anchor on a subsequent result page within the restoration budget
- **THEN** the necessary pages load and the anchor returns to its previous visible position

#### Scenario: Deleted item or changed ordering
- **WHEN** the stored anchor is unavailable in the refreshed collection
- **THEN** the view shows current data at a surviving nearby anchor or the beginning, preserves its filters and explains that the exact position could not be restored

#### Scenario: Restoration cannot complete
- **WHEN** a network error or the finite restoration budget prevents locating the saved item
- **THEN** loaded results remain usable, no unbounded requests continue, and the user can retry or continue browsing

### Requirement: Restoration never overrides a newer user intent
Restoration SHALL finish only for its still-current account, navigation entry and view query. User scrolling, typing, selection or a new navigation SHALL cancel conflicting pending restoration. The UI SHALL avoid painting a default collection as restored content before applying known view settings. Keyboard returns SHALL restore a reachable logical focus target without forcing another scroll; reload SHALL NOT focus an editable input or open the mobile keyboard automatically. Reduced motion SHALL be respected.

#### Scenario: Slow response after manual scrolling
- **WHEN** the user scrolls or changes filters while delayed restoration is loading
- **THEN** the late result does not jump the viewport or replace the newer view settings

#### Scenario: Keyboard return
- **WHEN** a keyboard user opens a source from a library row and returns
- **THEN** focus returns to that row without a second scroll jump, or to the list heading if the row no longer exists

### Requirement: Navigation restoration is isolated and optional
Navigation snapshots SHALL be scoped to the authenticated account and current tab, bounded in storage and excluded from shared links, analytics and logs. Sign-out/account change SHALL clear the outgoing account's active navigation context and invalidate pending restoration. Invalid, incompatible or unavailable browser storage SHALL leave navigation usable, with in-memory restoration where possible and a non-blocking notice that reload restoration is unavailable. Only navigation context SHALL be discarded; domain records and independently managed drafts/preferences SHALL remain intact.

#### Scenario: Shared browser changes account
- **WHEN** another account signs in after navigation snapshots were captured
- **THEN** the previous account's queries, selected objects, origin labels and positions are neither displayed nor used, including from late asynchronous responses

#### Scenario: Storage denied or corrupt
- **WHEN** snapshot storage throws or contains malformed/incompatible data
- **THEN** the affected snapshot is ignored, navigation remains available, and no source, card, draft or preference is deleted

### Requirement: Existing state owners retain authority
Navigation SHALL reference the existing assistant, draft and study-session owners rather than serialize a second copy of their content or replay their actions. Return from review excursions and same-tab review reload SHALL resume through the recoverable study-session owner with current-state reconciliation, preserving its confirmed history and current answer state when still valid. Existing save/discard/stay guards SHALL cover applicable navigation paths, including browser Back/Forward; cancellation SHALL preserve the current entry and pending edits. Navigation restoration SHALL never submit a grade, save a draft, confirm an AI action or restore a transient bulk-action selection.

#### Scenario: Leave an unsaved editor
- **WHEN** a user attempts contextual return or browser Back with unsaved edits and chooses Stay
- **THEN** the editor, its input and current origin remain unchanged; no new history loop or save is produced

#### Scenario: Review excursion and reload
- **WHEN** a user inspects a source or related card during review, reloads the tab and returns
- **THEN** the existing recoverable session resumes after reconciling current card state, without duplicating grades, elapsed active time or session totals

#### Scenario: Assistant confirmation remains pending
- **WHEN** navigation restores a reader while its shared assistant has a pending write approval
- **THEN** the approval remains owned by that conversation and is not accepted or duplicated by restoration
