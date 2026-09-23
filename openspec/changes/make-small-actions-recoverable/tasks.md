# Tasks

## 1. Written-note saving and recovery slice

- [ ] 1.1 Add failing controller/component tests for revision A acknowledgement after newer input B, inline failure, unknown outcome and account change; verify failures expose the missing shared save contract.
- [ ] 1.2 Implement the revision-aware save controller/presentation and integrate written-note create/edit; verify 1.1 passes without converting explicit Save to autosave.
- [ ] 1.3 Add failing integration tests for lost create response, repeat request, changed arguments and stale study-note revision; then add receipt/revision migrations and typed transactional adapters, verifying one created note and no overwritten concurrent content.
- [ ] 1.4 Extend existing draft scopes/list/export for source, notebook and retained study notes; verify reload, source deletion, late acknowledgement, denied storage and capacity failure preserve all text and existing note/type drafts.

## 2. Existing editor and metadata adapters

- [ ] 2.1 Add failing contract tests for card/note-type save acknowledgement and ambiguous create/update; integrate shared feedback/receipt handling with existing preview/version/draft owners, verifying destructive previews, single-use confirmation replay and existing recovery tests remain valid.
- [ ] 2.2 Add failing source metadata save/undo tests, then add revision triggers and adapters for title/author/description/tags; verify legacy/agent writes invalidate stale inverses while ingestion and reading progress do not.
- [ ] 2.3 Add failing notebook-title and deck-name/color/icon tests, then add their adapters and form status UI; verify owned reads, stale conflicts, input retention and preserved unrelated metadata.
- [ ] 2.4 Add failing study-note pin tests, then implement its conditional inverse without changing content recency; verify pin/unpin A→B→C→B and concurrent requests are handled safely.

## 3. Deck move reversal

- [ ] 3.1 Add failing integration tests for restoring parent/sibling order, subtree moves, deleted parents, later hierarchy changes and legacy/assistant races; verify fixtures include multiple owners and unchanged card schedules.
- [ ] 3.2 Add owner hierarchy revisions/triggers and the move receipt/inverse under compatible owner locks; verify 3.1, receipt replay and no cycle or cross-owner restoration.

## 4. Durable offers and explicit Undo

- [ ] 4.1 Add failing receipt tests for atomic undo, expiry, lost response, changed arguments, foreign owner, stale target and bounded cleanup; implement shared receipt lookup/consumption and verify all adapters pass the same suite.
- [ ] 4.2 Add the owner/session scope and paginated unexpired-offer listing; verify same-tab reload, more than four actions, storage denial, account switching and exact expiry based on server time.
- [ ] 4.3 Implement accessible toast actions and the shell recent-actions list; verify toast expiry does not remove valid offers and failed/uncertain undo stays visible for reconciliation.
- [ ] 4.4 Integrate the recent-actions section with Operations when available, retaining an independent shell entry otherwise; verify small saves never inflate the long-operation active count and unsupported actions never show Undo.

## 5. Shared dismissal and navigation

- [ ] 5.1 Add failing layer conformance tests for nested portals, one-layer Escape, outside click-through, dirty guards, IME composition and focus return; implement the registry and guarded closure, verifying the suite passes.
- [ ] 5.2 Migrate shared dialogs, shell drawers, account/card/thread menus and global overlays; verify each uses the conformance suite and preserves keyboard action/confirmation semantics.
- [ ] 5.3 Migrate PDF/text selection editors, reader saved-work panels and mobile inspector/filter sheets; verify selection snapshots and text survive errors and every closing path, while saved marks remain unchanged.
- [ ] 5.4 Integrate assistant-owned popups with the common layer ownership/focus model; verify pending approvals never confirm on dismissal, stream ownership persists and disabled controls stay outside focus cycling.
- [ ] 5.5 Add failing history-bridge tests, then integrate mobile layer markers through the existing navigation provider; verify one-layer Back, Forward, reload cleanup, repeated Back during a guard, route-backed readers and browser keyboard dismissal without loops.

## 6. Acceptance and release readiness

- [ ] 6.1 Record real Chromium and mobile WebKit browser evidence for each surface in the design matrix, including save failure, lost response, reload draft recovery, ten-minute Undo, later cross-tab writes and nested dismissal; include keyboard/screen-reader and reduced-motion checks in acceptance.md.
- [ ] 6.2 Verify migration/trigger behavior on fresh and preexisting data, receipt query indexes, bounded cleanup, API-first rollout and old-API fail-closed behavior; record executable evidence and rollback steps.
- [ ] 6.3 Update CLAUDE.md and mirror AGENTS.md with the supported action list, draft bounds and versioned-route contract; verify canonical bodies remain identical apart from headers and no unrelated audit tasks are marked complete.
- [ ] 6.4 After the final edit run strict OpenSpec validation, typecheck, committed test migrations, test:ci, build and real-S3 test:s3:ci against disposable services; record fresh results and remaining limitations before archive.
