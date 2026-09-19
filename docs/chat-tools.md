# Chat tools

Global chat receives its current enabled tool catalog with every turn. The base card/SRS tools remain available; the knowledge bridge adds the same curated reads and validated management operations used by personal MCP. `web_search` and `fetch_page` remain capability-gated. The global registry currently contains 58 tools without these two optional web tools.

## Library and notebooks

- Discover: `list_library`, `get_library_item`, `list_notebooks`, `get_notebook`, `list_notebook_sources`.
- Read: `read_source_chunks` (parsed text, no embeddings needed), `search_library` (semantic search, needs embeddings), `get_source_cards`, `get_source_marks`, `get_source_annotations`.
- Notes and study artifacts: `list_notebook_notes`, `list_notes`, `read_note`, `save_note`, `list_artifacts`, `get_artifact`, `list_quiz_attempts`, `get_notebook_coverage`, `get_concept_map`.
- Confirmed changes: `create_notebook`, `update_notebook` (including pin/archive), `delete_notebook`, `update_note`, `delete_note`, `attach_source`, `detach_source`, `update_source`, `set_reading_status`, `create_text_source`, `create_url_source`.
- Collection management also includes `create_deck`, `update_deck`, `delete_deck`, `delete_card`, and `delete_flashcard_note`. Read tools expose tags, note types, queue, deck options and graph/retention data.

The global note tools require an explicit owned notebook ID. Notebook-mode chat retains its existing checked-source registry; it does not gain unrestricted library access. Returned library/notebook links use the configured public web origin. Responses are bounded; large results require a smaller limit instead of silently dropping records or fabricating pagination cursors. PDF/file uploads still use the normal upload UI.

## Approval and isolation

`ai/knowledge-tools.ts` adapts shared service schemas and prepare/execute functions. Reads use only fixed GET routes through `mcp/internal-read.ts`; the Request identity comes from the authenticated chat user and cannot be supplied in model arguments or headers. Storage/provider internals are excluded from results.

Every added write validates ownership before preview and again in the confirmation transaction. A canonical state fingerprint and bounded human-readable impact are persisted on the pending `tool_calls` JSONB item. Reload preserves the preview. A stale or missing preview fails closed. A savepoint rolls back partial service failures; the outer transaction commits the mutation together with its tool-result row. The existing unique index/replay guards prevent double application. Source processing callbacks run only after the successful outer commit; rollback/rejection schedules nothing.

This is independent of PAT permissions: personal MCP still authenticates its own bearer tokens and stores its own expiring action previews. The MCP legacy adapter explicitly requests the original chat registry, preventing duplicate tools and adapter recursion.

## Presentation

Completed reads use compact summaries and structured lists. When a write awaits approval, completed read steps collapse separately so they do not bury the decision. Resource previews include target names, proposed field values and destructive impact counts. Code blocks retain sanitized syntax tokens, show a separate non-copying line gutter, and copy only source text; the clipboard fallback also supports the private HTTP development origin.
