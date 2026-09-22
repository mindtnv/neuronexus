# Contextual assistant deployment and rollback

This is an operator procedure. The implementation task does not deploy production. Keep the existing database, storage bucket, credentials, origins, image pinning, and single-API-instance deployment pattern.

## Before deployment

Complete the change's browser acceptance and run the release gates after the final implementation edit:

```sh
docker compose up -d postgres
docker compose up -d minio createbuckets
bun run spec:validate
bun run db:migrate:apply:test
bun run typecheck
bun run test:ci
bun run test:s3:ci
bun run build
```

Use a disposable test database and S3 bucket for destructive integration fixtures. Do not substitute `bun run test` or schema push for the migration-faithful test gate. Save a recoverable production database backup before deployment; do not overwrite current production data with an older backup to roll back application code.

The additive migration chain includes:

- `0031_assistant_context.sql`: conversation context protocol/revision, pinned context and message snapshots; notebook conversation links change to SET NULL.
- `0032_source_study_ownership.sql`: discriminated notebook/source study ownership, historical source origin and nullable live links.
- `0033_source_text_marks.sql`: rendered-text selection marks.
- `0034_card_evidence_snapshots.sql`: immutable per-card evidence snapshots.
- `0035_legacy_card_evidence.sql`: owner-scoped backfill for existing live source/chunk links, preserving already-populated snapshots.

For the first upgrade including migration 0035, pause card/provenance writes and drain/stop the old API before applying the backfill. Bring the compatible API up before allowing writes again; do not leave an old writer creating snapshot-less links after the data pass. This is a maintenance upgrade for those writes, not a promise of a zero-downtime rolling backfill.

Apply the committed chain with `bun run db:migrate:apply` (the production API entrypoint also applies it idempotently). Do not restore cascades or remove new columns/tables while detached histories or source-origin work exist. Existing object IDs, pending approvals, cards and FSRS history must remain intact.

## Roll forward

1. Deploy the compatible API and retain the schema. Allow existing requests to drain through the normal graceful shutdown path; do not kill half-applied writes.
2. Wait for `running:healthy` in the deployment platform and inspect `/ready`. Busy/degraded 200 is distinct from database-down/shutdown 503; investigate unexpected degradation before advancing.
3. In authenticated Swagger (`/docs`), inspect `/ai/status`. The API advertises assistant context version 1, object search, three concurrent turns and source-study support. Chat/embedding/search availability remains independently configured; the source-study flag does not promise that an AI provider is enabled.
4. Verify that the versioned `/chat/context-v1/conversations` routes are available, and that existing global/notebook histories and pending previews reopen under their original IDs.
5. Deploy the web with its existing build-time public API/media origins. Check a source-started conversation, cross-presentation continuation, an explicit approval, source notes/artifacts, and card backlinks. Use the acceptance checklist in the OpenSpec change for the full walkthrough.

The limiter is process-local. Do not scale to multiple independent API instances until per-user admission and per-conversation serialization use shared coordination. In-memory capability metadata does not provide such coordination.

## Preferred rollback: web only

Roll back the web first and leave the compatible API and schema running. The API keeps legacy request adapters. Older web builds may not expose typed context or retained source-owned study work, but the data remains stored. Preserve new context snapshots and source-origin rows for the next compatible web release.

## Full old-API rollback: maintenance only

An older API cannot enforce context-v1 policy or safely manage all source-owned work. It is not a supported live-write target for this database state. A cached capability response or an old web build does not make it safe.

1. Put **both web and API ingress** into maintenance before switching API images. Reject external product traffic with 503, including direct API clients and POST `/mcp`; blocking only browser buttons or only `/chat/context-v1` is insufficient. Keep health/readiness accessible only as needed for operational checks.
2. Stop new work, let current turns and index/source/artifact jobs finish, and inspect worker activity through `/ready`. Complete or cancel unfinished generation using the compatible application before switching. If jobs cannot be drained safely, retain maintenance and the compatible image; do not use an older binary as a cancellation mechanism.
3. Gracefully stop the compatible API. Keep the database and storage intact. Keep both application containers stopped behind maintenance if an old-image rollback is required before compatibility is restored. Do not bring an old API online against this data as a public read/write service; its startup workers also matter, not just HTTP route filtering.
4. Restore a compatible API and let it apply/reconcile the retained migration chain. Verify readiness, owner isolation, old and new histories, pending approvals and retained work, then deploy a compatible web build.
5. Remove maintenance only after those checks pass. Do not remove it merely because an old image starts successfully.

For deployments using selective ingress controls instead of full maintenance, a compatibility-capable API must remain responsible for the database and background workers. Block the affected chat create/PATCH/delete/stream/resume/regenerate routes under **both** `/chat/conversations` and `/chat/context-v1/conversations`, source-study and retained-work mutation routes, quick-card/harvest writes, library/source deletion and notebook mutations, and POST `/mcp` until compatibility is restored. An exhaustive route allow-list is deployment-specific; full maintenance is the documented default.

## Evidence

`openspec/changes/archive/2026-09-22-unify-contextual-assistant/acceptance.md` records actual checks and outstanding acceptance work. Targeted green tests are not proof of a completed production rollout. No deployment or rollback is reported complete until its live health and relevant behavior have been checked.

Artifact drain timeout aborts outstanding provider calls. Pending/generating rows interrupted by shutdown are reconciled to `error/interrupted` at the next compatible startup, where the user can explicitly retry. Completed artifacts and quiz attempts remain intact. Do not interpret a timed-out drain as proof that all requested artifacts finished successfully.
