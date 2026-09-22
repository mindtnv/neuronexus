# Proposal

## Why

Reading a source, discussing it, and retaining knowledge currently require moving between the library, a notebook, and separate chat histories with different tools. Reomi needs one assistant that works with the object the user explicitly supplies, preserves that context in a durable conversation, and lets an uploaded book become a useful study workspace immediately.

## What Changes

- Add a movable, resizable, non-modal floating assistant on desktop/tablet and a full-screen presentation on mobile. Opening, minimizing, navigating, and expanding to Chats preserve the same conversation, draft, active response, and pending approval. Switching conversations does not stop an in-flight response; active turns remain isolated by conversation while the app is open.
- Make Chats the unified conversation library, including conversations started from books, cards, decks, and notebooks. Context labels and links make each conversation understandable when reopened.
- Replace presentation-dependent global/notebook capabilities with one context-aware assistant service and the existing explicit preview/confirmation workflow. `@` supplies primary context by default; a visible Only these materials mode provides strict grounding when requested. Supplementary knowledge is distinguished from source-backed claims. Neither mode grants mutation permission.
- Extend `@` to owned study objects: cards, decks, sources and passages, notebooks, written notes, flashcard notes/note types, generated artifacts (including quizzes), and conversations. Use the same typed references for object actions, per-message mentions, and pinned conversation context.
- Preserve per-message context snapshots and live links. Navigating elsewhere never silently changes an existing conversation's scope. Explicitly attaching another object or starting a new conversation does.
- Let a library source support chat, written notes, existing study-artifact/quiz types, and grounded card creation without creating a hidden or visible notebook. Reuse the full reader when opening a source from a notebook; preserve notebook membership and return location.
- Make card provenance work for source-grounded conversations from every surface, with per-card verified passage references visible before confirmation.
- **BREAKING behavior, compatibility adapter retained:** unfiltered conversation listing includes notebook conversations; the notebook no longer selects a weaker tool registry. Existing notebook source selections remain enforced, and expansion is explicit.
- Preserve source-study notes, completed documents/quizzes, quiz attempts, cards, and conversations after deleting a source. Retained study work remains discoverable in the library with unavailable-source labels; deleting that work is a separate explicit action. Pending generation is stopped safely when its source disappears.
- **BREAKING deletion behavior:** deleting a notebook detaches surviving conversations instead of cascading their history; deleted objects become unavailable context references. Existing notebook-owned notes/artifacts retain their documented notebook-deletion behavior; source-owned work survives.

## Capabilities

### New Capabilities

- `assistant-surfaces`: floating/full-screen presentations, navigation continuity, accessibility, and one shared controller with independent conversation sessions.
- `unified-assistant-conversations`: one conversation library, durable context, explicit context changes, legacy history compatibility, and deletion semantics.
- `assistant-object-context`: typed object discovery and `@` mentions, bounded snapshots, ownership, and actionable links.
- `contextual-assistant-tools`: consistent capabilities, scoped retrieval, approval continuity, and verified card provenance across surfaces.
- `source-study-workspace`: reading and retaining knowledge directly from a source, shared notebook/library readers, and source-owned notes and study artifacts.

### Modified Capabilities

None of the four archived main capabilities changes its requirements. This change deliberately supersedes the narrow notebook tool selection described in the completed, unarchived `expand-chat-knowledge-tools` change while preserving its checked-source boundary and confirmation guarantees.

## Impact

- Web: authenticated shell, `ChatPanel` state ownership, thread rail, mentions, reader and notebook screens, card/deck entry points, note/studio panels, responsive geometry, and both locales.
- API/shared: conversation listing and transport contracts, typed context resolution/search, agent registry/prompt/history/compression, provenance, notebook/source study services, and compatibility adapters for current clients and personal MCP.
- Database: versioned additive context/policy storage, message snapshots, optional source origin for notes/artifacts with retained ownership after source deletion, and an explicit change to the notebook/conversation foreign-key deletion action. Existing IDs, histories, FSRS state, source storage, and indexing remain intact.
- Deployment: API/migrations before web; retain old request forms and owner-scoped notebook endpoints. New-client feature detection prevents context loss against an older API. Rollback must retain new data and cannot re-enable the old notebook cascade without a separate data decision.
- No new paid service or required AI configuration. Existing model/search/embedding capability gates remain independently enforced.

### Non-goals

- A generated curriculum, topic graph, learning-route planner, or autonomous tutor.
- Executing Kubernetes/code/shell commands, a browser extension, external video ingestion, collaboration/sharing, or offline chat.
- A replacement SRS engine, new artifact formats, or wholesale redesign of unrelated screens.
- Treating all database rows as mentionable objects: credentials, settings, raw worker jobs, and internal audit/review rows are not study-context picker items.
- Deploying to production as part of planning or automatically migrating users' remote data during local implementation.
