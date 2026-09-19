# Proposal

## Why
Global chat cannot discover or manage the user's library and notebooks despite those capabilities existing in the product and personal MCP. Its self-description can drift from the actual registry. Tool output and code blocks also need clearer presentation.

## What Changes
- Expose curated user-scoped library/notebook reads and existing management operations in global chat, including notes, source attachment, metadata and text/URL imports.
- Reuse existing validation and transactions; preview every write, persist previews across reload, reject stale approvals, and enqueue imports only after commit.
- Derive tool discovery guidance from the live registry and localize every exposed activity label.
- Present completed reads compactly, separate pending confirmations, and improve code blocks with line numbers/copy and minimal rounding.
- Remove the reviewer reveal accent stripe.

## Capabilities
### New Capabilities
- `chat-knowledge-management`: Discover and manage personal knowledge through grounded reads and confirmed writes in global chat.
### Modified Capabilities
None.

## Impact
API tool adapters and confirm-resume flow, optional JSONB transcript metadata, shared impact types/prompts, chat activity UI and rendered code decoration. No schema migration, new dependencies, token-auth expansion, arbitrary HTTP execution or filesystem/PDF upload tool. Notebook chat keeps its existing checked-source scope.
