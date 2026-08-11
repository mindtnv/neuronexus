## 1. Privacy-safe logging boundary

- [x] 1.1 Add failing unit tests for production JSON shape, route/path normalization, safe URL rendering, bounded exception and upstream-error summaries, token-like value censoring, and validation logs that omit submitted values.
- [x] 1.2 Implement pure logger safety helpers and expand structured Pino redaction without recursively serializing arbitrary payloads.
- [x] 1.3 Migrate validation, AI provider, web-search, page-fetch, storage, and other raw error/URL call sites to the safety helpers, then make the new focused tests pass.

## 2. Request lifecycle and correlation

- [x] 2.1 Add failing API tests for exactly one completion event on success and failure, final status/duration fields, bounded upstream request-ID acceptance, UUIDv7 fallback, normalized paths, and isolation across concurrent requests.
- [x] 2.2 Replace the shared mutable Elysia logger state with a derived per-request context that sets `x-request-id` and emits `http.request.completed` after the response.
- [x] 2.3 Migrate request-triggered domain and AI log events from the root logger to the request logger while keeping startup-only work explicitly root-scoped.
- [x] 2.4 Add failing tests for correlation metadata crossing enqueue boundaries, then carry only safe request metadata through index, source-ingest, and artifact queue entries and worker child loggers.

## 3. Browser failure correlation

- [x] 3.1 Add failing web tests for extracting status and `x-request-id` from Eden and raw-fetch failures, bounding upstream messages, and preserving specialized abort/cooldown behavior.
- [x] 3.2 Introduce a shared typed `ApiError`/response-error constructor and migrate API, auth, chat stream/resume/regenerate, and other raw-fetch helpers to it.
- [x] 3.3 Centralize unexpected-error presentation so user-visible diagnostics include a short request reference when available, without exposing it for expected control-flow outcomes.

## 4. Worker snapshots and readiness

- [x] 4.1 Add failing unit tests for worker trackers covering idle, queued, active, recovered, and bounded last-failure snapshots with no job/user/content identifiers.
- [x] 4.2 Implement aggregate runtime trackers for card indexing, source ingest, and artifact generation and update them on enqueue, start, success, retry exhaustion, terminal failure, and startup reconciliation.
- [x] 4.3 Add failing integration tests that preserve `/health` behavior and pin `/ready` responses for ready, busy, degraded, database-unavailable, and shutting-down states.
- [x] 4.4 Implement the read-only `/ready` aggregate with PostgreSQL latency, lifecycle state, worker snapshots, safe embedding degradation, HTTP 200 for recoverable degradation, and HTTP 503 only when work cannot be accepted.

## 5. Shared-deadline shutdown and fatal failures

- [x] 5.1 Add failing unit tests for concurrent drains sharing one deadline, remaining-budget database close, per-component `drained | failed | timed_out` outcomes, and idempotency under racing causes.
- [x] 5.2 Extract an injectable shutdown coordinator that marks readiness unavailable, stops the listener, drains all registered workers concurrently, closes PostgreSQL within the remaining budget, and emits start/final structured events.
- [x] 5.3 Add failing tests for bounded `uncaughtException` and arbitrary `unhandledRejection` reasons, duplicate causes, and non-zero fatal exit intent without terminating the test runner.
- [x] 5.4 Register SIGTERM, SIGINT, uncaught-exception, and unhandled-rejection handlers against the memoized coordinator and remove the sequential per-worker timeout flow.

## 6. Deployment and operations contract

- [x] 6.1 Add `SHUTDOWN_TIMEOUT_MS` validation/default documentation, set a container stop grace longer than the application deadline, and update deployment health/readiness configuration without changing `/health` compatibility.
- [x] 6.2 Document stable JSON event fields, privacy exclusions, `/ready` semantics, useful operator filters, expected fatal events, and the Coolify/external collector responsibility for forwarding, retention, dashboards, and alerts.
- [x] 6.3 Update `CLAUDE.md` with the final observability contract, mirror its body into `AGENTS.md` while preserving the Codex header, and verify both guides remain synchronized.

## 7. Fresh end-to-end verification

- [x] 7.1 Run focused API and web observability tests after the final implementation edit and resolve all failures.
- [x] 7.2 Run `bun run spec:validate`, `bun run typecheck`, `bun run test`, and `bun run build` from the repository root.
- [x] 7.3 Exercise `/health`, `/ready`, correlated browser/API failure diagnostics, production JSON output, and a controlled shutdown against the test deployment, recording any external collector setup that remains environment-specific.
