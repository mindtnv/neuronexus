# Tasks

## 1. Durable source operation slice

- [x] 1.1 Add failing API/worker tests for accepted source processing, readable indexing, parked embeddings, true completion timestamps and stale-run writes; verify failures target the missing contract.
- [x] 1.2 Add run columns and indexes through a committed migration, wire source acceptance/transitions/reconciliation, and implement the source projection; verify 1.1 passes against the committed migration chain, including legacy start paths.
- [x] 1.3 Add failing web tests for route-independent status and reload, then mount the account-keyed observer and minimal shell list; verify navigation, one in-flight request and stale-connection rendering.

## 2. Artifacts and actionable results

- [x] 2.1 Add failing integration tests for source/notebook artifacts, regeneration identities, interrupted startup recovery, retained quizzes and foreign owners; verify they distinguish supported job families.
- [x] 2.2 Wire artifact run lifecycle, persisted generation options and aggregate feed pagination/counts; verify 2.1 plus preserved quiz settings, disclosed legacy defaults, equal-time boundaries, seven-day cutoff, active work older than seven days and metadata edits that do not refresh completion recency.
- [ ] 2.3 Add failing deep-link tests, then connect exact source/artifact/quiz destinations through normal navigation; verify guarded departure, labelled return, retained work and deleted-result fallback.

## 3. Safe explicit retry

- [ ] 3.1 Add failing retry tests for concurrent clicks, lost response, canonical argument mismatch, stale run, missing source, AI unavailability and cooldown; verify no fixture relies on test-mode cooldown bypass for the cooldown contract.
- [ ] 3.2 Add receipt schema/migration and versioned retry adapters using existing domain locks and after-commit enqueue; verify 3.1, legacy-route races and commit-before-enqueue restart recovery without duplicate work.
- [ ] 3.3 Add client retry/reconciliation states and eligibility messaging; verify error persistence, disabled repeated submission, no automatic replay, and no unsafe legacy endpoint fallback.

## 4. Shared presentation and accessibility

- [ ] 4.1 Add failing status-presentation tests, then reuse capability-based copy in Operations, Library and Studio; verify PDF-original availability, text readability, index failure, disabled embeddings and real versus indeterminate progress in both locales.
- [ ] 4.2 Replace overlapping status loops with shared observation/invalidation; verify focus/wake refresh, idle discovery, hidden-tab suspension, backoff and account changes including late responses.
- [ ] 4.3 Implement desktop popover/mobile sheet and top-layer dismissal adapter; verify keyboard access, reduced motion, small viewport, focus restoration and one completion announcement per observed run.

## 5. Acceptance and release readiness

- [ ] 5.1 Record desktop and mobile browser evidence for upload acceptance → leave → ready → open → return; repeat with failure/retry, offline observation, reload, another same-owner session, dirty editor, nested layers and Back/Forward.
- [ ] 5.2 Exercise representative large job datasets, verify indexed query plans, accurate active counts and complete bounded pagination, and record observations in acceptance.md.
- [ ] 5.3 Document API-first rollout, old-API degradation and rollback; update CLAUDE.md then mirror AGENTS.md, verifying the bodies match apart from headers.
- [ ] 5.4 After the final edit run strict OpenSpec validation, typecheck, committed test migrations, test:ci, build and real-S3 test:s3:ci with disposable PostgreSQL/MinIO; record fresh results and unresolved limitations before archive.
