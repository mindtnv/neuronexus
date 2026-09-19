## Why

The second spaced-repetition audit found content/history loss paths and substantial gaps in authoring, recovery, scheduling, collection management and analytics. The user has requested implementation of all 120 items in `docs/spaced-repetition-audit-round-2.md`, preserving the previous 81 fixes and avoiding unnecessary infrastructure.

## What Changes

- Preserve Markdown source, interpret cloze/code/math consistently, support explicit typed-answer fields and safe note-type evolution.
- Add recoverable authoring, study sessions, operation retries, history and bounded collection operations.
- Introduce explicit study-day, budget, bury, practice and session controls with compatible defaults.
- Correct analytics definitions and add complete scoped aggregates and drill-down.
- Add versioned portable study exports/imports, safe media lifecycle and accessible study controls.
- Verify realistic data volumes, failure recovery, privacy, supported browsers and operational recovery before marking their audit items complete.
- **BREAKING:** new saves preserve Markdown source rather than treating it as HTML. Rendering remains sanitized; literal HTML is text. Correcting retention to include Hard changes reported metric values. Migration-sensitive relationships and additive fields are covered by rollout/rollback plans.
- **BREAKING:** note-type DELETE requires an exact token from the new deletion preview endpoint, even for unused types. Older clients fail safely without deleting data; deploy the API before the updated web.
- **BREAKING:** removing generated cards through note/type PATCH now requires a current preview token. Structural field/template renames use stable IDs; ambiguous legacy edits are rejected safely. Existing pending AI note edits without server preview metadata must be proposed again. Deploy the API before the web; preview uses dedicated read-only URLs so an older API cannot accidentally apply a preview request.

## Capabilities

### New Capabilities
- `card-content-fidelity`: lossless content, cloze semantics, explicit typed answers and render diagnostics.
- `safe-note-type-evolution`: identity-preserving schema edits, previews and concurrent authoring safety.
- `study-scheduling-controls`: local study day, effective budgets, bury and explicit scheduling operations.
- `recoverable-study-workspace`: drafts, recoverable sessions, retry-safe operations and collection workflows.
- `trustworthy-study-insights`: consistent retention, scoped metrics, forecasts and inspectable history.
- `portable-study-collections`: complete snapshots, restore/import/export and media preservation.
- `accessible-study-media`: accessible rich media, private access, bounded uploads and device recovery.

### Modified Capabilities

None. Existing pagination, readiness, request observability and migration-faithful CI contracts remain in force.

## Impact

API/web/shared/db workspaces, migrations, study UI and user-scoped export/media endpoints. Existing dirty-worktree changes are preserved. Tests follow each vertical slice; final gates use committed migrations, real S3 and production builds.

Non-goals: a replacement scheduler, microservices, CRDT, a general event bus, full offline grading or a new analytics platform. No production deployment or destructive production operation is implied. The complete 120-item audit is the scope; uncertain findings require evidence, not automatic checkmarks.
