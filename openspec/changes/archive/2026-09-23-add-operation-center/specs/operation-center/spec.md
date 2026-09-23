# Spec Delta

## Purpose

Let users find ongoing source processing and study-artifact generation from any section, understand what is already usable, and resume completed or failed work safely.

## ADDED Requirements

### Requirement: Operations remain discoverable across navigation
The authenticated application SHALL provide a consistently reachable Operations control on desktop and mobile. It SHALL list accepted source processing/reprocessing and source/notebook artifact generation/regeneration independently of the initiating screen, recover their current state after reload and sign-in, and discover operations initiated by another session of the same account. Active entries SHALL remain discoverable regardless of age; recent entries SHALL include the latest run of each existing object completed within seven days, with explicit pagination and no silent truncation of active work.

#### Scenario: Leave a generating quiz
- **WHEN** a user starts a source quiz and navigates to Cards before completion
- **THEN** Operations continues to show that run and offers its ready result without reopening the source first

#### Scenario: Reopen from another session
- **WHEN** the owner reloads or opens another authenticated session while a supported operation runs
- **THEN** Operations discovers its server state without relying on the first browser's local record

#### Scenario: Many operations
- **WHEN** the account has more operations than fit on the initial page
- **THEN** the active count is accurate, further active entries can be loaded, and recent entries cannot displace active work

#### Scenario: Existing data at first rollout
- **WHEN** tracking is first enabled for an account with older completed work and currently active jobs
- **THEN** active jobs are discoverable without invented elapsed times, and old completions without reliable run timestamps are not presented as newly completed operations

### Requirement: Source status describes usable capabilities
Source operation entries and affected Library/Studio status presentations SHALL distinguish reading availability, parsing and search preparation. They SHALL offer reading when the applicable representation is available even if search is unfinished or failed. Disabled/degraded embedding SHALL produce an explanatory unavailable/waiting state rather than perpetual active progress. Percentages SHALL represent measured bounded work only, never time-based guesses or output-character counts presented as completion percentages.

#### Scenario: Parsed source is still indexing
- **WHEN** source text is readable and search preparation is actively running
- **THEN** the user sees “Можно читать; поиск ещё готовится” or its localized equivalent and can open the source

#### Scenario: Search cannot currently run
- **WHEN** embeddings are disabled or degraded for an otherwise readable source
- **THEN** reading remains available, search unavailability is explained, and that entry is not counted as actively processing

#### Scenario: Original PDF is readable before parsing
- **WHEN** original PDF bytes are available but parsing is incomplete
- **THEN** opening the PDF is offered without claiming that parsed-text study or search is ready

### Requirement: Results open in their actual study context
Ready entries SHALL open the exact accessible artifact, quiz or source through normal contextual navigation and unsaved-work guards. Completed source-owned work SHALL remain openable after source deletion when retained by existing ownership rules. Missing results SHALL show their unavailability and an accessible fallback without recreating work or silently opening another object.

#### Scenario: Open quiz while editing
- **WHEN** a user opens a ready quiz from Operations with unsaved editor input
- **THEN** the existing leave guard runs, Stay preserves the input, and a permitted transition opens that quiz with a valid return destination

#### Scenario: Retained or deleted result
- **WHEN** the source of a completed quiz is deleted
- **THEN** Operations opens the retained quiz through saved work, whereas deletion of the quiz itself removes its actionable result after refresh

### Requirement: Retry represents one explicit new attempt
Only eligible failed operations SHALL offer Retry. Retry SHALL revalidate ownership, prerequisites and the observed run, honor admission/cooldown limits, and preserve existing work and the known generation settings. Unavailable historical settings SHALL be disclosed before accepting replacement defaults. Concurrent clicks and retransmission after a lost response SHALL resolve to at most one replacement run. A stale retry SHALL NOT restart a newer run or overwrite a ready result. Opening the center, reconnecting and returning to a screen SHALL never retry work automatically.

#### Scenario: Retry response is lost
- **WHEN** the server accepts Retry but its response is lost and the same request is repeated
- **THEN** the same accepted run is returned and no second generation or reprocessing starts

#### Scenario: Another session has already retried
- **WHEN** a user retries an older failed entry after a newer attempt starts or finishes
- **THEN** the UI reconciles current state without launching another attempt

#### Scenario: Retry is currently impossible
- **WHEN** the source is missing, AI is unavailable, or the operation is rate limited
- **THEN** the user sees the applicable explanation or wait time while existing results remain unchanged

### Requirement: Observation failure does not become job failure
An unavailable observation request SHALL preserve the last known rows, label them as not up to date and offer reconnection; it SHALL NOT fabricate completion, failure or an empty history. Restart recovery SHALL reflect the actual worker outcome, including interrupted artifacts and resumed source processing. Late responses and prior runs SHALL never regress a newer run's displayed state.

#### Scenario: Connection disappears during processing
- **WHEN** polling fails after the operation was shown running
- **THEN** its last known state remains visible with connection feedback, and reconnect reconciles state without initiating a mutation

#### Scenario: Server restarts
- **WHEN** the API restarts during artifact generation
- **THEN** recovery exposes the interrupted result and an eligible explicit retry rather than a permanent spinner or a silently repeated generation

### Requirement: Operation discovery is private and compatible
All listing, counts, result resolution and retries SHALL be scoped to the authenticated owner and SHALL return only bounded presentation metadata, not source bodies, generated content, credentials or raw provider errors. Account changes SHALL immediately invalidate outgoing observations and announcements. Unavailable new API support SHALL leave existing study workflows usable and SHALL NOT fall back from a safe retry to an unsafe legacy mutation.

#### Scenario: Account changes during a request
- **WHEN** an old account's operation response arrives after another account signs in
- **THEN** no old title, status, counter or actionable result appears for the new account

#### Scenario: Older API during rollout
- **WHEN** Operations endpoints are unavailable on an older API
- **THEN** the control explains temporary unavailability while normal reading and existing study screens continue to work

### Requirement: Operations is calm and accessible
The control and its list SHALL support keyboard navigation, labelled statuses, reachable actions and narrow mobile viewports without covering essential study controls. Updates SHALL not steal focus, reorder the focused row out from under the user or repeatedly announce unchanged status. Opening the list SHALL not mark work successful or trigger it. Escape, outside dismissal and mobile Back SHALL close only the top applicable transient layer and preserve editing and navigation guards.

#### Scenario: Completion while studying
- **WHEN** a quiz becomes ready while the user types an answer elsewhere
- **THEN** the control updates with at most one polite completion announcement per observed run in that session and does not move focus or open the quiz automatically

#### Scenario: Close the mobile panel
- **WHEN** the mobile Operations panel is topmost and the user presses Back
- **THEN** the panel closes before route departure, preserving the underlying workspace and its input
