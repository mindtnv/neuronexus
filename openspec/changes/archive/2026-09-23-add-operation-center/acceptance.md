# Acceptance evidence

Implementation and browser/data acceptance are complete. The release-gate record at the end is authoritative; earlier dated sections document intermediate checkpoints.

## 2026-09-23 — source/artifact lifecycle and initial shell surface

- Branch: `codex/operations-and-recoverable-actions`, based on `619e7a9`.
- Added migration `0037_special_loners.sql`: current-run metadata, persisted generation options, retry receipts and owner/time indexes. Applied the complete migration chain to a newly created local `neuronexus_operations_test` database; no schema push used.
- Added server projection and receipt-backed explicit retries. Tests cover owner isolation, parked/readable sources, completion recency, equal-time pagination, old active jobs, stale worker responses, concurrent retry, lost-response replay, persisted quiz settings, legacy defaults, AI unavailability and injected cooldown rejection.
- Existing source create/reingest and artifact regenerate paths share the same run-aware services. Worker writes are conditional on captured run identity. A new test waits for the real embedding/generation seam before replacing the run, then verifies that the old response cannot mutate the replacement.
- Initial shell UI, owner-keyed observation, source/artifact destinations and capability-based source labels are present. DOM tests verify route-content changes, opening an exact retained quiz without a write, and account teardown. Observer tests verify request coalescing, stale data preservation and loaded-tail refresh.

### Commands and results

- `bun run db:migrate:apply:test`: passed on the isolated fresh database, including migration 0037.
- `bun run typecheck`: all five workspaces passed after the checkpoint edits.
- `bun run spec:validate`: 24 items passed; informational long-requirement notices only.
- Targeted integration/UI command below: **578 passed, 0 failed**, across 12 files. Many of these are dictionary parity assertions; this is not a claim that the full suite passed.

```sh
NODE_ENV=test bun --env-file=.env test \
  apps/api/tests/operations.test.ts \
  apps/api/tests/source-ingest.test.ts \
  apps/api/tests/notebook-artifacts.test.ts \
  apps/api/tests/source-delete-race.test.ts \
  apps/api/tests/source-reingest.test.ts \
  apps/api/tests/source-study-artifacts.test.ts \
  apps/web/src/lib/operation-observer.test.ts \
  apps/web/src/lib/source-operation-label.test.ts \
  apps/web/src/components/operations-center.test.tsx \
  apps/web/src/components/notebook/source-studio-panel.test.tsx \
  apps/web/src/components/screens/library-navigation.test.tsx \
  apps/web/src/lib/i18n-parity.test.ts
```

## Outstanding at the initial checkpoint (resolved below)

- Complete the unchecked tasks, notably shared mobile Back/dismissal, deeper retry UI and guarded navigation tests, visibility/backoff verification, performance query plans and live browser acceptance.
- Bounded retry-receipt maintenance is now scheduled and drained with API shutdown (shared with UI-action receipts); retain this coverage in the final release gate.
- Finish `make-small-actions-recoverable`; written-note recovery, server action receipts/inverses and the recent-actions list are implemented in its current checkpoint. Remaining metadata/card-editor wiring and shared dismissal are still required.
- Recheck keyboard focus across run replacement, real mobile geometry and the source-artifact deep-link lifecycle in a browser. The current UI is not visually accepted.
- Update canonical agent documentation, run full migration-faithful tests/build/real S3 after final edits, sync/archive both specs and verify the actual production deployment.

Local `.env` is ignored and points only at the disposable task database. It is not a production configuration or a deliverable.


## 2026-09-23 — guarded opening, retry boundaries and shared observation

- Two new failing UI tests exposed early panel closure on a denied dirty-editor departure and focus loss when a new run replaced the same object. Opening now delegates entirely to guarded navigation; stable row identity retains the focused result control while run-scoped retry state resets and fences old responses. If an updated row removes its focused action, the row is the surviving keyboard focus target. The cooldown clock stops at its deadline.
- Added a compact, labelled Operations entry when the desktop sidebar is completely hidden. Mobile continues using the bottom navigation and shared native sheet/layer adapter. Actual product visual acceptance is still pending.
- Explicit retry after a lost reply retains its request identity; focus refresh reads status without replaying. API regressions verify old-route regeneration racing the versioned retry starts only one job, deleted inputs fail safely, and a crash between commit and dispatch leaves one durable run/receipt. Startup marks that interrupted run failed; replay reads the receipt without scheduling, and only a new explicit retry starts work. The dispatch dependency exposes that boundary to tests; the HTTP route still always uses the real dispatcher.
- Observer tests use a controlled clock to verify idle discovery, active polling, exponential backoff capped at 30 seconds, hidden-tab suspension and focus resumption. A coalesced detail refresh subscriber lets slow source/artifact list reads finish, queues at most one newer read and invalidates results on subscription teardown. Source and artifact status use this common observer. The open artifact viewer retains its separate content-stream read (not a second status list loop), now paused while the document is hidden.
- Source artifact citation navigation now uses the shared guarded navigation provider. Its standalone tests wrap that real provider instead of bypassing it.
- Targeted observer/row/Library/Studio tests: **22 passed**, log `/private/tmp/operations-pulse-tests.log`. API retry, observer, labels/destinations and row tests: **25 passed**, log `/private/tmp/operation-retry-crash-after.log`. Typecheck passed before the final dispatch-boundary test edit (`/private/tmp/operations-pulse-types.log`); fresh complete gates remain required.
- Remaining before archive: labelled-return/deleted-result product acceptance, real desktop/mobile visual/keyboard evidence, large-data query plans, final agent documentation and all release gates. No deployment has occurred.

- Fresh checkpoint: strict specs and every workspace typecheck passed; `bun run test:ci` passed **3020 tests**, 0 failures, 263 files, 118.34 s (`/private/tmp/operations-assistant-full-tests.log`). Expanded Next history proof passed Chromium 153, Firefox 155 and WebKit 26.6 (`/private/tmp/operations-assistant-history-browsers.log`) after the assistant layer integration. These are checkpoint results, not the yet-pending final build/S3/product acceptance.


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
