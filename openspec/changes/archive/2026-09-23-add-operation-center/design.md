# Design

## Context

`use-source-status.ts` polls mounted source lists; `use-artifact-status.ts` polls mounted Studio lists. Both stop on unmount. `app-shell.tsx` already owns the assistant and toast host across route changes. Source rows and `notebook_artifacts` are already durable jobs, but their `updatedAt` is not a reliable run start/completion timestamp; artifacts reuse their identity on regeneration. `study-artifacts.ts` already serializes owner-level generation admission. Source embedding can park while readable. See proposal.md for the product motivation.

`navigation-context-continuity` and `source-study-workspace` supply result navigation, ownership and retained-work contracts. The open `complete-spaced-repetition-polish` change owns card/review recovery; this change does not duplicate it.

## Goals / Non-Goals

**Goals:** a server-backed projection of existing jobs; one account-keyed web observer; truthful capability status; safe explicit retries.

**Non-Goals:** a second queue, duplicating generated content, a universal event log, durable browser upload transfers, or treating the navigation journal as job storage. Initial scope is the two persisted job families in the proposal, not every request taking a long time.

## Decisions

### 1. Retain existing domain jobs and add current-run metadata

Add nullable `operationRunId`, `operationStartedAt`, `operationFinishedAt` to sources and artifacts. Accepted new work allocates a UUIDv7 run in the domain transaction. Existing start routes, reingest/regenerate routes, startup reconciliation and worker transitions all participate. Terminal transitions record completion separately from metadata edits. Worker progress/completion uses a captured run identity and conditional writes so a previous run cannot overwrite its replacement. Source parsing plus search preparation is one run; parked/degraded search has a non-active presentation even if the underlying compatibility enum remains `indexing`.

The feed projects the latest run per extant object, rather than retaining every generation attempt. Seven-day recent history is based on the run's terminal time, not title edits or reading progress. Active work has no age cutoff. On recovery, source work retains its run if resumed; interrupted artifact work terminalizes that run through existing reconciliation. A transition from parked to active clears its terminal timestamp without pretending a new user request occurred.

Persist bounded artifact generation options, notably quiz question count, alongside the run: current creation passes this value only to scheduling, so a blind call to existing regenerate cannot promise the same settings. New retries reuse stored options and source scope. Preexisting jobs with missing options disclose the effective defaults before Retry; do not fabricate their original choices.

Alternative: a generic operation event table. Rejected because existing domain rows already own lifecycle and output; a second authoritative lifecycle would create drift. Nullable columns allow a compatible rollout; preexisting terminal objects are not invented as newly completed work. Existing active rows are assigned run metadata at compatible startup with an unknown elapsed-time label instead of a fabricated start time.

### 2. Add a lightweight account-scoped projection API

`GET /operations/v1` returns separate active and recent groups, accurate counts, opaque per-group cursors, `serverTime` and typed rows. Page size 20, hard maximum 50. Active ordering is stable by run start and ID; recent ordering is terminal time descending with kind/ID tie-breakers. Waiting entries are a non-active group with the same pagination bound and seven-day recency policy; a persistent source-level availability explanation remains after the feed window. Cursors encode a stable group/sort tuple and are validated. No N+1 fetch of every notebook and no full library scan on the client.

Rows include kind, entity ID, run ID, bounded label, owner context, phase, reading/search capabilities, measured progress, timestamps, retry eligibility/reason and a typed destination. Query only owned rows, including retained source artifacts. Domain entities remain authoritative at action time. Serialize allowed failure codes, never raw exceptions or provider payloads. Add user/run-time indexes to both job tables, including active-state partial indexes where query plans justify them; validate representative query plans with many historical rows.

### 3. Retry is conditional and receipt-backed

`POST /operations/v1/retry` takes kind, object ID, observed run ID and a client UUIDv7 request ID. It dispatches only to the two allow-listed domain adapters. A small `operation_retry_receipts` table uniquely binds `(userId, requestId)` to canonical request arguments and the resulting run ID. Receipt and replacement-run transition commit atomically under existing owner/entity locks; worker enqueue follows commit. A matching replay returns the receipt, changed arguments return 409, and a stale observed run returns current state without another paid job. Keep receipts for at least the seven-day retry window; an expired receipt still cannot restart a replaced observed run. Retry requires a failed run; it cannot regenerate a ready result. Preserve source snapshots and existing quiz-attempt semantics.

This endpoint's versioned path prevents older APIs silently ignoring run preconditions. Legacy start routes remain compatible but must also advance run identity, making their effects visible to stale-retry checks. Existing admission/cooldown and AI/readability checks remain in the domain services. No MCP or assistant confirmation bypass is introduced.

### 4. One shell observer per authenticated account

Mount an owner-keyed Operations provider next to existing shell controllers. Fetch on mount, focus/visibility restoration and operation acceptance; poll every 2.5 seconds while active, and every 30 seconds when idle and visible to discover work started elsewhere. Allow one in-flight feed request, abort/invalidate on account changes, stop timers while hidden and back off failures up to 30 seconds. A visible pending operation refreshes regardless of whether AI is configured. Existing screen hooks consume shared status/invalidation when mounted, retaining full-detail fetches where needed; do not run two status loops for the same rows.

Keep last successful rows on network failure with a stale indicator. The server response wins over optimistic feedback. Deduplicate by kind/object/run, and suppress outdated request sequences. Session-only announcement memory prevents repeat toasts on opening the list; historical ready rows do not announce themselves on initial hydration. Browser storage is optional and never required for the job list.

### 5. Compact, consistently reachable UI

Use a labelled Operations control in expanded sidebar/compact rail and an always-reachable mobile shell action. Show the active count; do not use an unread badge that implies a new inbox. Desktop opens a compact popover; mobile opens a sheet respecting visual viewport and safe areas. Sections: “В работе”, “Требует внимания” (waiting/failure), “Недавние”. Render long titles safely with accessible full labels. Closing leaves all work running.

Example rows: “Книга · Подготавливаем текст”; “Книга · Можно читать; поиск ещё готовится — Читать”; “Книга · Можно читать; поиск сейчас недоступен — Читать”; “Тест готов — Открыть”; “Не удалось создать тест — Повторить”. Indeterminate generation gets stage text, not a guessed percentage. Use the shared readability predicates and actual file availability rather than a single ready/error switch. Translation keys cover Russian and English.

Open uses typed destinations and `AppNavigationProvider`: normal unsaved guards, exact artifact/quiz identity, origin return and retained-work fallback. Do not store feed rows in the navigation journal. The sibling `make-small-actions-recoverable` change can provide the shared dismissal primitive; if Operations ships first, implement only the compatible top-layer adapter required here, then reuse it. No duplicate global Escape listener or history monkey patch.

## Risks / Trade-offs

- [A row's lifecycle and run metadata diverge] → centralize transition writes and test legacy entry points, worker failure, parking, shutdown and startup reconciliation together.
- [Retry commits before process exit but enqueue is lost] → existing durable-job reconciliation owns recovery; test this boundary and never infer completion from the receipt.
- [High operation volume] → owner/time indexes, bounded pagination, one observer, visibility suspension and measured query plans.
- [Mobile Back conflicts with entry restoration] → integrate with the existing pre-hydration history bridge and verify repeated Back/Forward, dirty guards and nested portals in real browsers.
- [Old terminal runs lack timestamps] → no fabricated history or migration-time completion announcements; new runs provide reliable recency.

## Migration Plan

1. Generate and commit additive nullable run columns, bounded artifact generation options, retry receipts and supporting indexes. UUIDv7 defaults/server IDs follow repository policy. Apply the committed chain to a fresh test DB before migration-faithful tests.
2. Deploy compatible API/worker code before web; reconcile preexisting active rows before exposing them as tracked work. Exercise source parking, artifact interruption and legacy start routes.
3. Release web after the versioned feed/retry routes are available. Missing routes show an unavailable center without breaking existing screens.
4. Prefer web-only rollback and retain columns/receipts. For an old API rollback, disable the center, drain compatible workers and treat run metadata as unavailable until compatible reconciliation resumes; do not claim valid retry/history semantics while old writers are active. Never drop domain content or receipt data as rollback.

Planning defaults to review: seven days of recent results, latest run per object, no dismissal/read synchronization and no push notifications. These are bounded product choices, not claims about existing behavior.
