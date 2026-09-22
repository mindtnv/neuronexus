# Acceptance evidence

The implementation checklist is complete. Results below are chronological evidence: earlier outstanding items are resolved by later sections. The final required command sequence and installed-window acceptance are recorded below. No production deployment or real-model quality evaluation is claimed.

## 2026-09-21: responsive assistant and persisted conversation

Environment: isolated local development database, local API on port 3100, web on port 3101, Codex in-app browser. A local scripted OpenAI-compatible service supplied deterministic text; no external AI provider was used. This verifies application transport and persistence, not model quality.

Browser observations:

- At 390 × 844, the assistant occupies the full viewport and retains the source-note context from the source reader.
- Closing and reopening retains the typed draft and underlying source page.
- Changing to 844 × 390 switches to the floating presentation without losing that draft. Composer and send control remain visible.
- Sending the draft displays a streamed local test response; returning to 390 × 844 preserves the complete transcript and note-context chip.
- “Open in Chats” navigates to the same conversation ID. Reloading that URL restores the user message, complete assistant response, model label, and note context.
- The temporary viewport override was reset after these checks.

The mobile host originally used visualViewport.height but ignored offsetTop. A failing component test reproduced a keyboard-panned viewport. The fix tracks both resize and scroll, positions the mobile host at offsetTop, and preserves the draft when the keyboard viewport expands again. The assistant-host/window suites pass (13 tests). A real operating-system keyboard and installed-PWA scenario have not yet been exercised.

## Recent targeted regression evidence

- Edited regeneration resolves policy intent before changing history. Ambiguous instructions preserve the old transcript; an explicit choice bypasses classification; ordinary replay preserves historical policy.
- Regeneration selects the last user row across the entire history. Integration fixtures cover 1002 messages and equal timestamps, preserving all earlier rows (26 tests across conversation/compression/policy suites).
- Text-reader marks are readable through list_marked_passages without a notebook. Owner/strict scope, stale locations, user-quote semantics, bounded output, and continuation without skipped records pass (20 tests across text-markup/assistant-tools/PDF-markup suites).

## Original outstanding checklist (superseded by later evidence)

Complete the design walkthrough for PDF and imported URL/text sources, concurrent conversation switching, approvals across presentations, strict/focus retrieval, precise backlinks, notebook attachment/return, and retained notes/quizzes after source deletion. Finish accessibility and real keyboard/PWA checks, documentation, and final migration-faithful release gates after the last implementation edit.

## 2026-09-21: concurrent-turn admission (task 5.5)

The admission service no longer expires active turns by age. Cancellation requests keep ownership until settlement; release checks the exact controller identity so a stale completion cannot release a replacement request.

Verified with deterministic API requests sharing one user across independent connections, a second user, and the client-controller harness:

- Three turns run concurrently; the fourth is rejected before inserting its message, and its client draft is preserved.
- A conversation admits only one turn. Users have independent limits, and legacy/versioned route aliases share admission state.
- Completion, provider failure, failed preflight, missing resume, empty regeneration, and settled disconnect release their own slots.
- Suspending for approval releases the slot while preserving the pending action. With three other active requests, approval is rejected before applying the write; after a slot is released, retry creates exactly one deck and the continuation occupies a slot again.
- Advancing the clock ten minutes does not evict active requests. An abort signal alone does not unlock the conversation before settlement.
- Hidden sessions retain pending approval and active transport state; the fourth conversation does not evict them.

The admission, context-protocol, and controller check completed with 24 passing tests; workspace typechecking passed. This is targeted evidence, not the final full-suite gate.

## 2026-09-21: source capability, open-note refresh, full regression run

`/ai/status.assistant.sourceStudy` now reports the implemented source-study routes. An API test checks source-owned note creation plus note/artifact listing without creating a notebook or requiring a chat provider. Refreshing the first notes page keeps an already-open deep-linked note's viewer snapshot; a different study owner cannot inherit that snapshot. Targeted checks passed: 16 API tests and 8 note-panel tests.

`bun run test:ci` completed with 2780 passing tests, zero failures, across 220 files (98.08 seconds). Typechecking and OpenSpec validation also passed. This is an intermediate regression run against the existing committed test migration chain; task 10.5 still requires the complete final command sequence after the last implementation edit. Documentation updates began with CLAUDE.md and its verified identical AGENTS.md body, plus the chat and personal-MCP tool guides. Deployment/rollback and remaining acceptance documentation are still pending.

## Manual text-selection card provenance

The text reader now passes its full `textSelection` through QuickCardDialog to the quick-card endpoint. The save transaction checks source ownership, selected chunk parents/order, and raw-text hashes before creating the note/cards. Only selected chunks receive backlinks. Snapshots use `kind: user_selection` to distinguish a manual rendered-text quote from verified model-read evidence and retain the selection, historical source title, quote, and chunk fingerprint. Quote-only selections use `kind: user_quote` with no fabricated chunk/page. Invalid or stale anchors leave no card or provenance rows.

Targeted verification passed: 45 API tests across manual text cards, existing quick-card behavior, assistant evidence, and source backlinks; 4 frontend tests covering selection forwarding and first-deck card creation; workspace typechecking and OpenSpec validation. A 4000-character quote is accepted end to end, and deletion preserves its historical snapshot. PDF quick-card/harvest precision and the complete browser walkthrough remain to be audited separately.

## PDF quick-card selection snapshots

The shared PDF reader captures the displayed source version when opening a card draft and sends `pdfSelection` with the page and exact user-selected quote. The transaction validates source ownership/kind, page bounds, and unchanged version. It writes a single source/page-level `user_quote` snapshot instead of attributing all parsed chunks on that page. This does not claim that text-layer content was independently verified against parser output. Page-only/image selections can retain a page with an empty quote; existing card markers retain their separate PDF geometry. Requests without the new selection payload retain the legacy adapter.

Verified: 33 API tests covering PDF/text selection saves, legacy quick cards, source backlinks, version changes, and deletion; 4 frontend tests covering the source-workspace adapter and quick-card payload; typechecking and OpenSpec validation. An unchanged PDF snapshot opens its page, while a changed/deleted source preserves quote/title/page but marks navigation unavailable. The harvest wizard and full PDF browser acceptance remain open.

## Harvest candidate provenance and stale-state checks

Generated harvest candidates now carry the source version and a fingerprint of the originating mark/ink content. The wizard preserves this metadata when editing or excluding candidates. Apply locks the live source, atomically claims selected origins, validates their relevant state, and snapshots each origin's actual stored quote/page. Client-supplied replacement quote/page fields cannot retarget modern provenance. Excluded origins remain unharvested; repeated apply creates no duplicate cards. Changed source or markup state rolls back cards and all harvest claims. Legacy bodies without evidence metadata retain their adapter.

Targeted results: 25 API tests across harvest evidence, legacy harvesting, and direct-selection cards; 500 frontend/helper/locale tests across three files. Harvest transport preserves date-looking card text and version strings. The wizard shows a specific stale-evidence explanation while keeping edits in the open window. This is not yet the full browser acceptance or final release gate.

## First destination deck in the harvest wizard (task 9.5)

The complete rendered harvest wizard was exercised with an empty deck collection. The user edits a proposed front, creates a deck inline, reviews and applies the candidate; the request retains the edited front, original quote/origin, and evidence version. Deck creation does not regenerate candidates or close the wizard. A simulated stale-evidence response leaves the window and edits intact and shows the regeneration explanation. The direct quick-card path and shared reader-return checks run alongside this fixture.

Results: 18 frontend tests across wizard, quick-card, selection helpers and source workspace; 42 API tests across harvest evidence, legacy harvest and quick cards (including the first source-backed card entering its new deck's study queue); typechecking and OpenSpec validation passed. Together with the previously recorded fresh-account browser card flow, these complete task 9.5. The broader multi-device acceptance remains open.

The deployment/maintenance rollback procedure is now in `docs/contextual-assistant-rollout.md`, linked from the canonical/mirrored agent guides and chat/MCP docs. No production operations were performed. Task 10.4 remains open until its final documentation/acceptance audit.

## Artifact lifecycle and shutdown (task 8.3)

The artifact worker retains a cancellation controller from scheduling (including its pending DB claim) through final persistence. On drain timeout, outstanding controllers are aborted instead of leaving provider calls running. Runtime shutdown rejects late scheduling. Source-origin finalization checks cancellation again after acquiring its source lock, so a completed provider result waiting on that lock cannot commit ready after cancellation. Interrupted rows retain the existing startup reconciliation to `error/interrupted`; completed results are untouched.

Verified with 47 tests across source-study artifacts, notebook artifacts, artifact drain/cancellation and the shutdown coordinator. Cases include completion and streaming providers that ignore their signals, cancellation during DB claim and final source validation, late provider results, no new scheduling during shutdown, source deletion after commit, per-owner admission, bounded context, quiz scoring/history, foreign ownership, and regeneration with a missing source. Existing artifact admission/quotas and the separate overview/suggest/harvest cooldowns are preserved. Typechecking and OpenSpec validation passed. These checks complete task 8.3; the full browser and release gates remain open.

## Source study without embeddings and retained-work browser flow (task 8.6)

A real local browser flow created the text source “QA retained study — Kubernetes”, wrote a source note, generated a quiz through the local deterministic model service, and saved a 3/3 attempt. No notebook was created (verified against the isolated dev database). Initial generation exposed an incorrect ready-index requirement: the source was parsed and readable but parked at indexing without embeddings. Source artifact admission, context loading, regeneration and finalization now accept ready/indexing/index-failed parsed sources while excluding parser failures. Source generation rejects unavailable AI before inserting a job. Legacy notebook readiness behavior remains intact.

The exact QA source was then removed through the owner-checked deletion service after verifying its test account, title, kind, one ready quiz and one note. Only that newly-created local fixture was deleted. Its note and quiz IDs stayed unchanged with null live source IDs. In the browser:

- Saved study work lists the retained note; the Source unavailable filter excludes the other, still-live source note.
- The retained note opens with its historical source title and unavailable marker, accepts an edit, and displays the saved text.
- The retained quiz opens, shows the original 3/3 attempt, and accepts another completed attempt scored 2/3 (67%).
- Its action menu disables regeneration and explains Source unavailable. The menu trigger is labeled More actions rather than Regenerate.
- The `@` picker finds both retained objects with their historical parent title. Selecting the note and opening its chip navigates to `/library/study?note=<same-note-id>` and opens the edited note.

The source studio footer now describes source ownership. Generation failures also render an inline alert within the panel, avoiding invisible global toasts behind native dialogs. Verification: 43 API tests for source/notebook artifacts and source notes, 488 frontend/locale tests for the source studio and translation parity, workspace typechecking and OpenSpec validation. Task 8.6 is complete; task 10.2 still requires the full PDF/multi-device/concurrency/approval walkthrough.

## Save an assistant answer to its source (task 8.4)

In the local browser, Ask AI on the live Kubernetes source displayed the explicit add-to-current/start-new choice. Starting a new conversation visibly pinned that source. A deterministic streamed answer exposed To notes; saving it showed success, and the source's notes panel displayed the saved answer. A read-only database check confirmed `owner_kind=source`, the correct live source ID, `notebook_id=NULL`, a link to an assistant-role message, and zero notebooks for the QA account.

Together with the actual source quiz generation/read/play flow above, this proves the independent source-owner UI path. Regression verification passed: 60 API tests across source note tools/notes/artifacts and existing notebook notes/artifacts; 13 frontend tests for immutable answer destinations, owner-specific adapters and direct links. Task 8.4 is complete.

## Per-card evidence server audit (tasks 4.2 and 4.3)

Inspected the read/supplied evidence accumulators, per-entry preview mapping, card-selection filtering, and transaction-owned provenance writer. The evidence snapshot migration stores immutable quote/title/location metadata with nullable live links. Evidence requires an owned source and eligible chunk or supplied quote, rechecks relevant source/chunk state at apply, and writes per-card edges inside the same transaction as card creation and confirmation consumption. Versioned pending grounding survives intermediate confirmations; legacy pending proposals keep their explicit compatibility adapter.

The evidence/provenance/confirmation/batch suites passed 43 tests, including source-only conversation proposals, separate per-card passages, excluded cards, user-supplied unanchored quotes, unread/foreign chunks, changes before proposal or apply, rollback, rejection, legacy notebook deletion/reopening and repeat apply. A new replay assertion checks both cards and evidence rows remain identical after reapplying the same modern per-card proposal. Tasks 4.2 and 4.3 are complete; task 4.4 and the full browser acceptance remain separate.

## Focus/strict policy and edited-turn recovery (task 3.3)

Audited the shared read-scope wrapper: native source/card readers and curated aliases preserve frozen source/deck sets; web/page readers and unscoped aggregates fail closed in strict mode. Focus permits supplementary owned material with instructions to distinguish primary evidence. Empty strict selections and legacy unresolved selections do not expand automatically. Explicit policy classification uses a bounded, tool-free request with timeout/abort, treats quoted instructions as data, and asks for a visible choice on uncertainty.

Edited regeneration now performs policy intent resolution before new object-content resolution or transcript changes. The explicit composer policy choice is consumed by the edited request rather than silently overriding a later message; preflight rejection restores that choice only if the user has not supplied newer input. The inline edit form retains rejected text while the user changes scope and retries. Requests such as “use your own knowledge” and “используй любые источники” reach the bounded classifier for a possible return to focus.

Verification passed: 54 API/policy tests across intent, tool scopes, context contracts/conversations and regeneration; 30 frontend tests across message editing, shared controller and floating host; workspace typechecking and OpenSpec validation. Task 3.3 is complete. Live-model classification quality is not claimed by these deterministic tests; the full browser acceptance remains separate.

## Confirmation isolation and concurrent replay (task 3.5)

The confirmation/knowledge/source-tool/referenced-object suites passed 31 tests. Added a deterministic concurrent-resume test through legacy and context-v1 aliases: the first confirmation commits its object while continuation is held; a competing request receives turn_in_progress; a later replay is a terminal no-op. Exactly one object and one tool-result row remain. Other cases cover persisted previews, stale relevant-state fingerprints, rejection without writes, rollback, post-commit source ingestion, and referenced conversations that cannot consume pending actions or recursively expand context. Task 3.5 is complete.

## Migration ownership and mixed-version audit (tasks 8.1 and 10.3)

Two isolated migration fixtures passed with 43 assertions. They start from the committed pre-change schema, seed legacy rows, apply the new chain twice, and exercise notebook/source deletion. The old source-study schema explicitly rejects standalone note/artifact inserts before migration (not-null ownership constraint); the migrated schema supports retained source ownership. A legacy notebook quiz, its content and attempt retain their IDs after migration and continue to follow notebook deletion cascades, while source-owned notes/quizzes/attempts survive source deletion.

The context fixture now also seeds a real note/deck/card and review with non-default FSRS state. All columns of the note, card and review are compared before and after repeated migration, and card/review rows are compared again after deleting the notebook. Content, IDs, scheduling state and review history remain unchanged alongside retained conversation history and pending approvals.

Mixed-version verification passed 50 API tests for protocol aliases, legacy notebook/card-mention requests, pending provenance and contextual conversations, plus 40 frontend tests for versioned transport, unsupported-server gating, controller state, notebook direct links and host compatibility. Workspace typechecking and OpenSpec validation passed; generated OpenSpec skills/commands have no changes. Tasks 8.1 and 10.3 are complete. Full production rollout, the final command sequence and the complete browser walkthrough are not implied by these fixtures.

## Full PDF reader through library and notebook (tasks 9.1 and 9.2)

Uploaded a generated three-page local PDF through the normal browser file chooser and local S3 path. With embeddings disabled, the PDF opened, exposed its text layer, and saved a highlight. Ask on that selection opened the shared assistant with a visible PDF quote/page reference and the explicit new/current-conversation choice. No notebook existed during this flow. A local test response continued after minimizing the window.

On page 2, a complete sentence was selected and saved as a direct card. The cards browser displayed its exact quote, page 2 and honest user-quote label. Its backlink reopened page 2 and the saved card marker. A drawn underline then survived a reload alongside the highlight/card marker and the page position.

Created a notebook explicitly afterward, attached the existing library PDF, and opened it from the notebook. The same full reader showed page 2, the card marker and the persisted ink. The URL remained the notebook's URL; the return button restored the notebook workspace and focus on the same source row. The attachment reused the existing source rather than creating another book.

Browser acceptance found two issues that were fixed:

- The current-page indicator used overscan intersections and could show page 3 while page 2 was visible. Separate viewport/nearby tracking now accounts for observer delta batches and removes old render neighbours. The browser recheck showed page 2 and restored it correctly after reload.
- The notebook index hid all manual collection access behind embedding availability. Listing/creation now work independently of AI status, while individual AI operations keep their capability checks. Tests cover disabled and unreachable AI discovery. Source detail/backlink wording no longer incorrectly requires indexing for all study or sends every link to a notebook.

Verification passed: 75 API tests for annotations, PDF marks, quick cards and selection provenance; 501 frontend/locale tests across page visibility, progress, shared workspace, manual notebooks, quick cards and source links; typechecking and OpenSpec validation. Existing first-deck coverage and source-only notes/artifacts complement this PDF flow. Tasks 9.1 and 9.2 are complete. Reviewer backlink acceptance, the complete fresh-account/multi-device matrix, remain to be finished in their respective tasks. Parsed-but-unindexed notebook selection was subsequently verified under task 7.4 below.

The missing legacy backlink backfill identified during the reader audit is resolved by migration 0035 and the legacy-writer changes recorded below. Reviewer/browser tombstone acceptance remains open under 4.4/8.5.


## Legacy source evidence backfill

Migration 0035 fills null snapshots for owned, live source links without replacing modern snapshots. Chunk-linked rows receive title, excerpt, position/page and a runtime-compatible fingerprint; source-only rows preserve origin/title without inventing a quote. Already-deleted and cross-owner source metadata is not reconstructed. The migration uses a temporary helper for exact UTF-16 bounds without malformed surrogate pairs.

Isolated migration fixtures reproduce the original missing snapshot, then verify null/string source hashes, escaped/Unicode text, bounded excerpts, preserved modern evidence, ownership filtering and survival after chunk/source deletion. Legacy quick-card/harvest and pending-confirmation writers now attach snapshots on new writes as well. Modern snapshot clipping was also made Unicode-safe. The UI does not claim an empty legacy source-only reference contains a supplied quote, and it labels manual text selections as user-supplied.

Verification: 51 API/helper tests across evidence, provenance, quick-card, selections and harvesting; legacy migration fixtures pass for both hash variants; source-link/peek tests, typechecking and OpenSpec validation pass. The committed migration runner applied the chain to the isolated test and dev databases after the dev API was drained. A read-only QA check found no live QA links missing snapshots, and the existing PDF quote remained exact. No production database was changed. Deployment guidance now requires quiescing old card/provenance writers during the initial backfill.


## Context controls and parsed notebook selection (task 7.4)

The notebook rail now uses the same parsed-readability predicate as standalone source study: indexing/parked and index-failed sources can be selected, while parser failures remain excluded. Scope restoration preserves an explicit empty list, filters unknown IDs, and handles malformed local preferences safely. Polling computes transitions outside React state updaters; completing indexing no longer reselects a source the user already had the ability to uncheck.

Browser verification on the unindexed PDF changed the rail from 0-of-0 to 1-of-1 available. Unchecking it and starting a notebook conversation produced an explicit empty source choice. The conversation source picker showed zero selected, accepted a manual selection, and the subsequent strict-mode turn persisted that selection. Inspection of the saved message showed the notebook with one selected source. Prior browser checks exercised opening and inspecting source/note chips and canonical object navigation.

Tests additionally verify same-name decks remain distinct references, attaching them leaves focus mode unchanged, removing a reference keeps the draft without sending a request, and both reference-count and aggregate-excerpt overflows preserve the previous draft/context. The visible composer publishes 16-object, 4000-per-excerpt and 24000-total-excerpt limits. Verification passed: 25 frontend tests for controller/picker/scope behavior and 18 API tests including an actual strict notebook read of a parsed-but-unindexed source, plus typechecking and OpenSpec validation. Task 7.4 is complete.

## Text selection, persistence and restoration (tasks 9.3 and 9.4)

The selection audit reproduced adjacent block text being concatenated without separators. Serialization now retains paragraph/list/table/code-block boundaries and explicit line breaks while excluding reader controls and duplicate MathML. Normalized offsets restore against the matching rendered fingerprint; the previous v1 serializer is retained as an exact-hash compatibility fallback. Bounded prefix/suffix context no longer splits surrogate pairs.

Added cases cover block-separated excerpts, legacy range restoration, new-range round trips, Unicode context boundaries, outside-reader selections, 4000-character and sixteen-chunk limits, and saved-mark actions. Valid saved marks jump by their exact chunk ID; stale marks expose the historical quote without a stale chunk locator or invented PDF coordinates. A controlled async test reproduced restoration accessing the reader after unmount; cancellation now stops that work before touching the next mark or painting.

API fixtures verify identical persisted note/selection behavior for readable text, URL and EPUB sources, owner/parent/version checks, reingested anchors, quote-only fallback and per-card selection snapshots. Existing browser text-source checks verified saving/reloading a highlight and creating the first source-backed card. Verification passed: 19 frontend/shared tests for selection, marks and reader loading; 12 API tests for marks, marked-passages and selection cards; workspace typechecking and OpenSpec validation. Tasks 9.3 and 9.4 are complete.

## Mobile viewport and focus acceptance (task 6.3)

The mobile assistant was exercised in the actual browser at 390×844 and 390×430 (reduced available-height simulation), then through the 844×390 breakpoint. The composer and send control stayed visible, the unsent draft survived height changes and close/reopen, and closing returned keyboard focus to the launcher. Enter reopened the same draft. Temporary viewport overrides were reset afterward.

A browser keyboard check opened context inspection, focused its Close control, used Tab/Shift+Tab through the assistant-owned portal, and closed only that inspector with Escape while restoring its trigger. The implementation now includes portal controls in mobile focus cycling, excludes disabled fieldsets/programmatic-only controls, and preserves reverse Tab navigation in the mention picker. Popups follow viewport resize/panning instead of being stranded outside it. Focus restoration uses preventScroll so it does not move the underlying reader.

Component tests inject visualViewport height/offset/scroll transitions; geometry tests cover panned and rotated viewports. WCO geometry is tested through the platform hook, including restored window positions and geometrychange, and floating windows/popups reserve the reported titlebar area. Verification passed: 22 tests across host, window, overlay geometry and pickers, plus typechecking and OpenSpec validation. Task 6.3 is complete for the responsive/viewport behavior. These tests do not claim a physical-device keyboard session or a real installed PWA window; installed-window browser acceptance remains under 10.2, and cross-presentation confirmation/reviewer shortcuts remain under 6.4.

## Reviewer links and cross-presentation confirmations (tasks 4.4 and 6.4)

The local browser opened the PDF card's reviewer backlink at page 2, matching its saved evidence. A synthetic card whose owned source was removed through the source-deletion service retained its title and quote in the card browser, with a disabled unavailable source link. The same card in Review retained the historical source title and a disabled link. No review grades were submitted in these checks. Earlier editor/PDF and text locator checks cover the corresponding live-source navigation.

A deterministic local provider proposed a deck in the floating assistant. A database check found zero matching decks before approval. Expanding to Chats and reloading retained the same conversation and pending preview; applying there created exactly one deck. A separate proposal over a revealed review card was rejected with keyboard navigation, leaving the count unchanged. Typing Space, 1, K and E in the composer and 1 in confirmation feedback did not reveal or grade the underlying card. Tab reached Apply/Reject, and Enter rejected the pending action.

The browser exposed an Escape propagation gap in the composer. A failing regression reproduced it; the fix minimizes the floating assistant while preserving its draft, with nested menus retaining their own Escape behavior. Confirmation feedback now has an explicit accessible name. Targeted verification passed 18 host/window tests and workspace typechecking. The subsequent full migration-faithful test:ci run passed 2841 tests across 231 files (12016 assertions, zero failures). Tasks 4.4 and 6.4 are complete. This remains intermediate evidence, not the final task 10.5 gate sequence or real-provider quality evaluation.

## Deletion previews and independent retained work (task 8.5)

Source-deletion copy in both locales now distinguishes saved study notes from highlights, annotation comments and ink. Notebook deletion explicitly names notebook-owned quiz attempts; deleting a saved artifact explicitly warns that its attempts are deleted too. Source-owned notes and artifacts reuse the normal separate confirmation dialogs before their dedicated retained-work deletion requests.

The ownership integration test now uses actual attach, detach, notebook-delete and library-delete HTTP routes. Exact row comparisons after attachment, detachment and notebook deletion prove that a source note, completed quiz and attempt retain identity/content and are not cloned. Source deletion leaves the quiz and attempt unchanged apart from the nullable live-source link; the note remains editable and discoverable. Explicit note deletion leaves the quiz intact; explicit artifact deletion removes that quiz and its attempts. Existing source-backlink and contextual-conversation cases verify preserved cards/history and safe tombstones.

Verification passed 36 tests across source notes/artifacts, source backlinks and contextual conversations (240 assertions). Locale parity, workspace typechecking and strict OpenSpec validation also passed during this audit; the final gate sequence remains outstanding. Task 8.5 is complete.

## Card and deck Ask browser verification (task 7.5)

In the cards browser, Ask AI on the Deployment card opened the explicit new/current choice. Starting a new conversation pinned the exact card; sending QA_CARD_ASK persisted its chip. From Decks, Ask AI on Kubernetes QA offered the same choice; adding to the existing conversation and sending QA_DECK_ASK persisted both card and deck on that message. No write-approval prompt was needed for attachment, and the visible strict toggle stayed off. Expanding to Chats and reloading `/chat?thread=01a0c5f6-9267-70ce-ae9b-a8a8d3d3dc4a` restored both messages, their respective context chips and answers. The deterministic local model was used solely for transport/UI acceptance.

The six-kind Ask button contract and controller suites passed 21 tests (97 assertions). Source/note/notebook browser evidence is recorded above; the all-entry-point audit remains open until the artifact entry path and durable context are checked together.

## Completed Ask entry-point audit (task 7.5)

Ask AI on the retained source quiz opened the same explicit new/current choice as the other object types. Starting a conversation pinned the artifact without a mutation approval or automatic strict mode. QA_ARTIFACT_ASK was sent through the local deterministic provider; Chats listed the artifact title, and reloading `/chat?thread=01a0c5f8-c5ac-7377-848b-397c4e803d34` restored the message and both pinned/message artifact chips. This completes the browser entry coverage alongside the earlier card, deck, source, written-note and notebook flows. The six-kind button contract verifies exact typed references without submitting a surrounding form; shared controller and API snapshot/listing checks cover persistence. Task 7.5 is complete.

## Provenance regression inventory (task 4.1)

Audited the retained failing-run logs and current tests rather than claiming a new historical test-first run. The initial `/tmp/reomi-evidence-red.log` failed because the per-card evidence module did not yet exist; it did not execute individual assertions. Subsequent behavioral failures in `/tmp/reomi-evidence-flow-red.log`, `/tmp/reomi-supplied-evidence-red.log`, and `/tmp/reomi-quote-evidence-red.log` reproduced missing source-only proposals, supplied-passage grounding and source-level unanchored quotes. The legacy backfill regression separately reproduced absent historical snapshots. The resume red run reported turn_in_progress and is not counted as proof of a provenance defect.

The current inventory covers distinct evidence on two cards, excluded cards, global/source-only turns, unanchored supplied quotes, unread/foreign chunks, source changes before proposal and approval, rollback/rejection, and stored legacy pending grounding after reopening or notebook deletion. All 37 tests across card-evidence, card-provenance and agent-confirm passed (309 assertions). Combined with the recorded failing contract/behavior runs, task 4.1 is complete; the implementation and transaction acceptance are recorded under 4.2/4.3.

## Locale and accessible-name audit (task 10.1)

RU/EN parity includes the assistant object types, context availability/errors, policy limits, retained-work states and deletion consequences. Added an explicit accessible-name regression for the launcher, move/resize/reset/expand/minimize controls, composer, context chips and all rendered assistant buttons, plus the confirmation feedback field. The test accepts native buttons and keyboard-operable button roles. Picker keyboard selection/retry/reverse-Tab tests and the existing host tests cover focus return, modal mobile behavior, nested Escape, keyboard window adjustment, and named context inspection. Earlier actual browser accessibility trees expose these controls by name and the confirmation keyboard path was exercised. This is an accessible-name/keyboard audit, not a claim of a separate screen-reader product certification.

Verification passed 505 tests across host, context picker, six-kind Ask buttons and locale parity (599 assertions), all workspace typechecks and strict OpenSpec validation. Task 10.1 is complete. The complete browser/device matrix and final release commands remain under 10.2 and 10.5.

## Concurrent browser responses (task 10.2)

The local QA provider emitted eight distinct labeled chunks over 32 seconds per turn. Started QA_CONCURRENT_A in the retained-artifact conversation, switched to the card conversation and started QA_CONCURRENT_B, then switched back and forth while both rail entries showed Working. Each transcript displayed only its own incrementing chunks. Both reached chunk 8, and the hidden completed conversation displayed New answer until opened. Context chips remained attached to their respective conversations. This checks real browser/controller/SSE isolation with deterministic provider output, not real-model quality.

## Documentation coherence (task 10.4)

Audited the context protocol aliases, reference/excerpt limits, focus/strict admission, three-per-user/one-per-conversation lifecycle, source-owned retention, migrations 0031–0035, and deployment/rollback instructions against their implementation. Initial backfill requires drained old writers; API precedes web; old-API rollback remains maintenance-only with worker/ingress controls. Updated deletion semantics in CLAUDE.md first and mirrored AGENTS.md, and clarified saved notes versus annotation comments in chat tools documentation. The two repository-guide bodies match and generated OpenSpec skills/commands are unchanged. Acceptance records distinguish completed checks from the remaining device/browser and final gate work. Task 10.4 is complete; no production deployment is claimed.

## Browser focus versus strict reads (task 10.2)

With the retained quiz pinned, a deterministic QA_SCOPE_PROBE called read_source_chunks on a different owned, live text source. Focus mode returned that source's parsed content and a source citation. After selecting Only selected materials, the same attempted read returned outside_context without source content; the strict checkbox remained selected. An initial retry failed because the local simulator reused a tool-call ID already stored in the conversation. Its IDs were corrected to be distinct per turn; the successful strict check used that corrected simulator. No product bypass or weakening of the exactly-once result constraint was introduced.

Only the in-app browser is connected. Attempting native-app inventory for a real installed-window check reported that the Mac is locked and automatic unlock is unavailable. Requested a manual unlock while continuing independent work. Installed-window acceptance remains unverified; geometry mocks are not being counted as that real UI check.

## Tablet/mobile source surfaces (task 10.2)

At 768×1024 the existing PDF opened on saved page 2 with its three marks and floating assistant. A new unsent draft survived the transition to 390×844, mobile Back, and reopening; the PDF page control remained 2 and focus returned to the launcher. At 390×844 the parsed text source displayed headings, inline formatting, code and saved marks; its source note opened inside Saved study work. Ask from that note closed the study modal and opened the full-screen shared assistant with the exact note title and explicit current/new choice. Cancel/Back returned to the source with focus on Notes. Viewport overrides were reset. These complement the earlier keyboard-height/orientation and retained-note/quiz checks; a real installed window still requires native access.

## Final required command sequence (task 10.5)

After the last implementation/test edit, started PostgreSQL and MinIO/createbuckets through docker compose. Strict OpenSpec validation passed all 16 items; the committed migration runner applied successfully to the isolated test database; every workspace typecheck passed. Migration-faithful test:ci passed 2842 tests across 231 files, 12062 assertions, zero failures (123.63 seconds). Required real-S3 tests passed 16 tests, 65 assertions, zero failures. With the local web dev server stopped to avoid sharing `.next`, `bun run build` completed both the API bundle and web production build with exit code 0. The local dev server was then restored.

Logs: `/tmp/reomi-final-spec.log`, `/tmp/reomi-final-migrations.log`, `/tmp/reomi-final-types.log`, `/tmp/reomi-final-tests.log`, `/tmp/reomi-final-s3.log`, `/tmp/reomi-final-build.log`. No schema-push command replaced the migration gate and no production database or deployment was touched. Task 10.5 is complete for this implementation state; later implementation changes require relevant gates again. Task 10.2 remains open for real installed-window acceptance on the currently locked Mac.

## Installed-window preparation while native access is unavailable

A second native-app access check still reported a locked Mac. Prepared a production build with the isolated QA API/media origins because the development build disables Serwist. The first environment-specific build failed in next/font's Google loader; a subsequent full build completed both workspaces without source changes (`/tmp/reomi-pwa-build-retry.log`). This transient build dependency failure is separate from the successful required gate sequence above.

Started the generated standalone web server on loopback port 3101 under Node 26, with static/public assets arranged as in the web Dockerfile (`/tmp/reomi-pwa-server.log`). A fresh in-app-browser tab loaded the authenticated source reader and opened the floating assistant with the preserved transcript/draft. This proves the local production runtime works; it does not prove installation or window-control-overlay behavior. The native installed-window check still requires unlocking the Mac.

## Installed Safari application acceptance — 2026-09-22 (task 10.2)

After native access was restored, the user added the local production site to Dock as Reomi QA. Verified the running native application `com.apple.Safari.WebApp.91860300-7EAA-46E7-B82F-125803F9FE40`, separate from Safari's browser window. Signed into the synthetic QA account without saving its password. The app opened the existing PDF on page 2 with its saved marks. The floating assistant and its composer fit below the native titlebar; screenshots confirmed the initial large window and a smaller window produced through macOS Window → Move and Resize → Left. The assistant remained within the available content area, with window controls and Send accessible.

An ASCII draft entered through the native accessibility interface survived minimize/reopen; the PDF page remained 2 and focus returned to the launcher. Sending that draft and expanding to Chats during the deterministic response preserved the same conversation (`01a0c818-b0b8-708e-86b7-19be4fc77a5a`). Reloading the installed app restored both the user message and complete answer. The test used Safari's standalone fallback, which does not expose Chromium's window-controls-overlay API; the overlay-specific titlebar-inset branch remains covered by the geometry/platform-hook tests described above, rather than being claimed as a native Safari feature.

This completes the remaining installed-window portion of task 10.2 alongside the recorded fresh-account PDF/text, notebook, mobile/tablet, strict/focus, concurrency, approval, source-deletion and retained-work checks. No implementation code changed after the final required gate sequence. The installed QA app is local-only and was left installed by the user's action. All 48 tasks are complete; archive/commit/push/deployment are separate actions and have not been performed.

## User-review follow-up: reviewer launcher and visual layout

The user reported that opening the global launcher over Review did not include the visible card. Review now registers its active card with the shell provider; the launcher resolves and attaches that typed card through the existing Ask flow. Registration alone never changes an existing conversation. A different card requires the existing explicit current/new choice, and leaving Review clears the registered page context. The registration hook is inert when a component is rendered without an assistant provider.

The empty state now offers contextual explanation/example/self-test prompts. The composer separates scope from its action row, labels the context button with its count, and uses readable controls and theme surfaces. The compact window avoids an extra related-conversations text row. A browser check on the user's Deadlock review card confirmed automatic attachment without grading or advancing the card. Targeted verification passed 514 chat/locale tests, all workspace typechecks and the production web build. This is follow-up verification after the original full gate sequence, not a claim that that earlier full suite was rerun for these UI edits.

The follow-up also verifies reopening the same pinned review card does not duplicate it as a composer mention. The final targeted run passed 514 tests with 642 assertions; workspace typechecks and the rebuilt production web passed after that correction.

## Library processing, cover readiness and full-page chat follow-up

The library now prepares missing PDF first-page covers sequentially without navigating to the reader. Rendering is cancelled on unmount/account changes; upload and metadata writes check the current owner. Existing author/page count/cover metadata is retained. The metadata store adapter refreshes GET detail after PATCH because PATCH returns a source row without derived coverUrl. Full-row ingest polling keeps progress and available metadata synchronized. Cover image failure state resets when its URL changes.

Uploaded an agent-owned temporary three-page PDF to the local demo account. In the actual browser, the library changed its initials placeholder to the rendered first-page image without opening the source or reloading. API detail confirmed readingState and percent stayed null. Processing overlay appearance was inspected using a controlled parsing state on that temporary source; its stages and real-indexed-count progress have component tests and reduced-motion CSS. Removed the temporary source afterward; the user's book was not changed.

Full-page chat no longer applies a 45-percent cap inside an already-sized thread wrapper. The rail retains its saved adjustable width; transcript and composer share one centered column, with the current conversation title in the header. Browser inspection on the existing book conversation verified the wider rail and aligned composer. Verification passed 518 targeted chat/cover/locale tests, all workspace typechecks, strict OpenSpec validation and the production web build.

The full-page check also exposed a transient unauthenticated deep-link load. The page now waits for the account, and capability loading starts in the checking state. A regression verifies zero conversation requests before the account and exactly one afterward. Final targeted coverage: 519 tests, 659 assertions, all workspace typechecks and a successful production web build.

## Compact floating chat and grading follow-up

Reduced the default floating geometry to 400×540 while retaining manually saved sizes and the existing reset action. Tightened floating-only header/message/composer spacing and removed the duplicate conversation title; full-page chat keeps its separate typography. Desktop grading controls retain all four choices, recall hints, keyboard shortcuts and intervals with smaller padding/gaps. Replaced the ambiguous context control text with Add material and Only selected materials, with explanatory hover/accessibility text and an attached-object count. Browser checks verified the compact window, complete controls and smaller grading block without submitting a grade. Targeted chat/geometry/locale tests passed (518 tests), workspace typechecks and the production web build passed.

## Context controls moved out of the compact transcript

At the user's request, floating chat no longer shows the strict-scope checkbox, pinned-material row, or composer mention row. Its add control displays only @. The existing picker includes a bounded, scrollable selected-materials section with inspect/remove/pin controls; typed mentions still use the same picker. Full-page scope controls and stored policies remain unchanged. Native pointer dismissal permits nested assistant overlays, and keyboard inspection/focus tests now exercise the picker entry point. Browser verification found the active position: sticky card inside @ and confirmed its removal from the persistent window chrome without losing attachment. All 33 targeted chat/geometry tests, workspace typechecks, OpenSpec validation and the production web build passed. The local web launch agent was stopped and restarted around the build so automatic restart cannot race `.next` replacement.

## Review inspector resizing and chat-column alignment follow-up

The desktop Review inspector now uses the shared left-edge resize handle with a persisted 220–420px width (default 256). The handle stays outside its scrolling content. Actual browser interaction expanded it leftward to 344px, reload restored 344px, and double-click reset to 256px without grading a card. The loading grid consumes the same width preference.

Chat gives its outer thread wrapper and inner rail one controlled width; long draft labels truncate within that column. Filter actions moved into the rail header, and the conversation toolbar moved into the adjacent main column. Browser measurements at 220px found zero gap between the wrapper and transcript and zero top/bottom difference between the two headers. Also exercised the 420px maximum and reset to 280px. This fixes both the oversized empty band and mismatched header geometry.

Verification: 519 targeted chat/panel-width/locale tests (665 assertions), all workspace typechecks, strict OpenSpec validation, and production web build passed. The local launch agent serves the rebuilt bundle.

## Active deck context, initial geometry and titlebar controls

The user clarified that the global assistant should follow the active Review card and selected Decks object. The provider now caches separate contextual sessions per object and switches sessions when these page objects change, rather than mutating old conversation context. It preserves prior drafts/history/work, rejects late resolutions after another page/account/manual selection, and disables sends during resolution. Explicit object Ask retains its separate current/new flow. The conversation spec and design record this user-requested clarification.

The centering defect came from the initial 1200×800 provisional viewport clamping coordinates that had already been measured against the real viewport. Clamping now waits for mount/measurement; the latest pointer position is saved at drag completion. A regression verifies initial placement at 1728×998. Conversations and new-chat controls now live in the floating titlebar, with no extra toolbar row.

Browser acceptance: opened the assistant on Heap / Priority Queue, navigated to Decks with it still open, selected Architecture and patterns, and inspected @. Only that selected deck was attached; the old card was absent. Measured the final window at 400×540, 24px from the right and bottom, with zero conversation-bar rows. Targeted verification passed 37 chat/geometry tests plus 34 review/deck regressions, all workspace typechecks, strict spec validation and production web build.

## PDF selection panel and compact tool trace follow-up

Replaced the clipped single-row PDF selection pill with a viewport-bounded panel: quote/page preview, ten colors, Ask, card, note and copy. Note focus no longer destroys the source selection; failed saves preserve the panel for retry. Actions use normal button activation, selection/note bounds are visible, and copying reuses the existing HTTP-compatible fallback. Ask attaches a typed source_passage and prefills a question without submitting it. The additive color palette is stored as text; the API must precede the web update, with no migration required.

Browser verification used an agent-created temporary PDF. Saved a blue highlight, reloaded and saw it persist; entered and saved a note without the panel closing; selected a different sentence and attached it to a new chat draft. Inspection showed the exact quote and Passage kind, and opening the chip navigated to the matching source chunk and page 1. Removed the unsent draft attachment/text and deleted the temporary PDF after verification. The user's book was not edited.

A completed single read now has one disclosure rather than nested activity cards. Expanding results shows three rows first, with the remainder behind an explicit expansion and bounded scrolling; pending write confirmations remain independently visible. Verified the existing 19-deck result in the browser and with a collapse/expand component regression. Verification passed 525 frontend/locale tests (712 assertions), 39 mark/grounding API tests (213 assertions), all workspace typechecks and production web build.


### PDF selection and margin-note polish — 2026-09-22

- Removed deck-tree count legend and excluded empty pin-only page sessions from visible draft rows, preserving the sessions themselves and meaningful drafts.
- Passage chips now identify their kind and page before the source title.
- Smart-card input no longer falls through to the ink canvas. It tracks pointer ownership/cancellation and loads text before extracting the selected rectangle; stale document results are discarded.
- Highlight paint shares one opacity group, including overlapping saved marks. Transient selection uses one page paint group instead of tinting intersecting transparent PDF glyph spans independently; native selection remains a fallback when a page overlay cannot be produced.
- Margin note markers are accessible buttons with readable hover/focus previews. Saved study work distinguishes My notes / Margin notes / Documents, with quote, page navigation and editable comments; storage ownership and deletion semantics are unchanged.
- Browser acceptance on isolated temporary source: saved a margin comment and observed the exact quote and comment in Margin notes, reloaded and observed its marker, then dragged Smart Card over a second line. New-card Back contained the selected sentence, while Undo remained disabled after closing (no ink created). Verified deck tree no longer contains the legend. Temporary source removed after testing; no user annotations/cards deleted or graded.
- Targeted web tests, workspace typecheck, strict spec validation and local production web build passed; logs /tmp/reomi-selection-polish-{tests,types,spec,build}.log. This follow-up does not claim a fresh full migration/S3 release suite.


### Main-branch release gates — 2026-09-22

Committed migrations applied to the isolated test database; full CI-style suite passed 2860 tests, 12168 assertions across 233 files. Real local S3 suite passed 16 tests, 65 assertions. Workspace typecheck and API/web production builds passed. AI credentials were explicitly unset for the test process, preserving the real-model local stand configuration. The first run used its configured embedding model name and failed a default-name assertion; the isolated CI-settings rerun passed. Strict post-archive OpenSpec validation passed 21 items. Eleven completed changes were archived; complete-spaced-repetition-polish remains open at the user's explicit request. The older waiting scenario was reconciled with simplify-study-workspace's later navigation-only design.

A pre-release production database backup completed successfully in Coolify (execution px5oagrp6qzjijov8rqmalcl, 2026-09-22T18:25:51Z). Deploy now verifies the old API has stopped before replacing it, preserving the backfill's no-old-writer requirement. Production health must still be verified after the main push.
