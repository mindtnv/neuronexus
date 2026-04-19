# Staging Delivery

This is the release path for staging changes that touch the learner loop or its supporting API surface.

## What is gated

Every staging candidate goes through the same sequence:

1. CI must pass on the target commit (`typecheck`, `test`, `build`, learner smoke on local services).
2. The staging deploy workflow builds and swaps the candidate on the staging host.
3. The workflow runs the same learner smoke against the staging URLs.
4. If staging smoke fails, the workflow runs `staging:rollback` automatically.

The deploy path is implemented by [scripts/staging-release.ts](/Users/mihailanonov/.paperclip/instances/default/projects/710f14e7-5bf7-41f4-aa08-a0624f6e1a2e/6df50f70-fd90-41de-9fc3-287dd334db63/neuronexus/scripts/staging-release.ts) and [scripts/staging-rollback.ts](/Users/mihailanonov/.paperclip/instances/default/projects/710f14e7-5bf7-41f4-aa08-a0624f6e1a2e/6df50f70-fd90-41de-9fc3-287dd334db63/neuronexus/scripts/staging-rollback.ts), with orchestration in [staging-deploy.yml](/Users/mihailanonov/.paperclip/instances/default/projects/710f14e7-5bf7-41f4-aa08-a0624f6e1a2e/6df50f70-fd90-41de-9fc3-287dd334db63/neuronexus/.github/workflows/staging-deploy.yml).

## Required staging host setup

- A dedicated clone of this repo on the staging box.
- `bun >= 1.3`, `git`, Docker, and Docker Compose available on that host.
- A staging env file on the host, typically `.env.staging`.
- GitHub Actions secrets:
  - `STAGING_SSH_HOST`
  - `STAGING_SSH_USER`
  - `STAGING_SSH_PRIVATE_KEY`
  - `STAGING_APP_DIR`
  - `STAGING_ENV_FILE`
  - `STAGING_API_URL`
  - `STAGING_WEB_URL`

The staging env file must define:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `WEB_ORIGIN`
- `NEXT_PUBLIC_API_URL`
- `POSTGRES_PASSWORD`

Optional explicit smoke URLs:

- `STAGING_API_URL`
- `STAGING_WEB_URL`

Staging should terminate TLS for both the web and API entrypoints. In production
mode BetterAuth marks session cookies as `Secure`, so learner smoke only
reflects real staging behavior when `STAGING_WEB_URL` / `WEB_ORIGIN` and
`STAGING_API_URL` / `BETTER_AUTH_URL` are HTTPS origins.

## Release command

On the staging host:

```bash
bun run staging:deploy -- --ref <git-sha-or-ref> --env-file .env.staging --project-name neuronexus-staging
```

What it does:

- resolves the target ref to a git SHA;
- creates a git worktree under `.staging/worktrees/<sha>`;
- starts the compose `postgres` service for the fixed project name;
- takes a pre-migration custom-format DB dump into `.staging/backups/`;
- runs the committed Drizzle migrations for that release;
- deploys `api` and `web` from that release worktree;
- waits for `/health` and `/auth/sign-in`;
- records the current and previous release in `.staging/state.json`.

## Rollback command

Application-only rollback:

```bash
bun run staging:rollback -- --env-file .env.staging --project-name neuronexus-staging
```

Application + DB rollback:

```bash
bun run staging:rollback -- --env-file .env.staging --project-name neuronexus-staging --restore-db
```

What rollback does:

- stops `api` and `web`;
- redeploys the previous worktree under the same compose project;
- optionally restores the pre-release DB dump saved by `staging:deploy`;
- waits for the same API and web readiness URLs before finishing.

## Migration and rollback contract

Drizzle migrations in this repo are forward-first. That means:

- Safe default rollback is application-only.
- `--restore-db` is for staging incidents where the candidate changed schema or data compatibility and the pre-release dump is required.
- If a migration is intentionally destructive or non-backward-compatible, note that in the PR and run staging deploys with `rollback_db_on_failure=true`.

The DB restore path assumes the application owns the staging schema in `public`. If staging ever hosts shared schemas or privileged extensions outside that boundary, the restore procedure must be revised before relying on `--restore-db`.

## Smoke gate

[scripts/smoke-learner.ts](/Users/mihailanonov/.paperclip/instances/default/projects/710f14e7-5bf7-41f4-aa08-a0624f6e1a2e/6df50f70-fd90-41de-9fc3-287dd334db63/neuronexus/scripts/smoke-learner.ts) now supports two modes:

- local mode: no `SMOKE_*_BASE_URL` env vars, starts local api/web if they are not already running;
- staging mode: set `SMOKE_API_BASE_URL` and `SMOKE_WEB_BASE_URL`, and it exercises the remote staging environment without starting local services.

The workflow uses staging mode after deployment.

For reliable auth coverage, point the smoke gate at the HTTPS staging URLs, not
plain HTTP tunnel or localhost ports.
