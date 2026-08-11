## Context

See [proposal.md](./proposal.md) for motivation. The repository deliberately has two database workflows: fast local development uses `drizzle-kit push --force`, while release safety depends on the committed SQL migration chain. Bun runs `pre<name>` lifecycle scripts automatically, so the current CI call to the root `test` script also invokes `pretest` after migrations have already been applied.

The default `GET /cards` query orders only by `created_at DESC` and serializes only that timestamp into its cursor. PostgreSQL timestamps are not unique, and bulk inserts or test fixtures can place several rows on the same value. Card IDs are UUIDv7 for new rows, but existing UUIDv4 rows remain valid; both formats are comparable as PostgreSQL UUID values and work as deterministic tie-breakers.

## Goals / Non-Goals

**Goals:**

- Preserve the fast schema-push loop for local `bun run test`.
- Give CI a full-suite command that cannot trigger `pretest`.
- Make default card pagination lossless and index-supported.
- Preserve compatibility with timestamp-only cursors already held by clients.
- Make OpenSpec validation part of both required database test gates.

**Non-Goals:**

- Replacing Drizzle migrations or removing `db:push` from development.
- Re-encoding or rewriting existing UUIDv4 rows.
- Unifying every cursor format in the API in this change.
- Backfilling specifications for already-shipped application features.

## Decisions

### Use a separate `test:ci` script with no matching lifecycle hook

`test:ci` will invoke Bun's test runner directly with the same environment as `test`. CI applies migrations explicitly and then calls `test:ci`; the existing `pretest` remains attached only to `test`.

Alternative considered: pass a flag through `bun run test` to skip its pre-hook. Bun executes lifecycle hooks before script arguments are interpreted, so this is brittle and obscures the contract. Removing `pretest` entirely would make local test setup less reliable.

### Enforce the workflow contract with a repository-level unit test

A small test will parse the root package manifest and inspect both workflow files. It will assert that `test:ci` contains no schema-push command and that migration-gated workflows call it rather than `test`. This detects the exact regression that previously made migrations untrustworthy.

Alternative considered: rely only on comments and review. That provides no executable signal when scripts or YAML are later simplified.

### Reuse the library endpoint's readable composite cursor convention

The card cursor will be `<ISO timestamp>_<UUID>`. Parsing uses the final underscore, so the ISO timestamp remains intact. New responses always emit the composite form; a cursor without an underscore follows the existing timestamp-only behavior. The query predicate for descending order is:

`created_at < cursor.created_at OR (created_at = cursor.created_at AND id < cursor.id)`

and the order is `created_at DESC, id DESC`.

Alternative considered: introduce a base64url JSON cursor. It is more opaque and extensible, but the repository already ships the readable tuple convention on `/library`; adopting another encoding here adds complexity without a current requirement.

### Extend the existing card list index

`cards_user_created_idx` will cover `(user_id, created_at, id)`, matching the ownership predicate and tuple order. PostgreSQL can scan the ascending B-tree backward for the descending query, so explicit descending index columns are unnecessary.

## Risks / Trade-offs

- **[Legacy timestamp cursors can still skip timestamp peers by design]** → Preserve their exact old semantics only for compatibility; every newly returned cursor is composite, so clients converge after one response cycle.
- **[Cursor text is not opaque in appearance]** → Document that clients must replay it unchanged; server parsing remains internal and can later accept another encoding alongside it.
- **[Repository-contract test knows workflow filenames]** → Keep the assertion limited to the two deployment gates that are part of this capability, making additions intentional.
- **[OpenSpec CLI updates can regenerate agent skills]** → Pin the CLI in the lockfile and update generated files with the pinned `openspec update` workflow.

## Migration Plan

1. Add the composite index migration; applying it replaces the existing two-column index.
2. Deploy the backward-compatible query and cursor response together.
3. Switch both CI workflows to `test:ci` only after their explicit migration step.
4. Rollback is code-compatible: the previous server accepts the timestamp prefix only if clients strip the suffix, so a server rollback should also temporarily retain the composite cursor parser or deploy before new cursors are consumed. With no production deployment yet, this risk is currently limited to local test data.
