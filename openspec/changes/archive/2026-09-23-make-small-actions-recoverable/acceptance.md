# Acceptance evidence

Implementation and browser/data acceptance are complete. The release-gate record at the end is authoritative; earlier dated sections document intermediate checkpoints.

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


## 2026-09-23 — mobile layer history and reader close paths

- `LayerHistory` adds only opaque generation/depth/owner/route markers alongside the preserved Next state. Mobile Back restores the current entry before requesting one top-layer decision. Repeated Back shares that decision. Manual dismissal drains only removed layer entries; real navigation waits for them to drain. Forward/reload normalize stale markers instead of reopening DOM. Width changes, not keyboard viewport-height changes, control mobile participation.
- The existing pre-Next bridge remains the only popstate entry point. It now retains the initial layer marker before Next initialization; there is no router/history monkey patch. Query-only replacements propagate their current Next state/URL to the underlying entry when a layer closes. Strict Mode mount replay is fenced before scheduling a physical traversal; BFCache document restoration discards stale transient DOM and creates a fresh coordinator.
- `navigation-browser-proof.mjs` now exercises actual native parent/child dialogs via `navigation-layer-fixture.tsx` as well as the existing route/entry/guard proof. Chromium 153.0.8010.12, Firefox 155.0 (isolated Linux remote), and WebKit 26.6 all passed: one-layer Back, stale Forward, nested dirty confirmation and repeated Back, explicit discard, guarded navigation without a duplicate route entry, reload normalization, Escape, and query-only cleanup while a layer remains open. Log: `/private/tmp/mobile-layer-browser-final.log`. This is a real Next fixture, not full product acceptance for every migrated surface.
- Unit/component evidence: 21 tests passed across layer-history, navigation-guards, text selection, PDF selection, and PDF annotation editing (`/private/tmp/reader-mobile-layers-tests.log`); all workspace typechecks passed (`/private/tmp/reader-mobile-layer-types.log`). New history tests include query-state preservation and account invalidation during a pending decision.
- Reader saved-work tabs now check the current pane before switching and deactivate guards of mounted hidden panes. Programmatic handoff to the assistant and annotation-location jumps use the same guarded Modal handle. PDF annotation comments keep failed edits/quotes and request a save/discard/stay decision before switching annotations. The source cards drawer, mobile card filters, and mobile card inspector use the common layer registry. Desktop inspector remains a stable rail with its existing navigation guard.
- Task 5.3 remains open until actual reader/tab/handoff/mobile-inspector acceptance is recorded. Assistant ownership/portal migration (5.4), the complete release gates and product acceptance remain open. No production deployment has occurred.

- Full checkpoint `bun run test:ci`: **3004 passed, 0 failed**, 263 files, 121.91 s (`/private/tmp/mobile-reader-full-tests.log`), against the already migrated disposable database. Strict OpenSpec validation also passed (`/private/tmp/mobile-reader-specs.log`). Build/S3/final product acceptance are still pending.


## 2026-09-23 — assistant layer ownership

- Floating assistant, model menu, context picker/mention portal, notebook source picker, context inspection, conversation drawer, context-choice/save-target popup, slash menu and queue editor participate in the shared layer registry. Existing viewport geometry and focus controls remain in use; close paths do not invoke tool approval or stop transport ownership.
- A desktop floating assistant is retained during route navigation and does not dismiss on outside clicks; its temporary children close normally. Mobile presentation participates in one-layer Back and closes before a full route navigation. Changing viewport flags updates the same registered layer without deleting its dirty guards.
- New conformance tests cover model-popup Back followed by hiding an unresolved write approval, route departure while a response is running, slash/queue Escape with both drafts retained, and preservation of a dirty guard during responsive presentation changes. Targeted suite: **31 passed, 0 failed** (`/private/tmp/assistant-closure-tests.log`). Existing context-picker and assistant tests also passed (26 tests before the extra regressions). Full product/browser matrix and final release checks remain required.


## 2026-09-23 — durable Undo offer conformance

- Verified shared inverse receipts for source metadata, notebook title, deck metadata/moves and note pinning: concurrent replay/undo is atomic; foreign owners, changed arguments, later ABA writes, deleted targets and expiry reject safely. A new cleanup test inserts 503 receipts and verifies a single pass removes exactly the bounded 500 expired rows; a second pass keeps the unexpired reconciliation record.
- Same-tab remount restores the server-issued scope from sessionStorage and reloads six offers, including in the independent `StandaloneActions` dialog without Operations. Existing tests cover toast expiry, separate operation counts, exact server-time expiry and lost Undo response reconciliation with no automatic replay.
- A new failing test found that remounting with denied storage lost the memory-only disclosure. Session lookup now preserves both the in-memory scope and the disclosure across remounts and temporary storage loss. Only opaque IDs are retained here.
- Targeted receipt/maintenance/offer tests: **20 passed, 0 failed** (`/private/tmp/durable-actions-checks.log`). The wider assistant/layer suite passed **55 tests** (`/private/tmp/assistant-layers-all-tests.log`); typecheck passed (`/private/tmp/assistant-final-types.log`). Browser interaction with ten-minute offers and the complete final release gates remain tracked in section 6.


## Final browser and data acceptance — 2026-09-23

All listed browser scenarios passed against the real local web/API, a dedicated local test account/database and MinIO bucket, and a deterministic loopback AI upstream. `browser-evidence.json` records the compact outcomes. Chromium 153 covered desktop flows; WebKit 26.6 covered mobile at 390×844 and keyboard-height 390×520, including reduced motion. The independent real-Next history proof also passed Firefox 155 in Linux. Keyboard focus, accessible names/status announcements and the ARIA tree were checked; this was not a physical VoiceOver or on-device keyboard session.

| Surface | Executed evidence |
| --- | --- |
| Source processing / Operations | Real PDF upload, leave for Cards, readable-while-indexing copy, open original PDF; quiz generation after leaving, exact result and labelled return; failure and lost-response retry starts once; offline rows persist; another same-owner session is discovered without focus/manual refresh (29.6 s). |
| Mobile / shared layers | Sheet bounds and 44 px controls, Back/Forward/reload, keyboard-height resize without dismissal, hidden-sidebar entry, focus return, card inspector/filter sheets, nested quiz settings, portal picker before parent, conversion cancellation without applying. |
| Card / note-type editors | Card save rejection retains both fields and retry opens the created identity. Lost note-type create response, newer name, reload/restore and explicit reconciliation produce one type and one later update. Existing destructive preview/token tests remain required in the full suite. |
| Written notes | Failed save preserves text; repeated Back shares one decision; tab switch and assistant handoff respect Stay; a lost create reply plus newer input and reload produces one note, then updates that same note. Retained note opens after source deletion. |
| Metadata and Undo | Missing new endpoint fails closed with retained input and no legacy write; retry and Undo; two real tabs conflict without losing the local title, explicit current-version choice, stale inverse rejected. Deck name/color/icon, hierarchy placement, notebook title and note pin inverses were exercised through UI; card schedules and note content recency stayed unchanged. |
| Ten-minute offer | A real 600,000 ms server window was observed; after wall-clock expiry the control was unavailable and the API returned 409 without restoring the old value. Toast and storage-denial/remount behavior also have component coverage. |
| PDF / text selection | Native pointer PDF selection, failed comment with unchanged quote/page/rectangles, dirty Ask/close guards, successful retry, failed saved-margin-comment edit; rendered text selection and exact chunk locator survive failure and retry. |
| Assistant | Nested inspection/picker, model menu and conversation drawer dismiss independently; drafts persist, minimizing does not abort the real SSE turn, and the persisted thread opens in the full page. Pending-write dismissal remains covered by the controller/component suite without submitting approval. |
| Deleted results | An intentionally stale operation row resolves a retained quiz after source deletion. A deleted quiz shows an unavailable-result fallback; refresh removes its action. Neither opening nor deletion starts generation. |

Browser work caught and fixed: sidebar/footer crowding and CSS precedence on sheet geometry; query cleanup dismissing Library details; Next dropping an inspector marker after an asynchronous query replacement; lost focus across operation run changes; keyboard pagination held behind focus freezing; dirty PDF Ask/toggle paths; nested result/quiz/card dialogs; and stale live-source destinations. Expired unconfirmed saves now retain their original identity across another reload and explain the need to inspect existing work; reauthentication during reconciliation does not erase uncertainty.

The 70,001-row operation proof read every bounded page (60 requests; 30 active, 30 attention, 2,970 recent owned rows), with no duplicates or foreign rows. Final local p50 was 8.34 ms and p95 10.25 ms. Active/recent source and artifact indexes were used. The additional 48,000-receipt proof uses the owner/request, session/order and expiry indexes; the offer read was 0.052 ms and cleanup candidate reads stayed bounded to 500 rows. Migration 0039 adds the ordered offer index; the query explicitly matches its `DESC NULLS LAST` ordering. These are local measurements, not a production latency promise.

The upgrade proof applies migrations 0000–0036, inserts pre-change UUIDv4/content/date fixtures, then applies 0037–0039 and repeats the complete chain. All 40 migrations pass; identities/content/old completion recency are preserved, processing does not alter metadata revisions, legacy ABA/pin/hierarchy changes advance the correct counters, and rerunning is idempotent. It removes its own temporary database. API-first rollout, missing-endpoint degradation and rollback are documented in `docs/operations-and-recovery-rollout.md`; CLAUDE.md and AGENTS.md have matching canonical bodies.

Local evidence lives under `/private/tmp/reomi-operations-proof/`; generated PDF and credentials are test fixtures, not product assets. The checked-in history, query-plan and upgrade proof scripts are reusable. No production write was used for acceptance, and unrelated OpenSpec changes remain untouched. Final release gates are recorded below after execution.


## Final release gates — passed

- `bun run spec:validate`: passed with no failures; final post-archive validation is recorded below.
- `bun run typecheck`: all five workspaces passed.
- `bun run db:migrate:apply:test`: complete committed chain through 0039 applied successfully; no schema push.
- `bun run test:ci`: **3034 passed, 0 failed**, 263 files, 115.87 s.
- `bun run test:s3:ci`: **16 passed, 0 failed**, required local MinIO round trips enabled.
- `bun run build`: API bundle and production Next standalone build passed.
- `git diff --check` passed; CLAUDE.md/AGENTS.md canonical bodies match.

Logs: `/private/tmp/reomi-operations-proof/publish-{tests,s3,build,types,specs,migrations}.log`. The final nested-card smoke also verifies picker-before-parent Escape, guarded mobile Back and conversion cancellation with zero writes. Local proof servers were stopped and the dedicated S3 bucket removed; shared PostgreSQL/MinIO and unrelated services were retained. Production release follows the repository pipeline after merge.

The final result resolver is `/operations/v1/artifacts/:id`: it projects only owned destination IDs, rechecks the live parent and readiness, and never returns generated content. Integration tests cover private content exclusion, foreign ownership, logical/hard source deletion, notebook destinations and changed/deleted results. The final gate above includes this endpoint.

Post-archive strict validation: **25 passed, 0 failed**. All delta requirements and Purpose text were synchronized and compared before the CLI archive; `--skip-specs` avoided applying them twice. The unrelated `complete-spaced-repetition-polish` checklist remains at 38/123.
