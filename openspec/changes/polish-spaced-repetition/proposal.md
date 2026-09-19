## Why

The review flow currently mistakes queue failures for completion, drops short learning steps from the active session, allows revisiting stale graded cards, and derives collection totals from a 500-card cache. Before real-user rollout, studying must preserve scheduling, recover safely, and communicate accurate progress.

## What Changes

- Continue due learning/relearning steps within a regular session, with an honest waiting state and an explicit finish action. Learning steps do not consume the review-card daily budget.
- Protect grades against stale client state and serialize each user's grading/undo rollups. Bind undo to the review the user actually saw, while preserving legacy request compatibility.
- Add server-authoritative study counts and queue availability, including deck descendants, daily caps, future learning and suspended cards.
- Make regular/filtered session loading, failure, empty, waiting, grading and completion states distinct and accessible.
- Polish card creation/editing, deck navigation, custom study, mobile controls, keyboard interaction, localization and session results through the ordered checklist.

## Capabilities

### New Capabilities

- `reliable-study-sessions`: Continuous learning steps, safe grade/undo behavior, recoverable study states and authoritative study availability.

### Modified Capabilities

None. Existing pagination and observability contracts remain unchanged.

## Impact

Elysia card/review/deck endpoints, shared FSRS helpers, Zustand store, reviewer, home, decks, card editor/browser, custom-study and result screens; regression tests and a manual acceptance matrix. Prefer additive API fields and existing database columns; any necessary schema change must include a committed migration and rollback notes.

Non-goals: replacing FSRS, offline synchronization, a new state-machine framework, redesigning unrelated notebook/chat features, adding dependencies for cosmetic changes, changing UTC study-day boundaries, or deploying production without an explicit deployment request.
