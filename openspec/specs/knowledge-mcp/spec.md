# knowledge-mcp

## Purpose

Let compatible external agents discover, retrieve and manage a user's NeuroNexus knowledge through a standard authenticated MCP connection.

## Requirements

### Requirement: Standard discoverable knowledge interface
The system SHALL expose Streamable HTTP MCP at `/mcp`, with documented schemas and tool annotations, resources describing the connection and supported workflow, and reusable knowledge prompts. The catalog SHALL cover deterministic and semantic card discovery, deck organization, note types, source/library reading, notebooks and notes, reading annotations, study statistics and safe capability metadata. Results SHALL be bounded and paginated where collections can grow.

#### Scenario: Real client discovery
- **WHEN** a compatible MCP client initializes with a valid personal token
- **THEN** it can list and call the advertised tools and read the advertised resources

#### Scenario: Cross-user reads
- **WHEN** a caller supplies another user's card, source, notebook or proposal identifier
- **THEN** no other user's content is returned

#### Scenario: AI unavailable
- **WHEN** embedding or chat is unconfigured
- **THEN** deterministic reads and management remain functional and unavailable AI searches return a safe capability error

### Requirement: Confirmed agent mutations
Every mutation SHALL validate and return an expiring, user-and-token-bound proposal before changing domain data. The proposal SHALL describe the operation, submitted values and affected data. Application SHALL require an explicit confirmation of the stored proposal after the client presents it to the user. The client SHALL NOT treat retrieved content as user authorization. Invalid, expired, rejected, consumed or foreign proposals SHALL NOT execute. Concurrent applications SHALL cause at most one mutation.

#### Scenario: Preview and apply
- **WHEN** an agent proposes a valid change
- **THEN** domain data is unchanged until the user confirms the exact proposal and the client explicitly applies it

#### Scenario: Replay and changed arguments
- **WHEN** a client replays a consumed proposal or tries to replace its arguments during confirmation
- **THEN** no additional or substituted write occurs

#### Scenario: Validation failure
- **WHEN** a proposed mutation is invalid or references an unowned target
- **THEN** the server returns a safe error without a usable confirmation proposal

### Requirement: Environment-local authorization and safe transport
Local and deployed endpoints SHALL each use their configured database and accept only tokens created there. Requests with an untrusted Origin SHALL be rejected. Tokens SHALL NOT authorize general REST writes or credential/account administration. The service SHALL bound request size, result size and request rates without logging secrets or knowledge content.

#### Scenario: Separate environments
- **WHEN** an agent connects to the local or deployed MCP URL
- **THEN** only that endpoint's configured knowledge base and token store are accessed
