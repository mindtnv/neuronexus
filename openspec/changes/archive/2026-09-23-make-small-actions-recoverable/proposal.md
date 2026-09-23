# Proposal

## Why

Small edits currently use inconsistent busy/error feedback and component-local dismissal behavior. Users should know whether their input was saved, retain it when a request fails, and undo eligible changes without accidentally overwriting later work or closing the wrong panel.

## What Changes

- Use one save-status vocabulary and accessible inline presentation: “Сохраняется”, “Сохранено”, “Не удалось — повторить”, with an honest checking state when the server outcome is unknown.
- Apply it to card/note-type editors, written study notes, source metadata, notebook titles and deck metadata; reuse existing editor draft/version guards and extend safe recovery where missing.
- Add conditional, retry-safe Undo for study-note pinning, source/notebook/deck renaming and supported metadata changes, and deck hierarchy moves. Keep a small session-local list of available undos across route changes so a disappearing toast is not the only access point.
- Make Escape, outside clicks and mobile Back respect one topmost layer, unsaved input, selection snapshots, focus return and existing navigation history.
- Preserve explicit confirmation for irreversible deletion and all assistant/MCP writes.

## Capabilities

### New Capabilities

- `recoverable-small-actions`: consistent save feedback, preserved input and conditional inverse actions for the explicitly supported small edits.
- `predictable-layer-dismissal`: consistent dismissal, focus and mobile Back behavior for menus, selection controls and transient panels.

### Modified Capabilities

None. Existing navigation, review undo and editor recovery contracts retain their authority. This change extends shared presentation and adds safe adapters rather than redefining those capabilities.

## Impact

Web save primitives, draft adapters, toast actions, shell-level recent undo list, shared layer handling and navigation integration. API domain adapters for study notes, source metadata, notebook titles and decks gain safe mutation/undo entry points and additive receipt/version migrations. Existing card/note-type concurrency checks remain authoritative.

Non-goals: trash or undelete for sources, decks, cards, notes or quizzes; undo of AI generation, uploads, quiz submissions or study grades; automatic background replay; full offline editing; replacing explicit Save with autosave; a universal action API accepting arbitrary table names/patches; completing unrelated items in `complete-spaced-repetition-polish`; redesigning navigation continuity or the home continuation block. Default scope excludes deletion recovery; a later request for a trash workflow requires its own lifecycle/storage design. No production deployment is authorized by this planning change.
