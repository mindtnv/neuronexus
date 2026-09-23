# Proposal

## Why

Processing and generation currently expose their progress inside Library and individual Studio panels; leaving those views removes the observation point. Users need one dependable place to find running work, open its result and recover a failure without interpreting ingestion enums.

## What Changes

- Add a compact account-wide Operations surface available from every authenticated section on desktop and mobile, with active work and recent results restored from the server after reload.
- Cover source ingestion/reingestion, including parsing and search preparation, and source/notebook study-artifact generation, including quizzes and regeneration.
- Separate reading availability from search availability: show “Можно читать; поиск ещё готовится”, distinguish unavailable search from active processing, and report genuine measured progress only.
- Open completed work through existing contextual navigation; retry eligible failed work explicitly and safely, including after an ambiguous network response.
- Keep last known rows usable during connection failures, isolate accounts, and prevent duplicate polling and duplicate completion announcements.

## Capabilities

### New Capabilities

- `operation-center`: durable discovery, human-readable status, safe result navigation and explicit retry for long-running source and study-artifact work.

### Modified Capabilities

None. Existing source-study resilience, navigation continuity and assistant confirmation requirements remain in force; the center consumes them.

## Impact

Web shell, Library, notebook/source Studio panels, status hooks, source/artifact domain services and workers, shared API types, and additive database migrations for run identity and lifecycle timestamps. New owner-scoped read/retry API; existing endpoints remain compatible.

Non-goals: an inbox for all events, push/email notifications, a new queue service, cancellation/pause controls, full historical audit, offline job execution, automatic retry, global card reindex tracking, request-bound notebook overview generation, chat-stream tracking, or a new home-page continuation dashboard. Local file upload transfer remains a distinct browser operation; the durable guarantee starts when the server accepts processing. Navigation and source/card linking are reused rather than redesigned. Production deployment is not part of planning.
