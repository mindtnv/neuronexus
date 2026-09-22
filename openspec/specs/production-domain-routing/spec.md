# production-domain-routing

## Purpose

Give Reomi dedicated production addresses while preserving access to existing accounts, data, and integrations during the domain transition.

## Requirements

### Requirement: Canonical application and API origins
The production application SHALL be reachable at `https://app.reomi.ru` and use `https://api.reomi.ru` for API and authentication requests. Existing accounts and user-owned data MUST remain intact with unchanged authorization boundaries.

#### Scenario: Existing user visits the new origin
- **WHEN** an existing user signs in at `app.reomi.ru`
- **THEN** the API authenticates that user and returns only their existing authorized data
- **AND** the browser is not required to share a session cookie with the former domain

#### Scenario: Browser uses the new API
- **WHEN** the production application requests the API or uploads media
- **THEN** its security policy, API origin checks, and storage origin checks permit the intended request
- **AND** password-reset links target the new application origin

### Requirement: Legacy-address compatibility
The former web hostname SHALL redirect to the fixed canonical application origin while preserving paths and query strings. The former API hostname SHALL remain available as a compatibility alias, without redirecting API methods or weakening authentication.

#### Scenario: Existing deep link
- **WHEN** a user visits `https://neuronexus.mihailantonov.pro/cards?focus=example`
- **THEN** the response redirects to `https://app.reomi.ru/cards?focus=example`
- **AND** requests to the canonical hostname or local development are not redirected by the migration rule

#### Scenario: Existing integration
- **WHEN** an integration calls the former API hostname with an existing valid personal token
- **THEN** it reaches the same API and retains exactly that token's existing scope

### Requirement: DNS and TLS gate the cutover
The deployment MUST keep the former working application available until the new hostnames resolve to the production server and have valid HTTPS certificates.

#### Scenario: DNS is not ready
- **WHEN** the new hostname is unresolved or lacks valid TLS
- **THEN** the production application continues using its former origin without a redirect to an unavailable hostname
