# Tasks

## 1. Persist explicit context and retain existing histories

- [x] 1.1 Add failing shared/API contract tests for typed refs, bounded excerpts, deduplication, forged passage parents, ownership, and legacy card mentions; verify failures identify the missing context contract without calling live AI.
- [x] 1.2 Implement the versioned shared reference/snapshot schemas and owner-aware resolver for cards, decks, sources/passages, notebooks, written notes, flashcard notes, note types, artifacts, and conversations; verify the tests from 1.1, including readable builtins and safe unavailable outcomes, pass.
- [x] 1.3 Add migration fixtures for existing global/notebook transcripts, pending approvals, and notebook deletion; generate context storage/message snapshot/revision migrations, change the notebook FK to SET NULL, and backfill live notebook bindings; verify the committed migration chain preserves IDs/history and repeated application is idempotent.
- [x] 1.4 Extend conversation create/PATCH/detail and stream context/policy admission with revision checks and an explicit legacy adapter; verify new focus defaults, legacy strict scopes, absent versus empty selection, ambiguous mixed inputs, rejected references, concurrent pin edits, and clean stored user content through API integration tests.
- [x] 1.5 Persist effective turn context and focus/strict policy and reconstruct them for continuation, resume, regeneration, and compression; verify replay from an unrelated route, deleted references, unresolved historical notebook selections, and an unchanged pending action after pin/policy changes with scripted-agent tests.

## 2. Make every conversation discoverable in Chats

- [x] 2.1 Add failing listing tests covering mixed global/notebook/source conversations, equal recency, pins, context filters, foreign filters, deletion tombstones, and legacy global filtering; verify each failure corresponds to the new listing contract.
- [x] 2.2 Implement unified conversation listing with stable pagination, safe context metadata, source/object filters, the legacy global filter, and notebook compatibility; verify all 2.1 tests pass without duplicate or skipped rows.
- [x] 2.3 Adapt the thread rail and deep-link opening to the unified list, context badges, filters, and pagination; verify old notebook/global links open the same IDs and deleted contexts show unavailable labels in component tests.
- [x] 2.4 Add capability-version discovery and compatibility handling for old/new clients; verify an older API cannot cause a new context-bearing message to be sent without its context and unsupported pending operations cannot execute.

## 3. Unify tools while preserving retrieval scope

- [x] 3.1 Add failing scripted-agent tests for equivalent tools across origins, deck creation from a book, focus-mode supplementary explanation, strict selected/empty source sets, and attempted strict-scope bypass through curated readers; verify no test requires live provider keys.
- [x] 3.2 Replace presentation-based registry branching with one deduplicated catalog and turn-context resolution, preserving legacy aliases and MCP adapter boundaries; verify 3.1 tests and existing chat/MCP registry tests pass with no duplicate tools or recursive registration.
- [x] 3.3 Implement focus-first retrieval, the visible Only these materials control, bounded tool-free policy intent resolution before content reads, and strict source/deck enforcement on every read/search path; verify typed/textual strict requests, unresolved-intent selection, prompt-data non-authority, legacy scopes, and supplementary explanation without false citations.
- [x] 3.4 Make parsed-source reading and object references independent of embedding readiness while retaining search/model capability gates; verify no-embedding, no-search, parsing-failure, and no-chat scenarios return honest results without breaking manual reading.
- [x] 3.5 Preserve durable previews, relevant-state checks, transaction consumption, and post-commit scheduling across unified tools; verify reject, stale state, rollback, concurrent replay, and referenced-conversation non-approval in integration tests.

## 4. Preserve verified evidence for each created card

- [x] 4.1 Add failing tests for source-only/global provenance, two cards with different evidence, excluded cards, unanchored user quotes, unread/foreign chunk IDs, reingestion before approval, and legacy pending proposals; verify the expected failures before changing provenance.
- [x] 4.2 Accumulate verified supplied/read source evidence in every contextual turn and add per-card evidence to new proposals/previews; generate required provenance quote/location snapshot migrations; verify source links and snapshots survive reload without attributing unrelated chunks.
- [x] 4.3 Validate evidence freshness and write card-specific provenance in the existing confirmation transaction, retaining the legacy pending-call adapter; verify all 4.1 tests, no orphan links after rejection/rollback, and exactly-once apply pass.
- [x] 4.4 Extend the existing source-link UI for precise evidence, historical quotes, and unavailable locations; verify card editor/reviewer links open the correct source/page/fragment and missing sources never redirect to unrelated content.

## 5. Share one live assistant controller

- [x] 5.1 Add characterization/component tests for streaming, per-conversation draft/model/attachment state, stop/regenerate recovery, queued messages, and pending approval; add failing presentation-switch, concurrent conversation-switch, hidden-approval, and account-switch cases using deterministic transport fixtures.
- [x] 5.2 Extract account-keyed sessions and transport ownership from ChatPanel into the shared shell controller, preserving the SSE parser and per-conversation lock; verify presentation remounts produce one request, concurrent callbacks cannot cross conversations, account changes invalidate all late results, and existing chat behavior remains covered.
- [x] 5.3 Add open/minimize/expand/close and object-Ask actions with explicit add-to-current versus start-new handling; verify route changes never silently replace context, switching conversations preserves active responses, and Stop affects only its target conversation.
- [x] 5.4 Connect Chats and notebook entry points to the shared controller, context filters, and streaming/completed/needs-approval indicators; verify one visible composer, per-session preserved drafts, no hidden approval execution, and consistent pending actions across presentations.
- [x] 5.5 Add tests first, then implement three-turn per-user admission and matching client behavior while retaining one turn per conversation; verify rejection before message insertion, draft preservation, same-user multi-tab admission, slot release on every terminal/suspend path, resume reacquisition, and no active-session eviction.

## 6. Build floating and mobile assistant presentations

- [x] 6.1 Add failing geometry/lifecycle tests for drag/resize constraints, keyboard alternatives, invalid storage, viewport changes, and minimize/expand during streaming; verify the failures describe observable window behavior.
- [x] 6.2 Implement the desktop/tablet non-modal floating host, persistent launcher, drag/resize/reset, and safe geometry preferences using existing theme/WCO conventions; verify the 6.1 tests and that the underlying reader remains interactive without losing position.
- [x] 6.3 Implement the mobile full-screen host with safe-area/keyboard handling, focus restoration, and preserved underlying page state; verify orientation/breakpoint transitions, close/reopen with a draft, and keyboard-visible composer behavior in component and browser checks.
- [x] 6.4 Integrate confirmation layering and assistant-focus guards for study/global shortcuts; verify keyboard typing never grades/reveals an underlying card, Escape affects the appropriate topmost surface, and all controls are keyboard reachable.

## 7. Extend object discovery and mentions

- [x] 7.1 Add failing search tests for every supported type, type/parent filters, same-name objects, cards beyond the first 500, pagination, foreign IDs, and unavailable embeddings; verify private metadata cannot leak in any branch.
- [x] 7.2 Implement bounded server context search and canonical object links, with indexes justified by owner-scoped query plans; verify 7.1 passes and section discovery remains bounded to the selected source.
- [x] 7.3 Replace the mirror-only mention picker with typed asynchronous discovery, keyboard/touch selection, stale-response cancellation, and explicit loading/retry states; verify query/account races preserve the draft and never display stale results.
- [x] 7.4 Render typed composer/message chips with inspect/open/remove/pin actions, visible focus/strict policy, and published limits; verify multiple decks remain distinct refs, a mention does not automatically enable strict mode, deleting a chip does not delete data, and over-budget submissions preserve the draft.
- [x] 7.5 Route Ask actions from cards, decks, notebooks, notes, artifacts, and sources through the same reference contract; verify each opens the correct object context, requires no mutation approval just to attach it, and appears in the resulting durable conversation.

## 8. Give sources their own notes and study artifacts

- [x] 8.1 Add failing migration/API tests for legacy notebook versus retained source-origin ownership, nullable live-source links, per-owner generation admission, retained quiz attempts, detach/delete effects, and cross-user requests; verify failure cases before altering the owner model.
- [x] 8.2 Generate source-origin/owner-kind/snapshot columns, SET NULL live-source links, constraints and indexes; extract shared study services with notebook wrappers, live-source routes, and user-scoped retained-work routes; verify the committed migration chain, legacy endpoints, and all ownership cases in 8.1.
- [x] 8.3 Extend artifact admission/worker/status/quiz paths for source origin, preserving bounded snapshots, cancellation, cooldowns, shutdown, and post-commit behavior; verify source deletion terminalizes active jobs, late results cannot commit, completed quizzes/attempts remain usable, and regeneration without its source fails honestly.
- [x] 8.4 Adapt note/studio panels and assistant note/artifact services to a discriminated owner; verify saving an answer and generating/reading a quiz on a source creates no notebook and existing notebook operations remain intact.
- [x] 8.5 Update source/notebook deletion previews and retained-work deletion actions; verify source work is not cloned on attachment, survives notebook detachment/deletion, and deleting a source preserves notes, completed artifacts, attempts, cards, and conversations while deleting retained work requires a separate explicit action.
- [x] 8.6 Add tests first, then implement the library Saved study work view, source-unavailable filter, direct note/artifact links, and retained `@` results; verify a deleted source's note remains editable and its quiz playable with existing attempts, without creating a notebook or exposing another user's work.

## 9. Unify reading and selection-to-study paths

- [x] 9.1 Add failing reader integration tests for PDF Ask without notebook creation, full reading from a notebook, return-position preservation, source-only notes/artifacts, and first-card creation with no deck.
- [x] 9.2 Extract the full SourceStudyWorkspace for library and notebook entry, keeping shared PDF/text reader state and replacing the notebook handoff with contextual assistant opening; verify 9.1 behavior, existing PDF marks/ink, and source membership remain correct.
- [x] 9.3 Add failing text-selection tests for web/text/EPUB, rendered Markdown/code/math, multiple chunks, deleted/reingested anchors, quote-only fallback, and selection size limits; verify the intended locator failures before adding storage.
- [x] 9.4 Generate source text-mark storage/migration and implement bounded quote/position anchoring plus highlight/note/Ask/card actions in TextChunkReader; verify 9.3 tests and persistent selection links without manufacturing PDF rectangles or unrelated anchors.
- [x] 9.5 Add inline destination-deck creation to direct quick-card/harvest flows and preserve drafts/read position across it; verify a fresh account can save its first source-backed card and see it in the existing study queue.

## 10. Compatibility, end-to-end acceptance, and documentation

- [x] 10.1 Add RU/EN strings, context availability/error labels, and accessible names across new surfaces; verify locale parity tests and keyboard/screen-reader naming checks cover launcher, chips, picker, window controls, and confirmations.
- [x] 10.2 Exercise the complete fresh-account PDF and URL/text walkthrough from design.md on desktop, tablet, and mobile, including concurrent conversation switching, focus/strict behavior, reload, cross-surface approval, backlinks, notebook attachment, and accessing notes/quizzes after source deletion; record results and fix failures before marking complete.
- [x] 10.3 Run mixed-version and migration fixtures covering legacy notebook histories, old request bodies/deep links, legacy pending approvals, deleted references, source-owned work, and rollback feature gates; verify no content/IDs/FSRS history are lost and old-API context-v1 sends fail visibly.
- [x] 10.4 Update CLAUDE.md first, mirror AGENTS.md with its header, and update chat/MCP docs with context/policy/concurrency limits, retained-work ownership, migration/deployment order, explicit old-API maintenance/route-blocking rollback steps, and acceptance evidence; verify docs match the API/UI and generated skills remain untouched.
- [x] 10.5 After the final implementation edit, start disposable PostgreSQL and MinIO with the repository commands; run `bun run spec:validate`, `bun run db:migrate:apply:test`, `bun run typecheck`, `bun run test:ci`, `bun run test:s3:ci`, and `bun run build`; record results and resolve failures without substituting schema-pushing tests for the migration gate.

## Planning Status

The proposal, five capability deltas, design, and this implementation checklist are planning artifacts only. No implementation task is complete until its described behavior and verification both pass. A partial milestone does not authorize dropping remaining scope or marking this change complete.
