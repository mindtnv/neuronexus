# Proposal

## Why

Reomi now has its own domain. The application and API must move from personal-domain hostnames to `app.reomi.ru` and `api.reomi.ru` without losing existing accounts or data.

## What Changes

- Serve the application and API over HTTPS on the new hostnames.
- Build the web image against the new API origin and align API CORS, authentication and password-reset origins.
- Redirect the former web hostname to the new application, preserving paths and query strings; retain the former API hostname as a compatibility alias for existing integrations.
- Gate the cutover on working DNS and certificates and document rollback.
- Browser sessions and origin-local preferences are not transferred between domains; users sign in again.

## Capabilities

### New Capabilities

- `production-domain-routing`: Canonical Reomi production origins and legacy-address compatibility.

### Modified Capabilities

None.

## Impact

GitHub image build configuration, Next.js redirects, Coolify routing/runtime environment, DNS, storage CORS verification, and deployed MCP documentation. No schema, storage location, account, token, or data migration. Non-goals: apex-domain landing pages, international domains, rebranding unrelated UI, or changing hosting providers.
