# Chat tools

Every assistant surface receives the same current enabled tool catalog with every turn. The base card/SRS tools remain available; the knowledge bridge adds the same curated reads and validated management operations used by personal MCP. `web_search` and `fetch_page` remain capability-gated. The live registry is the source of truth for tool discovery.

## Library and notebooks

- Discover: `list_library`, `get_library_item`, `list_notebooks`, `get_notebook`, `list_notebook_sources`.
- Read: `read_source_chunks` (parsed text, no embeddings needed), `search_library` (semantic search, needs embeddings), `get_source_cards`, `get_source_marks`, `get_source_annotations`.
- Notes and study artifacts: `list_notebook_notes`, `list_notes`, `read_note`, `save_note`, `list_artifacts`, `get_artifact`, `list_quiz_attempts`, `get_notebook_coverage`, `get_concept_map`.
- Confirmed changes: `create_notebook`, `update_notebook` (including pin/archive), `delete_notebook`, `update_note`, `delete_note`, `attach_source`, `detach_source`, `update_source`, `set_reading_status`, `create_text_source`, `create_url_source`.
- Collection management also includes `create_deck`, `update_deck`, `delete_deck`, `delete_card`, and `delete_flashcard_note`. Read tools expose tags, note types, queue, deck options and graph/retention data.

Notebook-owned note operations require an explicit owned notebook ID; `save_source_note` saves to an owned source. Tool availability is independent of the opening surface. Strict turns enforce their stored selected sources/decks across reads; focus turns can supplement their primary context. Returned library/notebook links use the configured public web origin. Responses are bounded; large results require a smaller limit instead of silently dropping records or fabricating pagination cursors. PDF/file uploads still use the normal upload UI.

## Approval and isolation

`ai/knowledge-tools.ts` adapts shared service schemas and prepare/execute functions. Reads use only fixed GET routes through `mcp/internal-read.ts`; the Request identity comes from the authenticated chat user and cannot be supplied in model arguments or headers. Storage/provider internals are excluded from results.

Every added write validates ownership before preview and again in the confirmation transaction. A canonical state fingerprint and bounded human-readable impact are persisted on the pending `tool_calls` JSONB item. Reload preserves the preview. A stale or missing preview fails closed. A savepoint rolls back partial service failures; the outer transaction commits the mutation together with its tool-result row. The existing unique index/replay guards prevent double application. Source processing callbacks run only after the successful outer commit; rollback/rejection schedules nothing.

This is independent of PAT permissions: personal MCP still authenticates its own bearer tokens and stores its own expiring action previews. The MCP legacy adapter explicitly requests the original chat registry, preventing duplicate tools and adapter recursion.

## Presentation

Completed reads use compact summaries and structured lists. When a write awaits approval, completed read steps collapse separately so they do not bury the decision. Resource previews include target names, proposed field values and destructive impact counts. Code blocks retain sanitized syntax tokens, show a separate non-copying line gutter, and copy only source text; the clipboard fallback also supports the private HTTP development origin.

## Unified context and source study

The desktop/tablet floating window, mobile full-screen window, Chats page, and notebook entry points share one account-scoped controller. Opening, minimizing, moving between routes, or switching conversations does not restart the transport. Stop affects only its conversation. At most three turns run per user and one per conversation; awaiting approval releases a slot, and confirmation reacquires one before executing. Slots remain owned until settlement, including after cancellation is requested. Admission is process-local; multiple API instances require shared coordination before deployment.

The `@` picker resolves cards, decks, sources, source passages, notebooks, written notes, flashcard notes, note types, artifacts, and conversations with owner checks. A turn accepts at most 16 distinct effective references, 4000 excerpt characters per reference, and 24000 total excerpt characters. Historical labels are capped at 200 characters. Pins affect future turns; persisted user-message snapshots preserve the effective context of old answers. A referenced conversation provides bounded data, never authority to confirm its pending operations.

Focus is the default. The visible Only selected materials control selects strict mode; explicit textual requests are resolved before retrieval. Ambiguous policy instructions are rejected for a visible user choice without deleting an existing answer during edit-and-rerun. Ordinary regeneration and pending-action continuation retain their stored context. Empty strict scope remains empty. Parsed source reads do not require embeddings; semantic search, chat, web search, and page fetching retain independent capability gates.

New clients use `/chat/context-v1/conversations` and its detail, stream, resume, and regenerate routes. These routes share handlers, IDs, history, and admission with legacy `/chat/conversations`. The versioned path prevents an older server from silently ignoring typed context. Missing protocol support disables context-bearing sends and pending confirmations visibly.

Source-study tools include `list_source_notes`, `get_source_note`, `save_source_note`, `list_source_artifacts`, `get_source_artifact`, and `list_source_quiz_attempts`. Source-owned notes and completed artifacts/quiz attempts retain their source origin after deletion; their live source link becomes unavailable. Notebook attachment does not clone these objects. Generic `read_context_object` provides bounded reads of explicitly selected notes, artifacts, note types, flashcard notes, and conversation text.

`list_marked_passages` also reads text-reader highlights and notes. Its `textOffset` continuation retains the same source filter and omits repeated PDF markup. Text selections are labeled as user-supplied quotes; a current chunk hash establishes a usable location, not proof that arbitrary saved text is a verified source quote. Use `read_source` before selecting original-source evidence. Stale locations keep their historical quote without manufacturing replacement anchors.

New card proposals select evidence per card through `evidenceChunkIds` or eligible `evidenceQuotes`. Only supplied/observed evidence is admitted, its freshness is checked again inside the confirmation transaction, and the selected cards receive their own snapshots. Excluding a proposed card also excludes its evidence links. Legacy pending proposals retain their compatibility adapter. Missing sources or changed locations display historical labels/quotes with unavailable navigation.

Current acceptance evidence is recorded in `openspec/changes/archive/2026-09-22-unify-contextual-assistant/acceptance.md`; it distinguishes completed checks from the remaining full walkthrough.

Direct user saves from the text reader also preserve provenance. The quick-card request carries `textSelection` (rendered offsets, raw/render hashes, quote and selected chunk IDs); the server validates live ownership and chunk versions within the card transaction. These snapshots use `user_selection`, explicitly retaining user-supplied quote semantics, while unanchored selections use `user_quote`. Neither path invents PDF rectangles or attaches neighbouring chunks. The source title and quote survive deletion of the live source.

The PDF reader sends `pdfSelection` with its captured source version, page, and exact selected quote. New PDF quick-card saves retain one page-level `user_quote` snapshot rather than attributing every parsed chunk on the page. The transaction rejects changed source versions and invalid pages. A changed or deleted source keeps its historical quote/title/page while disabling precise navigation; requests without a selection payload continue through the legacy adapter.

Harvest candidates include `evidence: { sourceVersion, originHash }`, which the wizard preserves alongside each included origin when editing fronts/backs. Apply validates this state in the same transaction as card creation and origin consumption. Modern harvest provenance uses the stored mark/ink quote and page, not replacement provenance from the request. Changed source/markup state returns `409 harvest_evidence_stale` and rolls back the whole batch. Excluded origins remain available, and replaying an already-applied selection creates no duplicate cards. Legacy apply bodies without evidence metadata retain their compatibility path.

Deployment order and maintenance rollback are documented in [Contextual assistant rollout](contextual-assistant-rollout.md).

Standalone source artifacts can use parsed text while embeddings are indexing, disabled/parked, or have failed (`index_failed`). Pending/parsing sources and parser failures remain unavailable for generation. This is independent of the model gate: unavailable chat/completion capability rejects source generation before a job is inserted. Stored notes and completed artifacts remain readable. Notebook-owned generation retains its legacy readiness adapter.

An explicit composer policy choice is consumed by the edited turn it accompanies. A rejected edit restores the choice only when newer input has not superseded it, and the inline editor keeps its text for retry. Policy classification for an edited request runs before resolving new object content and before changing the saved transcript.

Legacy live card backlinks receive historical snapshots through migration 0035. Existing modern snapshots are preserved, and unknown metadata for already-deleted sources is not invented. Legacy request adapters also write snapshots for new links. Historical excerpts are bounded without splitting Unicode surrogate pairs; source-only legacy links retain the source label even when no original quote was stored.

Source deletion removes the file and its annotations (including annotation comments), while saved study notes, completed documents/quizzes and attempts remain available in Saved study work. Those objects have separate deletion confirmations; deleting a quiz deletes its attempts. Notebook attachment/detachment does not transfer ownership or clone study work.
