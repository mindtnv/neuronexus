# Proposal

## Why

Users need to connect their NeuroNexus knowledge base to external agents without sharing their browser session or provider credentials. A personal MCP endpoint should expose useful knowledge and management operations while retaining user isolation and confirmation before writes.

## What Changes

- Add session-managed personal access tokens with one-time secret display, expiration, read/write scopes, last-use metadata and revocation.
- Add authenticated Streamable HTTP MCP at `/mcp`, with discoverable tools, resources and prompts for cards, decks, sources, notebooks, notes, study progress and account capabilities.
- Reuse domain services and user-scoped read routes. Every agent mutation validates and returns an expiring preview; applying requires explicit confirmation of that exact proposal.
- Add token management and client configuration guidance to Settings, connection documentation and an executable connection smoke check.
- Non-goals: OAuth authorization-server implementation, cross-user administration, raw SQL, credential management through MCP, arbitrary network/file access, streaming chat relay and binary upload tools.

## Capabilities

### New Capabilities

- `personal-access-tokens`: Lifecycle and least-privilege authorization for user-owned agent credentials.
- `knowledge-mcp`: Remote discovery, user-scoped knowledge tools and confirmed mutation workflow.

### Modified Capabilities

None.

## Impact

API authentication and a new MCP module, additive PostgreSQL migrations, Settings UI, official MCP SDK dependency, operational documentation and Codex client configuration. Existing cookie-authenticated REST behavior remains compatible. No required AI provider keys or new deployment service.
