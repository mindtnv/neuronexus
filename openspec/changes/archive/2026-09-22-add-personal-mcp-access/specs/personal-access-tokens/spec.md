## Purpose

Enable users to grant revocable, limited access to their own NeuroNexus knowledge base without sharing account passwords or browser sessions.

## ADDED Requirements

### Requirement: Session-managed personal tokens
The system SHALL let an authenticated user create, list and revoke personal tokens in Settings. Tokens SHALL have a name, read or read/write access, expiration no later than one year, and last-use metadata. The secret SHALL be displayed only when created, stored only as a digest, and excluded from logs and later list responses.

#### Scenario: Create and revoke
- **WHEN** a signed-in user creates a token and subsequently revokes it
- **THEN** creation returns the secret once and subsequent authenticated requests with that token fail

#### Scenario: Isolation and privilege escalation
- **WHEN** a different user or an MCP token attempts to manage the first user's tokens
- **THEN** the operation is denied and no token secrets or metadata are disclosed

### Requirement: Fail-closed token authentication
MCP SHALL require a valid, unexpired, unrevoked bearer token and derive ownership exclusively from that credential. Cookie sessions and tokens in URL parameters SHALL NOT authorize MCP. Read-only tokens SHALL NOT propose or apply mutations.

#### Scenario: Read-only access
- **WHEN** a read-only token requests tools or attempts a write by name
- **THEN** discovery exposes read tools only and direct mutation calls are rejected

#### Scenario: Optional AI configuration
- **WHEN** no AI provider is configured
- **THEN** token management and ordinary knowledge operations remain available
