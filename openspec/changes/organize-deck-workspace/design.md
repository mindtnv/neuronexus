## Context
Decks already have optional icon/color/parent fields. The web sorts siblings alphabetically. Study summary and forecast already support complete subtree counts. Existing card context menus provide touch and keyboard behavior.

## Goals / Non-Goals
Persist organization across clients while keeping scheduling and content unchanged. No garden changes, new agent mutations or deployment in this task.

## Decisions
- Add integer position with default zero; ties use name then id, preserving old alphabetical behavior. Normalize destination sibling positions in a single transaction on move instead of fractional ranks. Existing user indexes suffice for small owner-scoped trees.
- Add authenticated POST /decks/:id/move with targetId and before/after/inside. Null target means root append. Lock owner hierarchy changes and validate ownership/cycles before any writes; return authoritative owner decks.
- Use existing icon strings with a curated UI icon set and safe default for unknown legacy values. Reuse native appearance modal and shared context action menu.
- Rows expose new/learning/due counts; selection drives a side inspector on desktop and separate pane on mobile. Forecast remains server-backed and keyed by deck; no cache-derived study totals.
- Use pointer-driven desktop drag handles and explicit move dialog on all devices. Disable dragging during filtering to avoid ambiguous hidden positions. Keyboard tree traversal and context key are supported.

## Risks / Trade-offs
- Concurrent moves can create cycles or overwrite sibling order: serialize owner hierarchy REST mutations and test opposite requests.
- Long nested names: bounded indent, ellipsis, full accessible labels and visible parent path in details.
- Failed requests: commit UI order only after server success; preserve old tree and surface errors.

## Migration Plan
Generate and commit an additive position migration. Apply migration before the new API, then web; no production deployment is requested. Previous API/web remain compatible with the extra column; rollback leaves it intact. No new index or destructive backfill is needed.

## Follow-up validation
The appearance catalog now exposes 48 searchable icons and 30 named colors. Migration 0030 only adds deck enum values; notebook colors remain unchanged. Deploy the migration/API before the web picker. Retain enum values on rollback; old clients do not have all new swatches. Pointer capture plus hit testing replaces native HTML dragging for embedded-browser support, with Escape/pointer cancellation and invalid-descendant rejection. Browser validation moved the empty Test deck into Practice and restored it to IT vocabulary before reload. Tag bulk actions use existing searchable selection; removal options come only from the selected server rows.

Cards workspace follow-up: the local desktop filter rail uses the existing resize separator with a persisted 180–440px preference, clamped to retain room for results. Empty results omit the wide table header and offer scoped creation or clearing the search. The deck toolbar retains name search and expand/collapse controls; status segments are removed.
