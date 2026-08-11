## Why

The current CI path applies committed migrations and then runs a test command whose lifecycle hook pushes the live Drizzle schema, so a missing migration can be silently repaired before tests execute. Separately, `GET /cards` paginates only by `created_at`, which can skip cards when multiple rows share the same timestamp.

## What Changes

- Add a migration-faithful CI test command that never invokes `db:push` after applying the committed migration chain.
- Add an automated repository contract that prevents migration-gated workflows from regressing to the schema-push test path.
- Change `GET /cards` to use a stable `(created_at, id)` descending order and composite cursor, while accepting legacy timestamp-only cursors.
- Add the matching composite database index and a versioned migration.
- Validate all OpenSpec changes and specs in pull-request and main-branch CI.

## Capabilities

### New Capabilities

- `migration-faithful-ci`: CI verifies the committed migration chain without reconciling schema drift through `drizzle-kit push`.
- `lossless-card-pagination`: Card list pagination has a deterministic total order and does not skip or duplicate equal-timestamp rows.

### Modified Capabilities

None; this repository has no archived OpenSpec capabilities yet.

## Impact

- Root scripts and dependency lockfile (`package.json`, `bun.lock`).
- Pull-request and deployment workflows under `.github/workflows/`.
- Card list query implementation, integration tests, Drizzle schema, and committed migration chain.
- Repository guidance for Codex and Claude.
- New project-local OpenSpec configuration and generated agent workflows.
