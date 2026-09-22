## Context

See proposal.md for motivation. The API already owns cookie authentication, scoped REST reads, domain mutation helpers and chat-agent tools with validate/dryRun/execute. Existing workers provide asynchronous indexing. MCP must not depend on chat configuration or introduce a second source of domain truth.

## Goals / Non-Goals

**Goals:** A broad, typed, versioned MCP catalog; personal token lifecycle; compatibility with local Codex and remote bearer-capable clients; durable confirmation and replay protection.

**Non-Goals:** OAuth, arbitrary REST proxying, raw SQL, binary uploads, account deletion/export or token issuance from agent tools. Do not implicitly deploy local data to production.

## Decisions

- Use the official MCP TypeScript SDK with a fresh stateless Web Standard Streamable HTTP transport per request and JSON responses. This fits Bun/Elysia and avoids session state collisions. Require bearer authentication on every request and enforce the configured web/API Origin allow-list.
- Add `personal_access_tokens` (UUIDv7, user FK, SHA-256 digest unique index, name, prefix, scope, expiry, revocation and usage timestamps). Random secrets contain 256 bits; high entropy makes a keyed password hash unnecessary. Session-only routes manage credentials; PATs never become general browser sessions.
- Reuse allow-listed existing REST GET handlers through a process-private request identity map, never a spoofable header. Explicit schemas describe each MCP read tool. Reuse the chat registry for card/SRS writes and deterministic/semantic reads, adding scoped notebook context and management tools with validation and previews.
- Store pending actions in `mcp_actions` bound to user and token, with expiry, immutable arguments and preview. Confirm consumes and executes transactional domain tools in one database transaction with a row lock. Reject consumes without mutation. Revalidate ownership and inputs at application; index hooks run only after commit. Client instructions require a real user decision: a confirmation boolean is not evidence that an untrusted agent obtained consent, so clients must retain their approval UI.
- Keep all new management writes inside transaction-aware domain adapters. Do not route writes through the private REST read bridge. This avoids confirmation/transaction bypasses and prevents external side effects during preview.
- Settings provides token generation, one-time copy, revocation, and per-environment MCP URL/config snippets. A repository script exercises SDK initialize/discovery/read against a configured endpoint; local setup stores credentials outside Git.

## Risks / Trade-offs

- [Wide tool catalog] → Explicit curated schemas and annotations, least-privilege discovery and cross-user tests; exclude operations without an honest preview.
- [Content changes between preview and apply] → Revalidation and fresh preview comparison reject stale proposals; transactions and row locks protect replay.
- [Credentials exposed by diagnostics] → Never print tokens in tests or docs; metadata-only API responses after creation, no token/content logging.
- [Stateless transport] → No server push or resumable streams; ordinary knowledge tools return bounded JSON.
- [Bearer-only clients] → Document compatible clients and absence of OAuth; provide standard HTTP config and local stdio bridge if needed.

## Migration Plan

Generate and commit an additive Drizzle migration for both tables and indexes (token digest lookup and user/time lists; action token/user/expiry lookup). Apply with the committed migration chain before starting the API. Existing rows and sessions remain unchanged. Roll back the application image while retaining additive tables; revoke issued tokens when withdrawing MCP access. No destructive down migration or embedding rebuild is needed. Local runtime uses the local database; the deployed API uses its existing production configuration and distinct tokens.
