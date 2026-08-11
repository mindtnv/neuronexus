## Purpose

Expose a cheap, privacy-safe view of service dependencies and background work, and make graceful shutdown complete within one observable operational deadline.

## ADDED Requirements

### Requirement: Liveness compatibility is preserved
`GET /health` SHALL retain its existing safe response contract and SHALL return a non-success status when PostgreSQL is unreachable. Optional AI, search, page-fetch, and storage capabilities MUST NOT by themselves make core liveness fail.

#### Scenario: PostgreSQL is reachable
- **WHEN** `GET /health` successfully completes its database round trip
- **THEN** it returns HTTP 200 with `ok: true`, database latency, and an `x-request-id`

#### Scenario: PostgreSQL is unreachable
- **WHEN** the database round trip fails
- **THEN** `GET /health` returns HTTP 503 with `ok: false`, a bounded safe database failure, and an `x-request-id`

#### Scenario: Optional provider is disabled or unavailable
- **WHEN** an optional AI, search, fetch, or storage capability is disabled or currently failing
- **THEN** core liveness remains determined by the API and PostgreSQL rather than that optional provider

### Requirement: Operators can inspect readiness and worker state
The API SHALL expose a cheap read-only readiness/status response containing PostgreSQL state, service shutdown state, and bounded snapshots of registered background workers. Worker snapshots SHALL include queue depth or pending work, active work, degraded state, and the timestamp/code of the last bounded failure when present; they MUST NOT expose secrets, user IDs, document/card contents, or job identifiers.

#### Scenario: Service is ready with idle workers
- **WHEN** PostgreSQL is reachable, shutdown has not started, and workers are idle without degradation
- **THEN** the readiness response reports a ready/healthy state and zero active or queued work

#### Scenario: Worker is busy
- **WHEN** indexing, source ingest, or artifact generation has queued or active work
- **THEN** the readiness response remains successful and reports bounded aggregate counts for that worker

#### Scenario: Recoverable subsystem is degraded
- **WHEN** embedding dimensions mismatch or a background worker records a recoverable terminal failure
- **THEN** the readiness response reports `degraded` with a safe code/timestamp while the core API remains available

#### Scenario: Service cannot accept work
- **WHEN** PostgreSQL is unreachable or graceful shutdown has started
- **THEN** readiness returns HTTP 503 and reports a non-ready state without leaking internal credentials or identifiers

### Requirement: Worker failure signals survive their execution path
Background source and artifact jobs SHALL continue to persist their terminal machine-readable status in PostgreSQL. The disposable card-index worker SHALL retain a bounded runtime last-failure signal and SHALL remain recoverable from PostgreSQL through startup reconciliation.

#### Scenario: Source or artifact job fails
- **WHEN** a source-ingest or artifact-generation job reaches a terminal failure
- **THEN** its existing PostgreSQL row records an error state/code and the worker snapshot records only a bounded aggregate failure signal

#### Scenario: Card-index batch exhausts retries
- **WHEN** a card-index batch exhausts its bounded retries
- **THEN** the runtime snapshot records a safe failure code/timestamp and a later startup reconciliation can rediscover the missing or stale derived index work

### Requirement: Graceful shutdown uses one total deadline
On SIGTERM or SIGINT, the API SHALL stop accepting new work, drain registered background workers concurrently within one configurable total deadline, close the database, and emit structured start and final outcome events. Sequential worker budgets MUST NOT extend the intended total grace period.

#### Scenario: Workers drain before the deadline
- **WHEN** all workers settle before the shared shutdown deadline
- **THEN** the API closes cleanly and logs a completed drain outcome with per-worker results

#### Scenario: One or more workers exceed the deadline
- **WHEN** a worker does not settle before the shared deadline
- **THEN** shutdown proceeds using the remaining budget, logs which aggregate worker state timed out, and does not wait for a second full timeout window

### Requirement: Fatal process failures are observable and bounded
The API SHALL register process-level handlers for uncaught exceptions and unhandled promise rejections. Each handler SHALL emit a structured fatal event using the same bounded secret-safe error representation and SHALL invoke the idempotent shared-deadline shutdown coordinator without logging arbitrary rejected objects or application content.

#### Scenario: An uncaught exception reaches the process boundary
- **WHEN** an uncaught exception occurs outside normal request handling
- **THEN** the API emits one safe fatal event, starts graceful shutdown once, and exits non-successfully after the shared shutdown path settles or times out

#### Scenario: A promise rejection reaches the process boundary
- **WHEN** an unhandled rejection reaches the process boundary with an error, object, or primitive reason
- **THEN** the API emits a bounded safe fatal event without serializing the arbitrary reason and starts the same idempotent shutdown path

#### Scenario: Multiple termination causes race
- **WHEN** a signal and one or more fatal process failures arrive while shutdown is already running
- **THEN** all callers observe the same shutdown attempt and the workers do not receive duplicate drain commands

### Requirement: Runtime signal operations are documented and tested
The repository SHALL document the JSON stdout contract, readiness endpoint, configurable shutdown budget, fatal-event behavior, and the external responsibility for log forwarding/retention/alerts. Automated tests SHALL cover ready, degraded, not-ready, busy-worker, fatal-event, and shared-deadline behavior.

#### Scenario: Operator configures a deployment
- **WHEN** an operator deploys NeuroNexus through Coolify or another container platform
- **THEN** the repository provides enough contract documentation to route JSON stdout and poll readiness without requiring a specific vendor

#### Scenario: Repository verification runs
- **WHEN** the project test suite executes
- **THEN** it fails if readiness semantics, worker snapshots, or shared shutdown budgeting regress
