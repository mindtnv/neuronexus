## 1. Personal credentials

- [x] 1.1 Add failing integration coverage for token creation, one-time disclosure, expiry, revocation, session-only management and user isolation.
- [x] 1.2 Implement token storage, committed migration, authorization and management API.

## 2. Knowledge MCP

- [x] 2.1 Add protocol tests for discovery, read-only authorization, scoped reads, malformed transport and missing AI configuration.
- [x] 2.2 Implement the official SDK transport, curated read catalog, resources and prompts.
- [x] 2.3 Add tests for preview-only writes, explicit confirmation, rejection, expiration, changed previews, cross-token isolation and concurrent replay.
- [x] 2.4 Implement durable transactional confirmations and broad domain management tools.

## 3. User setup

- [x] 3.1 Add token management, one-time copy, permission and expiry selection, revocation and per-environment client configuration to Settings.
- [x] 3.2 Document tool coverage, client setup, environment separation, approval workflow, deployment and rollback; update both agent guides.
- [x] 3.3 Add and run a real MCP SDK connection smoke check, then configure the local Codex connection against the local database.

## 4. Acceptance

- [x] 4.0 Apply compatible security patches found by the dependency audit and verify a clean audit.

- [x] 4.1 Run strict OpenSpec validation, typecheck, migration-faithful full tests, real S3 tests and production build after final edits.
- [x] 4.2 Verify local running state and production deployment/configuration readiness; report actual connectivity and any external prerequisite honestly.

- [ ] 4.3 Restore remote S3 CI by fetching the unchanged pinned MinIO images from the official Quay registry and verify both PR checks.
