# Design

## Context
Global chat has card/SRS tools; notebook chat has a narrower source/notes registry. Personal MCP already owns validated knowledge-management services and a fixed GET allow-list. Chat previews currently disappear after reload.

## Goals / Non-Goals
Goals: share existing operations, maintain the normal chat approval loop, make previews durable and actionable, and improve activity/code presentation. Non-goals: bypassing PAT/session authorization, arbitrary URLs in the internal GET bridge, unrestricted file uploads or expanding notebook scope.

## Decisions
- Adapt curated MCP reads with a server-resolved authenticated user, through the existing per-Request identity map. Cache a lazily constructed app handler; expose no method/path/header inputs.
- Adapt management/source services through their schemas and prepare functions. Re-prepare inside a savepoint, compare a canonical state fingerprint, then execute using the caller's transaction.
- Store optional impact/fingerprint metadata on pending tool-call JSONB records. Existing transcripts remain compatible; new management writes without a stored preview fail closed.
- Carry a process-local post-commit callback on successful tool results, invoked only after the outer confirmation transaction commits. Never serialize that callback.
- Keep MCP's legacy adapter on the original registry to avoid recursively adapting new tools or duplicate names.
- Render generic resource previews alongside existing card-specific confirmations. Fold completed reads compactly while keeping pending decisions visible.
- Enhance sanitized code DOM with a non-selectable line gutter and copy button; copy only code text, including an HTTP-origin clipboard fallback. Remove reviewer reveal pulse.

## Risks / Trade-offs
- Shared services drift → integration tests exercise both MCP and chat, ownership and rollback.
- Extra registered schemas increase prompt size → use bounded descriptions and an explicit tool inventory.
- A preview can become stale → fail closed and request a fresh proposal.

## Migration Plan
No schema migration: transcript additions are optional JSONB fields. Rollback ignores new display metadata; unknown pending tools cannot execute. Existing card and document index ownership stays unchanged.
