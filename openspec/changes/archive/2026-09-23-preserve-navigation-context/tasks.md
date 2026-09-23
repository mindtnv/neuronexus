# Tasks

## 1. Navigation identity and storage

- [x] 1.1 Add failing behavioral tests for entry-vs-section precedence, repeated same-route visits, explicit object links, query-only replacement, return chains and reset; verify they reproduce missing restoration rather than asserting source text.
- [x] 1.2 Implement the typed navigation snapshot codecs and bounded owner/tab store from design decisions 1–3; verify reload hydration, 64-entry/512-KiB/depth limits, corrupt versions, unavailable storage, cyclic origins and independent-tab initialization with unit tests.
- [x] 1.3 Extend `AppNavigationProvider` with entry identity and navigation intents while preserving Next history fields; make 1.1 tests pass and record a real-browser same-route Back/Forward/reload/branch-replacement check before adding screen adapters.
- [x] 1.4 Bind snapshots and asynchronous restoration to authenticated lifecycle/reset, flush on approved navigation and page lifecycle events, and add localized degraded-storage feedback; verify sign-out, account switching, same-owner reauthentication, pending responses and rapid reload preserve isolation without removing unrelated drafts/preferences.

## 2. Library as the first end-to-end slice

- [x] 2.1 Add failing component tests for filtered Library -> source -> return, sidebar reopen, reload, details panel state and Reset view; verify the fixtures distinguish remembered query from merely cached rows.
- [x] 2.2 Implement the Library adapter and reusable anchor lifecycle, including known-settings initialization before requests; verify 2.1 passes and delayed responses cannot override manual scroll/filter changes.
- [x] 2.3 Implement cursor-based reconstruction and bounded fallback for Library; verify second/later-page anchors, deleted rows, changed ordering, network failure and all three request/record/time limits with controlled responses.
- [x] 2.4 Route sidebar, bottom tabs and command-palette section actions through section navigation and object results through explicit navigation; verify direct URLs override saved filters and repeated active-section clicks do not create duplicate history entries.

## 3. Cards, Decks and Notebooks collections

- [x] 3.1 Add failing Cards journey tests for two different query entries, focused card outside old filters, table X/Y restoration, reload and draft-preserving return; verify inspected-card state is distinguished from bulk selection.
- [x] 3.2 Implement Cards state/URL/anchor adapters and Reset view using existing query and pagination semantics; verify 3.1 passes, opaque cursors are replayed unchanged, an inspected card outside the bootstrap is refetched and bulk selections/menus are not restored.
- [x] 3.3 Add failing tests then implement Decks search, selected detail, effective tree expansion and tree/detail scroll restoration; verify Back/Forward, reload, explicit focus and deleted/moved deck fallbacks without changing stored appearance preferences.
- [x] 3.4 Add failing tests then implement Notebooks list search/archive/anchor restoration and Reset view; verify opening/returning, reload, current-account isolation and deleted notebook fallback.

## 4. Readers and contextual returns

- [x] 4.1 Add failing tests for Library -> reader -> card -> reader -> Library, source -> citation at another location in the same source -> Back, reload mid-chain and direct entry without an origin; verify destinations and labels for each step.
- [x] 4.2 Implement contextual object/return navigation in source links, source peek, related cards, reader card actions and editor entry/return paths; verify 4.1 passes without parent-child history loops and existing reader/card/editor URLs remain accepted.
- [x] 4.3 Add failing reader tests then implement PDF page/fraction and text chunk/position anchors, stable panel/tab and saved-object restoration; verify explicit location > fresh remembered reading state, history anchor > later reading progress, deleted marks/chunks, changed viewport and cancellation during loading.
- [x] 4.4 Add failing notebook tests then make the existing shared portal reader participate in query history; verify Back closes, Forward reopens, reload reconstructs the nested reader, and notebook tabs/scroll/source scope survive without a second assistant or reader implementation.
- [x] 4.5 Implement notebook/source stable saved-note and completed-artifact panel references with current-access validation; verify reload opens the same available object, deleted/foreign objects degrade safely and no generation, save or quiz submission occurs during restoration.

## 5. Unsaved work, review and accessibility

- [x] 5.1 Add failing navigation-guard tests for app return, Back/Forward, rapid repeated Back, save failure and Stay; verify the current draft and history entry are preserved on cancellation.
- [x] 5.2 Integrate managed browser traversal into the single leave guard and preserve native full-exit protection; make 5.1 pass and record a real-browser check proving a cancelled Back does not unmount/lose the editor or create a navigation loop.
- [x] 5.3 Verify the compatible recoverable study-session owner from `complete-spaced-repetition-polish` R2-049/R2-050/R2-051/R2-052/R2-059 and active-time handling is available; record its concrete API/tests in this change's acceptance evidence. If unavailable, leave this prerequisite and dependent review tasks open rather than introducing a second session implementation.
- [x] 5.4 After 5.3, add failing review excursion/reload tests then connect opaque navigation references to that session owner; verify current-card reconciliation, answer state, saved history/totals, paused active time and zero repeated grade/undo writes, including legacy editor return URLs.
- [x] 5.5 Add failing keyboard/mobile tests then implement logical focus restoration, viewport clamping and interaction cancellation; verify return focus without extra scroll, no keyboard opened by reload, reduced motion and safe fallback when the original focus target is gone.
- [x] 5.6 Run and extend assistant/draft regression tests across the new transitions; verify conversation identity, pending approvals, streams within existing lifecycle guarantees, explicit empty source scope and draft restore/discard remain owned by their existing controllers.

## 6. Acceptance and release evidence

- [x] 6.1 Record browser acceptance in this change's `acceptance.md` for Chromium, WebKit and Firefox: Library -> reader -> card round trip; notebook nested reader Back/Forward/reload; Cards query A/B history; section reopen/reset; same-source page 42/page 8; editor Stay and saved return; review excursion/reload. Include actual results, browser versions and any unexecuted cases rather than claiming coverage from DOM mocks.
- [x] 6.2 Verify real layout at 1280x800 and 390x844 plus resize/reduced-motion: unchanged-layout anchor offset within 8 CSS pixels, reflowed semantic anchor visible, independent horizontal scroll and no late viewport jump; record evidence in `acceptance.md`.
- [x] 6.3 Exercise later-page/limit fixtures, throttled/failed requests, unavailable storage, foreign/deleted objects, independent tabs and account change during restoration; record bounded request counts and no duplicate mutations or private snapshot data in URLs/logs.
- [x] 6.4 Document the navigation contract and limits in `CLAUDE.md`, mirror its body into `AGENTS.md` with the required header, and verify the mirror and old-link compatibility after the final edits.
- [x] 6.5 Run fresh `bun run spec:validate`, targeted navigation/reader/editor/review tests, `bun run typecheck` and `git diff --check` after the final edits; record commands/results and keep failed checks open.
- [x] 6.6 Before declaring implementation complete/archive-ready, start the disposable PostgreSQL/MinIO services, apply the committed chain with `bun run db:migrate:apply:test`, then run `bun run test:ci`, `bun run test:s3:ci` and the production build gate; record results and prerequisite-session compatibility. Do not substitute the schema-pushing test command or treat planning completion as implementation acceptance.
