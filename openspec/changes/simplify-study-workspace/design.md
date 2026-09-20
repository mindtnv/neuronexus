## Context
Main now includes versioned draft recovery, clone-on-save, bounded note conversion and safe review sessions. These are the foundation; replace presentation without reverting them.

## Decisions
- Extract the mode switch, draft preview and form into one CardEditor component for both routes. Keep the form mounted across tab changes and preserve all caller callbacks, review return and draft storage.
- Remove ephemeral zen state, triggers and shell branches. Edit lives in the card inspector (inline on small screens); undo lives above ratings. Similarity mounts after reveal, hides empty/error states and is keyed by card to prevent stale answers.
- Restyle note-type list and form using one workspace surface, responsive authoring/preview columns and semantic controls. Use existing builtin PATCH cloning; explicit notices and the existing conversion step clarify which notes change.
- Use theme-derived Mermaid colors and rerender on palette as well as mode changes; serialize initialize/render pairs because Mermaid has global config. Keep strict SVG sanitization.
- Toasts use restrained icons, opaque readable surfaces, proper dismiss buttons and reduced-motion support. Normalize inline-code font sizing and blockquote margins. Completion uses the shared surface and action hierarchy.
- No schema, migration, indexing or deployment changes. Execution of code blocks is only a backlog record, never a runtime feature in this change.

## Risks and validation
Preserve template/cloze identity and stale-write protection in the shared editor. Test preview retention, builtin cloning/isolation, theme switches and review shortcuts; check desktop/narrow layouts and draft recovery manually. Run typecheck, focused suites and strict spec validation after the final edits.

## Follow-up decisions
Narrow card details use a native dialog; answer-mode changes use a portal dialog below the existing confirmation layer. Group reviewer actions with their keyboard hints. Completion derives analytics directly from the active session and the retired route redirects. Keep draft recovery and provide actionable empty/populated states. Remove clone explanation/interstitial; private copies remain in the list with an Apply-to-notes action. Theme animation uses View Transitions and falls back to immediate updates for reduced motion or unsupported browsers. No garden feature work; show study progress only.

Card context actions share existing bulk handlers. Opening on a selected row retains the selection; another row selects only that card. Each row also has a visible touch/keyboard menu trigger. A compact selection bar opens the same actions; mobile uses a bounded sheet. Graph legend disclosure is independent of node visibility, defaults closed on mobile and preserves filter state across collapse.

Settings hardening keeps existing APIs and preferences: bounded section cards, desktop local navigation and a mobile section selector. Failed profile patches remain retryable across later saves; late responses cannot replace newer drafts or restore a signed-out profile. Presets use labelled native validated forms; token creation is single-flight and copying supports the private HTTP preview. Technical model/default information and account deletion are disclosed on demand. The garden picker is removed from settings while garden work remains deferred.
