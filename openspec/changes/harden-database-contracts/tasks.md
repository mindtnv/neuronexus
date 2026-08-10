## 1. OpenSpec Foundation

- [x] 1.1 Pin OpenSpec in the root workspace and initialize Codex and Claude integrations
- [x] 1.2 Define proposal, capability specs, and design for the pilot change
- [x] 1.3 Add repository scripts and CI steps for strict OpenSpec validation

## 2. Lossless Card Pagination

- [x] 2.1 Add an integration regression test with equal `created_at` values crossing a page boundary
- [x] 2.2 Implement stable `(created_at, id)` ordering, composite cursor emission, and legacy cursor parsing
- [x] 2.3 Extend the card list index and generate the committed migration

## 3. Migration-Faithful CI

- [x] 3.1 Add a failing repository-contract test for migration-gated workflow commands
- [x] 3.2 Add `test:ci` without a schema-push lifecycle hook and use it in pull-request and deploy workflows
- [x] 3.3 Verify the full suite against a database created only by committed migrations

## 4. Documentation and Verification

- [x] 4.1 Document OpenSpec, migration-faithful tests, and composite pagination in `CLAUDE.md`, then mirror to `AGENTS.md`
- [x] 4.2 Run strict OpenSpec validation, typecheck, full tests, build, audit, and repository consistency checks
