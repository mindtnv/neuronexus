# Implementation evidence — in progress

This is a partial implementation checkpoint, not release approval. Neither this change nor `make-small-actions-recoverable` is ready to archive or deploy yet.

## 2026-09-23 — source/artifact lifecycle and initial shell surface

- Branch: `codex/operations-and-recoverable-actions`, based on `619e7a9`.
- Added migration `0037_special_loners.sql`: current-run metadata, persisted generation options, retry receipts and owner/time indexes. Applied the complete migration chain to a newly created local `neuronexus_operations_test` database; no schema push used.
- Added server projection and receipt-backed explicit retries. Tests cover owner isolation, parked/readable sources, completion recency, equal-time pagination, old active jobs, stale worker responses, concurrent retry, lost-response replay, persisted quiz settings, legacy defaults, AI unavailability and injected cooldown rejection.
- Existing source create/reingest and artifact regenerate paths share the same run-aware services. Worker writes are conditional on captured run identity. A new test waits for the real embedding/generation seam before replacing the run, then verifies that the old response cannot mutate the replacement.
- Initial shell UI, owner-keyed observation, source/artifact destinations and capability-based source labels are present. DOM tests verify route-content changes, opening an exact retained quiz without a write, and account teardown. Observer tests verify request coalescing, stale data preservation and loaded-tail refresh.

### Commands and results

- `bun run db:migrate:apply:test`: passed on the isolated fresh database, including migration 0037.
- `bun run typecheck`: all five workspaces passed after the checkpoint edits.
- `bun run spec:validate`: 24 items passed; informational long-requirement notices only.
- Targeted integration/UI command below: **578 passed, 0 failed**, across 12 files. Many of these are dictionary parity assertions; this is not a claim that the full suite passed.

```sh
NODE_ENV=test bun --env-file=.env test \
  apps/api/tests/operations.test.ts \
  apps/api/tests/source-ingest.test.ts \
  apps/api/tests/notebook-artifacts.test.ts \
  apps/api/tests/source-delete-race.test.ts \
  apps/api/tests/source-reingest.test.ts \
  apps/api/tests/source-study-artifacts.test.ts \
  apps/web/src/lib/operation-observer.test.ts \
  apps/web/src/lib/source-operation-label.test.ts \
  apps/web/src/components/operations-center.test.tsx \
  apps/web/src/components/notebook/source-studio-panel.test.tsx \
  apps/web/src/components/screens/library-navigation.test.tsx \
  apps/web/src/lib/i18n-parity.test.ts
```

## Still required

- Complete the unchecked tasks, notably shared mobile Back/dismissal, deeper retry UI and guarded navigation tests, visibility/backoff verification, performance query plans and live browser acceptance.
- Bounded retry-receipt maintenance is now scheduled and drained with API shutdown (shared with UI-action receipts); retain this coverage in the final release gate.
- Finish `make-small-actions-recoverable`; written-note recovery, server action receipts/inverses and the recent-actions list are implemented in its current checkpoint. Remaining metadata/card-editor wiring and shared dismissal are still required.
- Recheck keyboard focus across run replacement, real mobile geometry and the source-artifact deep-link lifecycle in a browser. The current UI is not visually accepted.
- Update canonical agent documentation, run full migration-faithful tests/build/real S3 after final edits, sync/archive both specs and verify the actual production deployment.

Local `.env` is ignored and points only at the disposable task database. It is not a production configuration or a deliverable.
