# Implementation evidence — in progress

This checkpoint is not release approval. Unchecked tasks remain required; neither change is ready to archive or deploy.

## 2026-09-23 — written notes and server recovery foundation

Implemented:

- Migration `0038_fancy_yellowjacket.sql`: UI-action receipts, metadata revisions, owner hierarchy revisions and database triggers covering old REST/agent writes. It was applied through the committed migration runner to the isolated task test database.
- Cookie-authenticated versioned routes for written-note create/edit/pin, source metadata, notebook titles, deck metadata and deck moves. Receipt creation and mutation commit together; repeats resolve before another write. Receipt bodies contain hashes/identities and allowed inverse metadata, not written-note bodies.
- Conditional inverses reject expired, foreign, missing or changed targets, including A→B→C→B changes. Deck moves share their existing legacy transaction implementation and owner lock. The MCP management adapter now uses that lock before locking a deck tree.
- Historical deck positions can tie by name. Inverse receipts preserve affected original sibling orders and reject a later rename that would make exact order restoration impossible, without reverting that rename.
- Written-note forms use a shared revision-aware save controller and existing bounded draft infrastructure. Failed saves retain input; an acknowledgement for A cannot clear newer B; uncertain retries first reconcile the original identity. Missing reconciliation support does not fall back to an unsafe fresh create.
- Written-note drafts participate in the existing owner limits and draft library, including retained/deleted-source text, local export and over-limit input. The editor guard is reused for local Back/Close controls. Shared global layer dismissal remains outstanding.
- A recent-actions section and toast action buttons expose unexpired undo offers independently of toast lifetime. Lost undo replies are reconciled read-only on focus; no automatic inverse replay. This UI currently receives supported note-pin actions; other frontend metadata forms still need migration.
- Both receipt cleanup helpers now run in one bounded maintenance loop, cancelled/drained before DB shutdown.

## Verification

- `bun run typecheck`: all workspaces passed.
- `bun run spec:validate`: all 24 current specs/changes passed, with informational long-requirement notices only.
- The combined targeted command below passed **108 tests across 14 files**, including existing card-editor draft and MCP regression coverage. These are targeted tests, not the full release suite.
- After the final recent-actions loading-state adjustment, its two DOM tests and typecheck were rerun.

```sh
NODE_ENV=test bun --env-file=.env test \
  apps/api/tests/ui-actions.test.ts \
  apps/api/tests/mcp.test.ts \
  apps/api/tests/decks.test.ts \
  apps/api/tests/source-study-notes.test.ts \
  apps/api/src/receipt-maintenance.test.ts \
  apps/web/src/lib/recoverable-save.test.ts \
  apps/web/src/lib/editor-drafts.test.ts \
  apps/web/src/lib/study-note-draft.test.ts \
  apps/web/src/components/notebook/written-note-editor.test.tsx \
  apps/web/src/components/notebook/source-notes-panel.test.tsx \
  apps/web/src/components/editor-draft-library.test.tsx \
  apps/web/src/components/recent-actions.test.tsx \
  apps/web/src/components/card-form.test.tsx \
  apps/web/src/components/operations-center.test.tsx
```

## Remaining work and implementation notes

- Card and note-type save routes/controllers still need receipt integration while preserving their structural previews and confirmation tokens. Existing card drafts were regression-tested, not migrated to the new save UX.
- Source/notebook/deck metadata forms and deck move UI still use their previous write paths. Expose their metadata revisions in existing shaped read payloads/mappers, retain input in their dialogs on failure, and wire versioned actions with request reconciliation. Do not fetch a fresh version after an error and silently apply stale input.
- Note pinning uses the safe server route, but its local failed/uncertain feedback still needs the common mutation UI; avoid minting a fresh request identity to retry an unknown result.
- Complete the remaining receipt/session/undo conformance scenarios and keyboard/visual acceptance. Current DOM tests do not prove real mobile behavior.
- Implement the shared layer registry and history integration, migrate all listed consumers, and verify Escape/outside/Back/Forward, nested portals and dirty input in real browsers.
- Update CLAUDE.md then AGENTS.md, run full migration-faithful tests/build/real S3 and browser gates after final edits, sync/archive both changes, merge and verify production health. No deployment has occurred for this change.

The local test database is `neuronexus_operations_test`; its ignored `.env` is not production configuration. The earlier `add-operation-center` checkpoint remains relevant and its remaining tasks also need completion.
