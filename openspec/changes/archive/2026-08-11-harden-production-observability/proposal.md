## Why

NeuroNexus already emits structured API and AI logs, but normal production requests are not logged at completion, many domain events lose their request correlation, and several error paths can write unsafe or unbounded upstream details. Runtime health also exposes only PostgreSQL reachability, leaving queue stalls, degraded indexing, and shutdown overruns difficult to diagnose from production signals.

## What Changes

- Emit one structured completion event for every API request with request ID, method, normalized path, status, and duration, while avoiding request or response bodies.
- Carry the request-scoped logger through domain and AI operations so related events share the same request ID; propagate the response request ID into typed web errors and user-visible failure diagnostics.
- Centralize safe error, URL, and upstream-response serialization with bounded output and broader secret redaction; remove raw validation payloads and query-string credentials from logs.
- Expose a cheap readiness/status surface for PostgreSQL and in-process background workers, including queue depth, active work, degraded embedding state, and the last bounded worker failure.
- Make shutdown use one total deadline instead of sequential per-queue budgets, and log the final drain outcome before exit.
- Route uncaught exceptions and unhandled promise rejections through a bounded fatal-event logger and the same idempotent shutdown coordinator.
- Add focused tests for production JSON shape, redaction, request completion/correlation, web request-ID propagation, readiness degradation, worker snapshots, and shutdown budgeting.
- Document the stdout JSON contract and the deployment boundary for forwarding logs and scraping status in Coolify or another external collector.

Non-goals:

- Provisioning or purchasing a specific external log/metrics vendor, alerting account, or dashboard.
- Logging prompts, card contents, document contents, request bodies, response bodies, cookies, or credentials.
- Introducing full distributed tracing or a large OpenTelemetry stack before the structured signal contract is stable.
- Turning optional AI, web-search, or S3 outages into whole-application liveness failures.

## Capabilities

### New Capabilities

- `request-observability`: Production requests and related application events are safely structured, correlated end to end, and expose a user-supportable request ID without logging private content.
- `runtime-readiness`: Operators can inspect dependency and background-worker state, and shutdown respects one explicit deadline with observable drain outcomes.

### Modified Capabilities

None; this repository has no archived OpenSpec capabilities yet.

## Impact

- API lifecycle, process-failure handling, and logger helpers under `apps/api/src/`, including AI/index/source/artifact workers.
- Web API error handling and user-visible error diagnostics under `apps/web/src/`.
- API and shared/web tests for logging, readiness, correlation, and shutdown behavior.
- Docker/Coolify health configuration, `.env.example`, and agent/runbook documentation.
- No database migration is expected: durable source/artifact failures remain in their existing rows, while the disposable card index exposes bounded runtime state and is reconciled from PostgreSQL on startup.
