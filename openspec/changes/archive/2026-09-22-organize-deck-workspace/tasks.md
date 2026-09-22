## 1. Durable hierarchy
- [x] 1.1 Add regression tests for reorder, nesting, root moves, foreign targets and concurrent cycles; implement the additive migration and transactional move API until tests pass.
- [x] 1.2 Wire order mapping, store moves and shared tree sorting; verify ordering and existing tree tests.

## 2. Deck workspace
- [x] 2.1 Implement icon/color editing, contextual menus and desktop dragging with touch/keyboard move alternatives; verify saved appearance and hierarchy interactions.
- [x] 2.2 Implement compact row counts and responsive selected-deck details/forecast using server data; verify partial-cache and failure behavior.

## 3. Verification
- [x] 3.1 Run fresh typecheck, migration-faithful API tests, web tests and strict specs; inspect desktop/mobile browser layouts and document compatibility.

## 4. Follow-up usability
- [x] 4.1 Expand appearance to 48 named icons and 30 persistent colors, narrow the inspector, and verify palette/API compatibility.
- [x] 4.2 Replace unreliable native dragging with pointer movement, reveal handles on hover/focus, and verify an actual browser move plus cancellation and invalid targets.
- [x] 4.3 Replace tag text prompts with searchable existing-tag selection; removal is scoped to selected cards, with regression coverage.

## 5. Cards layout follow-up
- [x] 5.1 Add persistent, bounded resizing of the cards filter rail, modern empty-state actions and remove deck status segments while preserving name search; verify keyboard/pointer interaction, empty deck creation and regression suites.
