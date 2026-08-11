## Context

See `proposal.md` for motivation and the two capability specs for observable behavior.

The API already has a Pino root logger and creates a child logger in `onRequest`, but it stores that child by mutating Elysia application state. Application state is shared, so concurrent requests can overwrite one another's logger. There is also no completion hook despite the comment claiming one exists. AI streaming paths already accept an explicit logger, while many CRUD handlers and helper functions still call the root logger directly.

Background source and artifact jobs persist domain status in PostgreSQL. Card embeddings are explicitly derived/disposable and are reconciled from cards on startup, so a new durable job table would add operational ownership without becoming a real source of truth. The production image writes stdout/stderr for the container platform to collect; no external observability vendor is selected.

## Goals / Non-Goals

**Goals:**

- Make request correlation concurrency-safe and present on all request-bound signals.
- Emit a stable low-cardinality completion event that can drive logs, latency analysis, and error-rate alerts downstream.
- Ensure every logged error/URL/provider detail passes a bounded privacy-safe boundary.
- Give operators one cheap JSON readiness view of core availability and worker pressure/degradation.
- Make graceful shutdown fit a documented container grace period using one shared deadline.
- Make fatal process failures visible without bypassing the same idempotent shutdown deadline.
- Keep the implementation small, testable, and compatible with Bun/Elysia/Coolify.

**Non-Goals:**

- Persisting duplicate telemetry in PostgreSQL or adding a generic runtime-events table.
- Selecting/provisioning a log vendor, dashboard, alert policy, or OpenTelemetry collector.
- Probing optional external providers on every health request.
- Logging user content for debugging.

## Decisions

### 1. Use request-scoped Elysia derivation, not mutable application state

Create a small global request-context plugin that derives `{ log, requestId, requestStartedAt }` per request, sets the response header, and emits `http.request.completed` from `onAfterResponse`. The child logger binds `requestId`, method, and a normalized path once. Handlers that emit domain events destructure `log`; helpers accept a logger or a small correlation object when work crosses the handler boundary.

The normalized path removes query/fragment/user-info and replaces UUID/numeric path segments with stable placeholders. The completion event records the final numeric status and elapsed monotonic time, and never inspects request/response bodies.

Alternatives considered:

- Keep mutating `store.log`: rejected because Elysia state is shared across concurrent requests.
- `AsyncLocalStorage`: rejected for now because explicit Elysia request context is easier to test and avoids relying on async-context propagation through every Bun/stream boundary.
- Middleware that logs before the handler: rejected because it cannot know final status/duration and produces start noise without an outcome.

### 2. Pass correlation into detached work, keep startup work root-scoped

Request-triggered indexing/ingest/artifact enqueue functions accept optional safe correlation metadata and carry it in their in-memory queue entry. Worker logs create a child from that metadata. Deduplication keeps the newest causal metadata for pending work; startup reconciliation has no originating request and correctly uses the root logger with a worker/component field.

Synchronous domain handlers use the request logger instead of `rootLogger`. Background jobs do not retain request objects or bodies.

Alternative considered: force every background event to have a synthetic request ID. Rejected because it would imply a causal request that does not exist; worker/job fields are the correct correlation for startup work.

### 3. Centralize the privacy boundary in logger helpers

Add pure helpers for:

- bounded error serialization (`name`, safe/capped `message`, optional machine `code`);
- bounded upstream error extraction that selects only safe code/type/message fields and never logs an arbitrary full body;
- safe URL rendering with user-info, query, and fragment removed plus path identifier normalization;
- route/path normalization shared by completion logs and URL logs.

Expand Pino redaction for the known structured secret field names, but do not rely on redaction to clean strings. Validation logging records only a machine category/count/path schema location; it does not stringify the submitted value. Provider call sites migrate from raw `detail`/URL/error objects to the helpers.

Alternative considered: recursively serialize arbitrary objects and redact by key. Rejected because arbitrary provider/request objects can be huge, cyclic, content-bearing, or use unexpected secret names. Allow-listed summaries are safer.

### 4. Preserve request IDs in a typed web error

Introduce an `ApiError` carrying `status`, `requestId`, and a bounded safe message. The Eden `ok()` helper reads the response header when present; raw-fetch/chat helpers use the same response-to-error constructor. Unexpected user-visible failures append a short request-reference suffix automatically, so existing toast call sites gain correlation without duplicating header parsing. Expected control-flow outcomes such as aborts and cooldowns keep their existing specialized UX.

Alternative considered: add request-ID handling individually to each component. Rejected because the surface is broad and would drift immediately.

### 5. Add `/ready` as a safe aggregate; keep `/health` compatible

`/health` remains the existing PostgreSQL-backed compatibility endpoint. A new `/ready` endpoint composes:

- PostgreSQL ping;
- process lifecycle state (`running` or `shutting_down`);
- snapshots for card indexing, source ingest, and artifact generation;
- safe embedding degradation state.

Each worker owns a tiny tracker with aggregate queued/active counts and an optional `{ code, at }` last failure. Source/artifact domain failures continue to persist on their existing rows; card-index failure is an in-memory signal because the missing/stale derived chunk is rediscovered by startup reconciliation. Busy workers remain ready; recoverable failures produce HTTP 200 `degraded`; database failure or shutdown produces HTTP 503 `not_ready`. No IDs, titles, content, model endpoints, keys, or provider response text leave the endpoint.

Optional provider health is not actively probed: an AI/S3 outage must not make deck/review/auth traffic unready, and frequent probes would add cost and failure coupling.

Alternative considered: replace `/health` semantics. Rejected to preserve existing deployment and client expectations.

### 6. Use one shared shutdown deadline and concurrent drains

Extract an injectable shutdown coordinator. On the first signal it:

1. marks runtime state `shutting_down` so readiness fails;
2. stops the HTTP listener from accepting new requests;
3. starts index/source/artifact drains concurrently;
4. bounds all remaining work, including database close, by a single deadline derived from `SHUTDOWN_TIMEOUT_MS`;
5. logs one final structured outcome with per-component `drained | failed | timed_out` status and aggregate snapshots.

The default application deadline will be shorter than the documented container grace period (target: 8 seconds inside a 10-second stop grace). Timeout is a controlled degraded exit; startup reconciliation repairs unfinished derived/resumable work.

SIGTERM, SIGINT, `uncaughtException`, and `unhandledRejection` call the same memoized coordinator. Fatal handlers emit a bounded `process.fatal` event first and request a non-zero final exit code; they never stringify an arbitrary rejection object. Later causes may be logged as already-shutting-down metadata, but they cannot start a second drain. The coordinator remains injectable so tests can dispatch causes without terminating the test runner.

Alternatives considered:

- Retain sequential four-second drains: rejected because two queues can consume more than the advertised total grace.
- Wait without a deadline: rejected because container platforms will kill the process without a final outcome signal.
- Keep Bun's implicit fatal-event behavior: rejected because output shape, redaction, drain behavior, and exit timing would be uncontrolled.

### 7. Treat stdout and readiness as vendor-neutral collection contracts

Production keeps one-line JSON stdout. Documentation defines stable event names/fields, recommended filters (`level`, `requestId`, `path`, `status`, `durationMs`, worker), the `/ready` schema, and which signals should alert. Coolify or a future collector owns retention, dashboards, and delivery. No new telemetry dependency is required for this change.

## Risks / Trade-offs

- [One completion log per health/request increases volume] → Keep one event only, normalize paths, omit bodies, and let the external collector sample or exclude health events if needed.
- [Explicit logger plumbing touches many handlers] → Change only handlers that currently emit logs, add compile-time typing, and keep root logging valid for startup/background paths.
- [In-memory worker last failure disappears on restart] → Source/artifact terminal states already persist; card-index work is derived and startup reconciliation is the durable recovery mechanism.
- [A public readiness endpoint exposes operational counts] → Return only small aggregate counts/codes, never IDs/content/configured endpoints; keep the schema test-pinned.
- [Stopping the listener before drains can affect in-flight requests] → Use Elysia's graceful stop semantics and test the coordinator with injected operations; do not call `process.exit` until the shared deadline path finishes.
- [Provider error messages can still contain unexpected content] → Allow-list/cap and redact token-like patterns; prefer machine code/type over raw message whenever available.

## Migration Plan

1. Ship logger helpers and request-context lifecycle with tests while preserving existing event names.
2. Migrate request-bound log call sites and web errors to correlation-aware paths.
3. Add worker trackers and `/ready`; keep `/health` unchanged during rollout.
4. Deploy with `SHUTDOWN_TIMEOUT_MS=8000` and a container stop grace of at least 10 seconds.
5. Verify production JSON, request-ID support flow, `/health`, `/ready`, worker degradation, a controlled SIGTERM, and injected fatal causes in the test environment.
6. Configure the chosen Coolify log drain/collector later against the documented contract without application changes.

Rollback is code-only: revert the lifecycle/status changes and point the container healthcheck back to the unchanged `/health`. No schema rollback or data migration is required.
