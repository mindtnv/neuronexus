## Purpose

Ensure automated verification proves that the committed database migration chain can build the schema required by the application.

## ADDED Requirements

### Requirement: CI tests the migrated schema without schema push
Every migration-gated CI workflow SHALL apply the committed migration chain to its test database and SHALL run the full test suite without invoking a schema-push command afterward.

#### Scenario: Pull-request verification
- **WHEN** the pull-request workflow reaches its database test gate
- **THEN** it applies committed migrations and executes the full suite through a command that has no `db:push` lifecycle hook

#### Scenario: Main-branch verification
- **WHEN** the main-branch deployment workflow reaches its database test gate
- **THEN** it applies committed migrations and executes the same migration-faithful test command before deployment can proceed

### Requirement: Local tests remain convenient
The default local full-test command SHALL continue to synchronize the disposable test database from the current Drizzle schema before executing tests.

#### Scenario: Developer runs the default test command
- **WHEN** a developer runs the documented local full-test command
- **THEN** the test database schema is pushed before the test runner starts

### Requirement: OpenSpec artifacts are validated in CI
Pull-request and main-branch CI SHALL reject invalid OpenSpec changes or specifications.

#### Scenario: Invalid change artifact is committed
- **WHEN** an OpenSpec artifact fails repository-wide validation
- **THEN** the CI test gate fails before deployment
