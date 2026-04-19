# Autonomous Delivery Contract

This document defines the minimum bar for any autonomous agent or human operator
who says a branch is ready to ship.

## Branch strategy

1. Never leave implementation or release work on `main`.
2. If a task starts on `main`, create a task branch before making or validating
   changes.
3. Keep the branch scoped to one delivery unit. If the diff mixes unrelated work,
   split it before asking for review or merge.

## Required validation

The minimum validation loop for branch-ready work is:

```bash
docker compose up -d postgres
bun run typecheck
bun run test
bun run build
```

Add the checks that match the change surface:

- UI or learner-loop changes: `bun run smoke:learner` or an equivalent
  browser-level QA pass that is named explicitly in the release note.
- Schema changes: generate and commit the matching Drizzle migration files.
- Delivery or staging changes: update the deploy or rollback docs in the same
  branch.

If a command cannot run because the workspace is missing local env configuration,
say that directly and note the exact substitute validation that was used.

## Commit and diff quality

- Commits should be intentional and readable. Avoid "misc fixes" shipping commits
  that hide unrelated work.
- Do not ask for merge if the diff still contains dead code, placeholder routes,
  half-wired controls, or undocumented operational changes.
- If the diff is not ready, send it back with concrete findings instead of
  pushing it over the line.

## Push and PR requirements

Before closing out release work, make sure all of the following exist:

- branch name
- latest commit SHA
- successful push to `origin`
- PR URL, or an explicit pushed-branch URL/path if a PR is intentionally absent
- validation summary with the commands or checks that were run

If the work is already merged, record the merged PR URL and the merged commit on
`main` in the closeout note. Re-pushing the task branch to confirm remote state is
acceptable and should be called out.

## Release comment contract

The final issue or handoff comment must include:

- branch name
- latest commit SHA
- push result
- PR URL or pushed-branch URL/path
- validation summary
- any important exceptions, substitutions, or blockers

If any of those fields are missing, the work is not done.
