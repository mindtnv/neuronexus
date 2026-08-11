## Purpose

Provide privacy-safe, end-to-end diagnostic signals for every NeuroNexus API request so operators and users can correlate failures without logging private study content.

## ADDED Requirements

### Requirement: Every API request has one completion signal
The API SHALL emit exactly one structured completion event after each HTTP response finishes. The event SHALL contain the request ID, method, normalized route or path without a query string, final HTTP status, and non-negative duration in milliseconds; it MUST NOT contain request bodies, response bodies, prompts, card contents, document contents, cookies, or credentials.

#### Scenario: Successful production request
- **WHEN** an API request completes with a successful response
- **THEN** the production JSON stream contains one completion event with its request ID, method, normalized path, status, and duration

#### Scenario: Failed production request
- **WHEN** an API request completes with a validation, authentication, client, or server error
- **THEN** the production JSON stream still contains exactly one completion event with the final status and the same request ID returned to the client

#### Scenario: URL contains sensitive or high-cardinality data
- **WHEN** a request URL contains query parameters, a fragment, UUID identifiers, or numeric identifiers
- **THEN** the completion event omits the query and fragment and normalizes identifier-bearing path segments

### Requirement: Request correlation is preserved end to end
The API SHALL honor a non-empty bounded upstream `x-request-id` or generate a UUIDv7 request ID, return it in the `x-request-id` response header, and bind it to request-triggered domain and AI log events. The web client SHALL preserve the response request ID on typed failures and include it in diagnostics shown for unexpected request failures.

#### Scenario: Upstream request ID is supplied
- **WHEN** the reverse proxy supplies an acceptable `x-request-id`
- **THEN** the API response, completion event, and request-scoped application events use that exact value

#### Scenario: Request ID is absent or invalid
- **WHEN** no acceptable upstream request ID is supplied
- **THEN** the API generates a UUIDv7 value and uses it consistently for the response and all request-scoped events

#### Scenario: Browser receives an API failure
- **WHEN** the web client receives a non-success API response with `x-request-id`
- **THEN** its typed error retains the HTTP status and request ID and the unexpected-error diagnostic exposes that request ID for support correlation

### Requirement: Logged failures are bounded and secret-safe
The system SHALL serialize validation failures, exceptions, upstream error responses, and URLs through bounded privacy-safe representations. Secret-bearing fields and URL query/user-info data MUST be removed or censored before emission, and logging failure MUST NOT change the application response.

#### Scenario: Provider returns a verbose error body
- **WHEN** an AI, search, fetch, or storage provider returns an arbitrarily large or structured error response
- **THEN** the log records a bounded status/code/message summary without credentials, request content, or the full response body

#### Scenario: Validation fails on a secret field
- **WHEN** validation rejects a password, token, cookie, authorization value, prompt, or user-content field
- **THEN** the log identifies the validation failure without recording the rejected value or complete submitted payload

#### Scenario: Failed tool URL contains credentials
- **WHEN** a URL-bearing operation fails for a URL containing user-info or query parameters
- **THEN** the logged URL contains only a safe origin/path representation with identifiers normalized and no secret-bearing components

### Requirement: The logging contract is regression-tested
Automated tests SHALL verify production JSON fields, request completion cardinality, correlation, secret redaction, bounded error summaries, safe URLs, and web request-ID propagation.

#### Scenario: Repository verification runs
- **WHEN** the project test suite executes
- **THEN** it fails if the structured logging or request-correlation contract regresses
