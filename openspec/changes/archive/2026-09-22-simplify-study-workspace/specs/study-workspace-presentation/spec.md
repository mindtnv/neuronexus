## Purpose
Keep authoring and review controls consistent, discoverable and unobtrusive without weakening content safety or study state protection.

## ADDED Requirements
### Requirement: Review keeps a stable shell and contextual actions
The reviewer SHALL keep normal navigation, omit focus mode and its shortcut, combine edit/skip/navigation actions with their keyboard hints and place undo with study actions, and retain the existing undo/edit keyboard semantics.
#### Scenario: Focus shortcut is retired
- **WHEN** a user presses F outside an input during review
- **THEN** the shell and reviewer remain unchanged
#### Scenario: Undo is available after a saved grade
- **WHEN** a grade can be undone
- **THEN** undo is available by the study controls and the existing keyboard shortcut, including after session completion

### Requirement: Related cards do not reveal answers early
Similar cards SHALL appear as a separate inspector section only after revealing an answer and only when matches exist. Narrow layouts SHALL provide the same content in a dismissible, focus-contained details dialog. Missing indexing, errors and empty results SHALL leave the section absent.
#### Scenario: Question is unrevealed
- **WHEN** the reviewer shows only a question
- **THEN** related-card content is neither fetched nor shown
#### Scenario: No matches
- **WHEN** a revealed card has no available similar cards
- **THEN** no empty similarity panel is shown and study remains usable

### Requirement: Personal type editing is discoverable
The cards toolbar SHALL expose an icon-only card-types entry with an accessible label and tooltip. Builtin types SHALL open for editing using the existing owner-scoped clone flow; applying it to existing notes SHALL retain the explicit scoped conversion workflow.
#### Scenario: Save an edited builtin
- **WHEN** a user edits and saves a builtin type
- **THEN** their own copy is saved and the global definition and other users' notes remain unchanged

### Requirement: Editor routes share current draft preview
Standalone and side-panel card editors SHALL expose the same edit/preview content and pinned save/delete controls, preserving owner-scoped draft recovery, type/version checks and review-return behavior.
#### Scenario: Unsaved preview round trip
- **WHEN** a user edits a field, switches to preview and returns to editing
- **THEN** the unsaved content is rendered and retained without a server save

### Requirement: Completion analytics stay in review
The completion screen SHALL show saved answer count, distinct card count, active answer duration and grade distribution in place, retaining undo. It MUST derive totals from successful session history and never include failed grades. The old summary route SHALL redirect to review rather than show another results screen.
#### Scenario: Undo the final answer
- **WHEN** the user undoes the last saved answer
- **THEN** the session resumes with updated totals and the undone answer is excluded from the next completion

### Requirement: Theme motion respects accessibility
A quick mode change SHALL reveal the new theme from the toggle's corner, with immediate switching when reduced motion is requested or view transitions are unavailable. Switching SHALL preserve the palette and final stored preference.
#### Scenario: Reduced motion
- **WHEN** a user requests reduced motion and changes mode
- **THEN** the theme changes immediately without a reveal animation

### Requirement: Type settings avoid redundant destinations
Saving a personal type SHALL return to the list without a clone-completion screen. Answer-mode settings SHALL use a compact dialog and retain the current preview and explicit mutation consent. Bulk conversion SHALL remain a staged mapping/preview/apply operation with readable source and target fields.
#### Scenario: Cancel conversion
- **WHEN** a user closes the mapping or preview dialog without applying
- **THEN** no notes, schedules or review history are changed

### Requirement: Session charts use observed answers
Completion SHALL visualize the actual grade distribution and duration in answer order from saved session history. A single answer MUST remain a single observation; grouped durations MUST be labelled as averages. Undo MUST remove the corresponding observation.
#### Scenario: One saved answer
- **WHEN** a session has one successful answer
- **THEN** charts show its grade and duration without invented trend points

### Requirement: Waiting needs no manual queue management
When a learning step is scheduled in the future, the waiting screen SHALL explain automatic resumption and omit Refresh queue and Finish session controls while retaining undo and navigation.
#### Scenario: Learning step becomes due
- **WHEN** the scheduled learning time arrives while waiting
- **THEN** the existing automatic queue refresh resumes study without a manual refresh or an early grade

### Requirement: Card actions have pointer and touch access
The card browser SHALL expose existing single and multi-card actions through right-click, keyboard and visible touch controls, with an explicit selection count. Actions SHALL retain server-authority and existing confirmation guards.
#### Scenario: Context menu scope
- **WHEN** a user opens actions on a selected row
- **THEN** actions target the existing selection; opening on an unselected row targets only that row
#### Scenario: Touch selection
- **WHEN** a user selects multiple cards on a touch screen
- **THEN** a compact selection control opens the same actions without requiring a right click

### Requirement: Graph legend can be collapsed independently
The graph SHALL offer a collapsible cluster list, initially collapsed on mobile. Collapsing the list MUST preserve individual cluster visibility filters.
#### Scenario: Return to filters
- **WHEN** a user hides a cluster, collapses the list and reopens it
- **THEN** the cluster remains hidden and its visibility can still be changed

### Requirement: Cards filters have adjustable width
The desktop cards filter rail SHALL resize from its right edge, remember the preferred width, remain bounded by available workspace width and support keyboard resizing and reset. Mobile filters SHALL retain their drawer layout.
#### Scenario: Return to the card browser
- **WHEN** a user changes the filter rail width and later reopens the browser
- **THEN** the preferred width is restored within the current viewport bounds
