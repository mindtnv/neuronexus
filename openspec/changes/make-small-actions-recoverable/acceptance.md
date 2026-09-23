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

- Card and note-type save routes/controllers now use receipts and shared feedback; see the editor checkpoint below. Final browser acceptance and post-final-edit release gates remain required.
- Source/notebook/deck metadata forms and deck move UI still use their previous write paths. Expose their metadata revisions in existing shaped read payloads/mappers, retain input in their dialogs on failure, and wire versioned actions with request reconciliation. Do not fetch a fresh version after an error and silently apply stale input.
- Note pinning uses the safe server route, but its local failed/uncertain feedback still needs the common mutation UI; avoid minting a fresh request identity to retry an unknown result.
- Complete the remaining receipt/session/undo conformance scenarios and keyboard/visual acceptance. Current DOM tests do not prove real mobile behavior.
- Implement the shared layer registry and history integration, migrate all listed consumers, and verify Escape/outside/Back/Forward, nested portals and dirty input in real browsers.
- Update CLAUDE.md then AGENTS.md, run full migration-faithful tests/build/real S3 and browser gates after final edits, sync/archive both changes, merge and verify production health. No deployment has occurred for this change.

The local test database is `neuronexus_operations_test`; its ignored `.env` is not production configuration. The earlier `add-operation-center` checkpoint remains relevant and its remaining tasks also need completion.


## 2026-09-23 — card and note-type editor recovery

- Added versioned card-note, note-type and kind-conversion routes using the existing domain handlers inside the receipt transaction. Preview requirements, source versions, destructive confirmation tokens and budget responses remain enforced. Index enqueue is deferred until the outer transaction commits.
- Receipt replay reconstructs the current owned note/cards or type. Card-note receipts include the type version in their result revision, so later type edits are reported as changed rather than mistaken for the original acknowledgement. Card and template content are not stored in receipts.
- Card/type editors persist uncertain requests with their existing drafts, reconcile before another write and show shared save feedback. A lost create acknowledgement followed by newer text binds the recovered object identity; reload and another Save update that object rather than creating a duplicate.
- Stable local field/template keys bridge server-assigned identities without overwriting newer names/order/template text. These keys stay out of request bodies. Draft acknowledgement can adopt canonical identity metadata while retaining a newer editable buffer.
- Late acknowledgements after account change clear only an exactly matching outgoing draft revision; they never publish content into the incoming account. Save-and-return no longer bounces on a stale React busy flag after a confirmed matching save.
- Written-note creation slots gained a direct owned draft-recovery view so acknowledged/retained work remains reachable even when its original source is unavailable.

Verification:

- New API replay/confirmation tests and existing editor regressions: 68 passed across 8 API files; 80 passed across 9 web files at the expanded checkpoint.
- A full `bun run test:ci` run passed **2973 tests across 256 files** (12637 assertions, 123.78 seconds). This was a development regression run, not the final release gate: substantial tasks remain.
- Subsequent code inspection found potential pool starvation from global reads inside an already-open receipt transaction. Resolvers now use the supplied transaction connection. A regression holds all ten pool slots before resolution; it and the affected note/type suites passed **38 tests across 4 files** after that fix. All workspace typechecks passed again.
- Final release tests/build/S3/browser acceptance must still run after all remaining implementation edits.

Next implementation priorities remain the metadata/pin/move UI adapters and the shared layer/history dismissal contract. GitHub CLI authentication was checked successfully; no PR, merge or deployment has been performed yet. For later browser proofs, a Playwright package exists at `/private/tmp/reomi-navigation-browser/node_modules/playwright/index.mjs`; its default Chromium/WebKit executable paths were absent, so provision/resolve the disposable browser binaries before relying on it.
