# Recoverable Small Actions Specification

## Purpose

Make everyday edits understandable and recoverable through honest save feedback, retained input and safe reversal of a deliberately bounded set of changes.

## Requirements

### Requirement: Save feedback describes the current input
Card and note-type editors, written study notes, source metadata, notebook titles and deck metadata SHALL use consistent inline saving, saved and failed-with-retry feedback. Saved SHALL mean the displayed revision has been acknowledged by the server; a local draft or an older response SHALL NOT mark newer input as saved. Existing explicit-save versus automatic-save behavior SHALL remain unchanged.

#### Scenario: User types while a save is pending
- **WHEN** a save for revision A completes after the user has entered revision B
- **THEN** B remains visible and unsaved, and the response neither clears B's draft nor claims it was saved

#### Scenario: Server rejects the edit
- **WHEN** a validation, network or server error prevents confirmation of a save
- **THEN** the affected editor keeps all entered values and selection context, exposes a nearby explanation and applicable retry, and does not depend on an expiring toast for recovery

### Requirement: Recovery retains content without silent overwrites
Failed or unsaved editing SHALL remain recoverable through applicable leave guards and owner-scoped drafts. A newer server version SHALL produce an explicit conflict that preserves local input rather than silently replacing either version. Written study-note drafts SHALL support same-account reload recovery. Storage denial or capacity exhaustion SHALL keep the in-memory input and offer an explicit text export; it SHALL never report successful draft persistence or silently evict another draft.

#### Scenario: Navigate away after a failed note save
- **WHEN** the user attempts to close a written-note editor or navigate away after its save fails
- **THEN** the user can stay, explicitly retain an available local draft, or explicitly discard, and a failed save/draft write keeps the editor open

#### Scenario: Reload a draft after another session edits the note
- **WHEN** the user restores a written-note draft whose original server revision changed
- **THEN** both the local input and the conflict are available without automatically overwriting the saved note

### Requirement: Ambiguous writes are reconciled before resubmission
An uncertain server outcome SHALL be distinguished from a confirmed failure. Repeating the same accepted save/create request SHALL NOT create a duplicate study object or repeat side effects. Edits made after the uncertain submission SHALL be retained separately until its outcome is resolved. Retry SHALL be explicit; network reconnection and navigation SHALL NOT automatically replay writes.

#### Scenario: Create succeeds but response is lost
- **WHEN** creation of a written note commits but its response is lost and the user retries
- **THEN** the original created note is recovered without creating another note, and any newer unsaved input is retained

#### Scenario: Reconciliation is unavailable
- **WHEN** the outcome cannot be checked because the network or required API is unavailable
- **THEN** the form keeps its input, explains that the result is unknown and avoids an unsafe new create request

### Requirement: Undo is offered for a defined set of small changes
Undo SHALL be available after confirmed study-note pin/unpin, source title/author/description/tags edits, notebook title edits, deck name/color/icon edits and deck hierarchy moves. It SHALL remain reachable across section navigation for at least ten minutes in the same authenticated session through a compact recent-actions list, with an explicit expiry. Undo SHALL restore only the affected fields or hierarchy placement while preserving unrelated work. Creation, long text-body replacement, deletion, generation and study-grade operations SHALL not acquire this generic Undo control.

#### Scenario: Undo a rename after navigation
- **WHEN** a user renames a source, goes to another section and chooses Undo within the supported window
- **THEN** the old title is restored without changing reading progress, generated work or unrelated source metadata

#### Scenario: Undo a deck move
- **WHEN** an unchanged eligible deck move is undone
- **THEN** the original parent and sibling order are restored without changing cards, schedules or another owner's tree

#### Scenario: Irreversible deletion
- **WHEN** a user requests source, deck or saved-work deletion
- **THEN** the existing explicit impact confirmation remains, and no Undo promise is made without an actual restoration mechanism

### Requirement: Undo cannot erase later work or run twice
Undo SHALL revalidate ownership, the affected object's existence, expiry and intervening relevant changes atomically. A conflicting undo SHALL preserve current data and explain why it is unavailable. Repeated or concurrent submission of the same undo SHALL restore at most once. A failed or uncertain undo SHALL remain visible for retry/reconciliation and SHALL not be presented as completed.

#### Scenario: Later rename in another tab
- **WHEN** another tab changes the source title after the original rename and the user chooses its Undo
- **THEN** the later title survives and the earlier undo reports a conflict

#### Scenario: Same value after intervening changes
- **WHEN** a field changes A to B, then C, then B, and the user tries to undo the first change
- **THEN** the system detects intervening changes rather than treating equality with B as proof that undo is safe

#### Scenario: Response is lost after undo
- **WHEN** undo commits but its response is lost and the request is repeated
- **THEN** the already-completed result is returned without a second inverse mutation

### Requirement: Recovery controls are isolated and accessible
Drafts, pending writes, receipts and undo offers SHALL be scoped to the owner; account changes SHALL invalidate outgoing UI work and ignore late results. Save and undo controls SHALL be keyboard accessible and use bounded live announcements without stealing focus. API incompatibility SHALL produce an explicit unavailable state instead of dropping concurrency checks. Ordinary reading SHALL remain usable when recovery services or browser storage fail.

#### Scenario: Sign out during a save
- **WHEN** the account changes before a save result returns
- **THEN** that result cannot mark the new account's form saved, clear its draft or expose the old account's undo offer

#### Scenario: Toast expires
- **WHEN** a success toast disappears before a keyboard user reaches Undo
- **THEN** the unexpired action remains available in the recent-actions list and is labelled by its affected object and action
