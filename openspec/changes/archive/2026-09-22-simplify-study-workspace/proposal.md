## Why
The reviewer competes with its own utility controls, while note-type management and the standalone editor still use an older layout. The user wants one coherent study workspace that preserves the new safety and draft-recovery behavior from main.

## What Changes
- Remove focus mode and its keyboard shortcut; keep normal shell navigation throughout review.
- Show available similar cards after answer reveal in the inspector, with an inline fallback on narrow screens; remove the floating drawer trigger.
- Put editing with card details and undo with study actions; modernize completion and toast presentation.
- Make note types discoverable from the cards toolbar, with obvious personal editing of builtins using the existing clone-on-save flow.
- Share card editor and preview UI between the standalone route and side panel; align note-type authoring, inline code and Mermaid with Reomi.
- Record executable code blocks as a lowest-priority backlog item only.

## Capabilities
### New Capabilities
- `study-workspace-presentation`: review controls, related cards and consistent editor access.
### Modified Capabilities
None.

## Impact
Web UI and tests only. Existing owner-scoped type clone/conversion, confirmation, draft recovery and scheduling contracts remain unchanged. No API, migration, embedding, production-deployment or code-execution changes are part of this work.

Follow-up: expose card actions through a context menu and compact selection controls, and collapse the graph legend on mobile. Wide-screen deck layout remains a discussion, outside implementation.
