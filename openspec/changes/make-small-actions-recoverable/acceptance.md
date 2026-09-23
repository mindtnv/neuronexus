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
- Source/notebook/deck metadata forms, pinning and deck moves now use the safe routes; their final browser acceptance remains required. See the metadata/layer checkpoint below.
- Note pinning now retains its original uncertain identity and exposes inline retry. Keep this coverage in the final gate.
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


## 2026-09-23 — metadata adapters and shared layer foundation

Implemented:

- Book title/author/description, notebook title and deck name use an open, recoverable edit dialog. Failed saves retain input; lost replies reconcile first; conflicts require an explicit current-version read and decision. Tag input is cleared only after the matching confirmed save.
- Pin/unpin, deck appearance and pointer/explicit deck moves use versioned actions. The hierarchy read now returns its revision and rows under one owner lock, rather than assembling a revision from a separate stale tree read.
- Added real API tests for subtree schedule preservation, deleted-parent rejection, legacy pin ABA, concurrent replay, and a confirmed MCP update racing a UI move. Existing management confirmation/ownership remains intact.
- Undo/save notifications refresh mounted Library/Notebooks/source views without resetting their editor state or notebook source selections. A scope invalidation prevents an older in-flight response from rewriting the cache after undo.
- Added the owner-scoped layer stack and DOM adapter, including top-only dismissal, portal ownership, IME handling, outside click consumption, guarded close and focus fallback. Navigation guards are stacked instead of replacing an underlying editor guard. DialogProvider now lives inside navigation, retains nested dialogs, and portals confirmations inside an open native dialog when needed.
- Migrated shared dialogs/native Modal, the mobile shell drawer, account/card/thread menus, NNSelect, command palette and cheatsheet. PDF/text selection controls now retain quote/input during dirty-close decisions and failed saves.

Evidence:

- Full migration-faithful `bun run test:ci`: **2993 passed, 0 failed**, 261 files, 108.04 seconds. This preceded the final focus-fallback refinement; the affected 67 UI/unit tests and all workspace typechecks then passed again.
- Metadata/MCP race suite: **30 passed** across the UI-action and MCP files. Targeted metadata/guard/cache/UI suites also passed.
- The reusable `navigation-browser-proof.mjs` passed with Chromium **153.0.8010.12**, Firefox **155.0**, and WebKit **26.6**. This proves the existing real-Next navigation contract still holds; it does NOT yet prove the new mobile transient-layer Back behavior, whose history integration is not implemented.
- Native Firefox failed at launch with the same macOS profile-folder issue documented in the previous navigation acceptance. The successful Firefox run used the existing official Playwright 1.63.0 Linux image, with a new localhost-only server.

Browser tooling prepared for the remaining acceptance:

- Module: `/private/tmp/reomi-navigation-browser/node_modules/playwright/index.mjs`.
- `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/reomi-navigation-browser/browsers` (Chromium/WebKit and native Firefox files exist).
- Owned temporary container `reomi-actions-firefox`, created by this goal, exposes `ws://127.0.0.1:9333/`; its only bind mount is the read-only Playwright node_modules directory. Revalidate its running state before reuse and remove this owned container when browser work is finished.
- Navigation proof log: `/private/tmp/layers-navigation-browser-remote-firefox.log`. Full suite log: `/private/tmp/metadata-layers-full-tests.log`.

Remaining layer/release work:

- Implement transient mobile Back/history markers through the existing pre-hydration bridge, including repeated Back, Forward/reload cleanup and navigation drain. The `history` flag is currently metadata only.
- Finish the PDF annotation saved-work editor guard, the reader's programmatic handoff/tab-switch paths, mobile card inspector/filter sheets, and assistant-owned portals/focus. Existing custom Escape/outside handlers in those remaining consumers need reconciliation with the stack.
- Prove same-tab recent-action restoration, the full adapter conformance matrix, small viewport/reduced-motion/focus behavior, and the standalone recent-actions fallback in final acceptance.
- Check Operations reachability when the desktop sidebar is completely hidden, and focus retention when an operation changes run identity.
- Run full production-build/real-S3/performance/browser gates after final edits, update canonical agent docs, sync/archive both changes, create/merge the PR and verify production health. No PR/merge/deployment has happened yet.
