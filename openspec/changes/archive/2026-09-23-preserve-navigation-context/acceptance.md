# Navigation continuity acceptance

Completed locally on 2026-09-23. The change is implemented and verified; it was archived on 2026-09-23. Deployment results are tracked by the main-branch release workflow. The unrelated remainder of `complete-spaced-repetition-polish` remains open.

## Release gates

| Gate | Final result |
| --- | --- |
| `bun run db:migrate:apply:test` | Committed migration chain, including 0036, applied successfully to the isolated test database; no schema push used |
| `bun run test:ci` | **2926 passed, 0 failed**, 243 files, 128.12 s |
| `bun run test:s3:ci` | **16 passed, 0 failed**, real local MinIO round trips |
| `bun run typecheck` | All workspaces passed |
| `bun run build` | API and standalone web passed; browser acceptance build also passed with explicit local public API/media build arguments |
| `bun run spec:validate` | Strict validation: 22 passed, 0 failed |
| `git diff --check` | Passed |
| CLAUDE.md / AGENTS.md body mirror | Exact match after their distinct headers |

The first full test run found eight outdated deck test fixtures: the new authoritative hierarchy refresh received their catch-all empty GET response. Explicit `/decks` fixture responses fixed those tests; the final full run above includes the fixes. Passing targeted tests were never substituted for the full migration-faithful gate.

## Browser matrix

The reusable real-Next harness is `apps/web/scripts/navigation-browser-proof.mjs`. It imports the actual provider, journal and early history bridge into a disposable Next 16.3.5 application. The final harness passed in every engine below: distinct same-route query entries, Back/Forward/reload, section reopen, query consumption, return chains, cancelled and approved native Back, and rapid repeated traversal while one asynchronous guard decision is open.

Actual product journeys used a separate local API/database, including the final standalone production web build:

| Journey | Chromium 153.0.8010.12 | Firefox 155.0 | WebKit 26.6 |
| --- | --- | --- | --- |
| Filtered Library, 61st source, return and reload | Passed | Passed | Passed |
| Cards: 600 matching rows, X/Y restore, outside-bootstrap focus, bulk selection cleared | Passed | Passed | Passed |
| Notebook -> full text reader -> card -> reader -> reload -> notebook -> Forward | Passed | Passed | Passed |
| PDF page 42 -> card -> page 8 -> Back -> page 42 -> reload | Passed | Passed | Passed |
| Library -> text reader -> card reload -> reader -> Library; keyboard focus and narrow reflow | Passed | Passed | Passed |
| Editor Back/Stay, injected failed save, local draft restore, successful save and return | Passed | Passed | Passed |
| Mobile study excursion/reload; committed grade with lost response; no second POST | Passed | Passed | Passed |

Firefox ran in the official Playwright 1.63.0 Linux image through a localhost-only WebSocket server and loopback forwarding. The native macOS 27 build failed before launch with `Could not find profile folder`; no macOS privacy permissions were changed. The matching platform issue is documented by Mozilla: https://bugzilla.mozilla.org/show_bug.cgi?id=2060476 .

Desktop measurements used 1280x800; mobile used 390x844. The final text-source journey also resized from desktop to mobile during the excursion. Reduced motion was enabled for text reflow and PDF checks. Unchanged-layout anchors were within 8 CSS pixels; the semantic chunk remained visible after reflow. Observed values include:

- Deep Library: scrollTop 3323 and target offset 417.1875 before/after return and reload (the earlier fixture layout measured 3287 / 435.1875).
- Cards: scrollLeft 250 and scrollTop 26302, independent of transient checkbox selection. The explicitly requested older card was absent from the 500-card bootstrap and fetched directly.
- PDF: page-42 offset -160.109375 CSS px in Chromium/WebKit and -160 in Firefox, despite the PDF alternating page dimensions.
- Text: -282.46875 CSS px in Chromium/WebKit and -282.6999969482422 in Firefox before desktop reflow; mobile unchanged-layout offset -1052.921875. Original row focus returned without a second scroll, and document width stayed within 1 px of the viewport. Mobile screenshots were visually inspected.
- A delayed Library revalidation preserved all 65 loaded rows after manual scroll and retained the visible tail at -194.46875 px. It did not replace the loaded tail with only the first 60 records. The refresh indicator no longer changes list geometry.

## Adverse and isolation cases

- Real Chromium: opener-created independent tab did not inherit the original search; repeated active-Library clicks did not grow history; Reset survived section reopening. Corrupt snapshots were injected before the new document booted (rather than overwritten by old-document pagehide). Unavailable navigation storage still permitted an in-memory source round trip. Unrelated local preferences remained intact.
- Real Chromium: a list response was held while the browser switched to a second synthetic account. The new account rendered an empty search and its own empty collection; releasing the old response did not change it, and the outgoing namespace was absent. Component tests additionally cover atomic owner changes and bootstrap failure without mounting stale route state.
- Real same-owner Library reauthentication retained its query. A forced reviewer queue 401 preserved typed input through login. An actual API edit by another client was detected on coalesced focus/visibility wake before grading, with typed input retained and zero grade POSTs.
- Deleting a temporary notebook origin returned to the previous filtered Notebooks list while its independently owned source still returned 200. Component/read-helper tests cover deleted inspected cards/decks, source/notebook origin failures, foreign access, saved-note direct reads beyond the first page, and retryable artifact/detail reads without generation or writes.
- Cursor reconstruction tests cover unchanged opaque cursors, changed/missing anchors, end-of-list, repeated cursors, request/row/time budgets, failures and cancellation. Journal tests cover storage size, malformed versions, owner/tab boundaries, cyclic/over-depth origins, consumed URLs and late setters. Focus tests cover surviving nearby rows and the collection heading when every old row is gone.
- Review/timer tests cover one wake reconciliation while its request is pending, a delayed empty queue crossing a learning deadline, monotonic due time despite local wall-clock changes and exclusion of an injected one-hour sleep gap from active-answer duration. Physical one-hour device sleep was not used; clocks/responses were controlled in tests.
- Existing assistant, pending-confirmation, source-scope, draft, note-type and review suites pass in the full run. Actual notebook journeys retain the explicit empty source selection and Notes tab. The navigation journal stores IDs/view metadata only; it does not serialize assistant content or trigger confirmations, generation, grade or undo during restoration.

## Defects resolved by acceptance

- A late React popstate listener let Next consume traversal first. The pre-hydration bridge now captures it without patching history/router methods.
- Restoring only the first visible row omitted a trailing visible page. Snapshots now retain the visible end anchor as well.
- The contextual card return control was hidden under the inspector; it now appears in its header.
- Same-path Cards navigation bypassed the draft guard. Only explicit internal `viewOnly` replacement may bypass it. Consuming an already validated `?focus` no longer remounts the editor.
- Rapid reload during query cleanup could request the old URL after the same entry stored its new URL. One previous same-path URL is accepted for the matching marker/position. WebKit could also lose custom history state entirely during that race: the opaque pagehide fallback is admitted only for a Navigation Timing `reload` and the matching authenticated owner. The final product chain passes all three engines, while the independent-tab test still passes.
- Missing focused rows now return keyboard focus to a surviving neighbor or the collection heading without scrolling again.

One intermediate WebKit reload reported an aborted background Cards-search request as an access-control page error; the unchanged repeated final journey completed without page errors. For intentional failed-PATCH injection in production editor tests, service workers were blocked in the test context so Playwright could actually intercept the request; normal source/reader journeys exercised the production worker.

## Study dependency and rollout

The prerequisite R2-049/050/051/052/059 slice is implemented in the existing study-session owner. Navigation keeps only its opaque session ID. `study-checkpoint.ts` provides bounded account-scoped persistence; `study-recovery.ts` reconciles current card versions, confirmed review IDs and uncertain receipts using reads only. Recovery preserves typed/revealed state when valid and keeps changed questions non-gradable until an explicit choice.

Migration `0036_special_dreaming_celestial.sql` adds `review_operations`. The versioned `POST /reviews/operations/:operationId` atomically stores the grade and immutable receipt under the existing profile lock. Integration tests prove matching/concurrent retries return one review, conflicting arguments are rejected, owners are isolated, and undo leaves a tombstone that prevents resurrection. `GET` receipt and bounded owned `/reviews/records` reads resolve uncertainty without exposing undo snapshots. Legacy `POST /reviews` remains compatible. A real lost-response browser case committed exactly one review with exactly one POST.

Deploy the additive migration and compatible API before web. Prefer web-only rollback; retain receipt data/schema and a compatible API for unresolved operations. No production deployment was performed for this task.

## Local fixture and reproduction

The ignored root `.env` targets the disposable `neuronexus_navigation_dev` / `neuronexus_navigation_test` databases and `neuronexus-navigation` MinIO bucket; original databases/buckets were not modified. The API uses port 3310 and web 3311. Fixtures include synthetic accounts, 65 text sources, a 60-page variable-size PDF, linked cards, saved notebook context and 600 pagination cards. Account secrets are not included here.

The production acceptance build requires:

```sh
NEXT_PUBLIC_API_URL=http://localhost:3310 NEXT_PUBLIC_MEDIA_BASE_URL=http://localhost:9000/neuronexus-navigation bun run build
```

The core browser harness can be rerun with an installed Playwright module and browsers:

```sh
NAVIGATION_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/absolute/path/to/browsers \
NAVIGATION_FIREFOX_WS=ws://127.0.0.1:9323/ \
node apps/web/scripts/navigation-browser-proof.mjs
```

The Firefox WebSocket override is optional on hosts where native Firefox launches. Product acceptance scripts, logs and screenshots are disposable local evidence under `/private/tmp/reomi-navigation-browser`; the behavioral regression tests and reusable core harness are repository files.
