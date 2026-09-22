## Context

See proposal.md. The API already owns FSRS state and transactional rollups; the reviewer holds a one-pass array and indexes into it. Bootstrap intentionally holds only the newest 500 cards. Review rows already store exact undo snapshots. Existing tests cover scheduling and undo but not concurrent rollups or browser session transitions.

## Goals / Non-Goals

**Goals:** Fix the existing path with additive endpoint fields, small pure session helpers, existing UI primitives and focused tests. Keep task-level evidence in tasks.md and an acceptance report.

**Non-Goals:** Durable server sessions, offline queues, event sourcing, a generic state-machine library, extra gamification, or a full visual rebrand.

## Decisions

1. **Serialize grade/undo using the user's profile row, then lock the affected card.** Ensure a profile exists before taking its row lock. This protects cross-card rollups and undo order across API instances without a process-local mutex. Compute grading time after acquiring locks. Optional expected card version fields and expected review ID provide stale protection for updated clients while keeping old callers compatible. A conflict triggers an explicit refresh, not a silent repeat.
2. **Separate mature review budget from learning steps.** Keep current UTC boundaries and global counters. Only a card whose pre-grade state is `review` consumes that budget; first introductions consume new budget; learning/relearning consumes neither. Queue due cards prioritize learning, then reviews, with stable ID tie-breaks. Return bounded pages plus summary metadata and earliest future learning time.
3. **Keep a small in-memory session ledger.** Record successful review ID, previous/updated card, rating and duration. Pending regular learning cards reappear when due, without early scheduling. Reuse the server queue when refilling; never infer completion from a network error. Filtered study remains a finite selected batch. Remove visual back-navigation that can regrade an old snapshot; provide real undo and a skip-to-end action. A short waiting state offers finish or automatic continuation at due time. A single owner/scope-bound in-memory editor handoff retains the active card and confirmed-answer ledger across Save/Cancel/Back; it is cleared on logout and is not an offline or durable session.
4. **Compute study summaries on the server.** Aggregate all owned cards by deck and state, fold descendant totals in the existing deck tree, and expose available counts separately from raw totals. Reuse this for home, decks and completion; no exhaustive client download. Preserve existing list pagination and use existing user/deck/due indexes unless query inspection justifies another.
5. **Preserve rich card content when merging bare grade responses.** Scheduling responses are not enriched card payloads. Merge scheduling into the known full card instead of losing its note/template/tags. Upsert cards from queues beyond the bootstrap page.
6. **Keep the completion snapshot user-scoped and validated.** Record confirmed grades, unique cards, active time, scope and mode. Guard storage failures. Use current server counts for next actions; avoid invented future counts or claims that a plant grew on every session.
7. **Sum daily answer time before rounding.** Use the existing user/reviewed-at index to aggregate today's persisted durations inside the locked grade transaction. This fixes lost sub-minute answers without changing the integer profile column or requiring a backfill; undo retains its exact snapshot.
8. **Save note content and deck together.** Add an optional owned `deckId` to the existing note PATCH and apply it to generated cards in the same transaction, preserving their FSRS state. The editor explains note-wide effects; omitted deckId preserves existing assignments. Bare note mutation responses are enriched in the client from their returned note and the loaded note type.
9. **Batch manual scheduling.** Reuse `/cards/bulk` for atomic `forget` and `setDue` updates of up to 1000 owned IDs. Return updated rows so the mirror preserves content while taking authoritative schedules. No per-card request loop or new queue.
10. **Polish existing editor and custom-study behavior in place.** Review sequential checklist items; add guards, labels and recovery where needed. Use bilingual text and existing components. Checks already satisfied are recorded as verified, not claimed as new changes.

## Risks / Trade-offs

- [Legacy clients omit version checks] → Keep compatibility, document protection as conditional, serialize every client regardless.
- [Failed network response after commit] → Refresh authoritative state and show a conflict/recovery notice; never automatically resubmit an ambiguous grade.
- [Continuous learning can last longer than a fixed queue] → Show remaining/waiting honestly and allow explicit finish at any point after a saved answer.
- [Today already includes legacy learning increments] → Do not rewrite historical counters; corrected classification applies to subsequent grades and UTC rollover clears the legacy daily totals.
- [Large collections] → Aggregate on PostgreSQL and bound queue payloads; retain pagination.
- [Background tabs inflate study duration] → Pause duration accounting while hidden and cap a single answer duration defensively.

## Migration Plan

Prefer existing columns and indexes: no schema migration is planned. Apply and test the committed migration chain on an isolated test database. Additive response/request fields allow deploying API before web. Rollback is an image/code rollback with no data rewrite; previously scheduled cards and review rows remain valid. If implementation requires new schema, update this plan and generate a migration before proceeding.
