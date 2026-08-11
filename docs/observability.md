# Production observability

NeuroNexus exposes a vendor-neutral operations contract: the API writes one JSON object per line to stdout/stderr, serves liveness/readiness over HTTP, and drains within one bounded shutdown deadline. Coolify or another external collector is responsible for shipping, retention, dashboards, sampling, and alerts; the application does not persist duplicate telemetry in PostgreSQL.

## Structured log contract

Every production line includes Pino's `level`, `time`, `app`, and `msg` fields. Events with a stable machine identity additionally include `event`.

`http.request.completed` is emitted exactly once after every response with:

- `requestId`: accepted bounded upstream `x-request-id`, otherwise a generated UUIDv7;
- `method` and normalized `path` (no query/fragment; UUID and numeric segments become `:uuid`/`:id`);
- `status` and non-negative `durationMs`;
- `matchedRoute` when Elysia resolved one.

Request-triggered domain and worker logs carry the same `requestId`. Startup reconciliation is intentionally root-scoped because it has no causal request. The browser retains `status` and `requestId` in `ApiError`; unexpected 5xx diagnostics append `request: <id>`, while aborts, cooldowns, validation, and other expected control flow keep their specialized UX.

Stable lifecycle events are:

- `api.listening`;
- `api.shutdown.start` with `cause` and `timeoutMs`;
- `api.shutdown.completed` with `cause`, `exitCode`, and per-component `drained | failed | timed_out` outcomes;
- `process.fatal` with `cause` and a bounded safe error summary.

Useful collector filters include `event`, `level`, `requestId`, `method`, `path`, `status`, `durationMs`, `worker`, and `component`. Alert candidates are sustained HTTP 5xx rates, high completion latency, any `process.fatal`, shutdown timeouts/failures, `/ready` returning 503, and persistent worker degradation.

## Privacy boundary

Logs must never include request/response bodies, prompts, card or note contents, source/document text, passwords, cookies, authorization headers, API keys, provider credentials, URL user-info/query/fragment, or full upstream response bodies. Exceptions, provider responses, and URLs go through the bounded helpers in `apps/api/src/logger.ts`; do not attach arbitrary objects to log records. Worker/readiness snapshots expose aggregate counts and safe machine codes only—never job, user, source, card, or artifact identifiers.

## HTTP probes

`GET /health` is the compatibility liveness/database probe. It runs a PostgreSQL ping and returns HTTP 200 when the database is reachable or 503 with a safe `unavailable` error.

`GET /ready` is the container readiness probe. Its safe aggregate contains:

- `ok`, `status: ready | degraded | not_ready`, and `now`;
- PostgreSQL reachability and latency;
- process lifecycle (`running | shutting_down`);
- aggregate `queued`, `active`, `degraded`, and optional `{ code, at }` snapshots for index, source-ingest, and artifact workers;
- safe degradation codes, including embedding dimension degradation.

Busy workers and recoverable provider/worker degradation remain HTTP 200. An unavailable database or `shutting_down` lifecycle returns HTTP 503 because the instance cannot safely accept work. Optional AI, search, page-fetch, and S3 providers are not actively probed.

The API image uses `/ready` for its Docker healthcheck. `/health` remains available for compatibility and diagnostics.

## Shutdown and Coolify

`SHUTDOWN_TIMEOUT_MS` is a positive millisecond value and defaults to `8000`. SIGTERM, SIGINT, `uncaughtException`, and `unhandledRejection` all enter the same memoized coordinator. It marks readiness unavailable, stops the listener, drains the index/source/artifact workers concurrently, and closes PostgreSQL using the remaining portion of one absolute deadline. Fatal causes request a non-zero natural process exit without calling `process.exit()`.

The production Compose grace period is 10 seconds, longer than the 8-second application deadline. Configure the same values in Coolify, route the container's JSON stdout/stderr to the chosen collector, and set retention, dashboards, and delivery/alert policies there. Collector credentials and vendor-specific configuration stay outside this repository.
