# Design

## Context

`NotesPanel` keeps creation/edit input on request errors, but uses transient info toasts and local busy flags; its create request has no idempotency identity. `study-notes.ts` updates do not enforce an observed version, and pin changes intentionally do not bump content recency. Notebook pin/archive changes likewise do not bump `updatedAt`. Deck moves already serialize the owner's hierarchy but expose no inverse receipt. `toasts.tsx` has no action control and retains only four timed notifications.

`editor-drafts.ts` already provides revision-aware, owner-scoped storage (10 drafts, 256 KiB per draft, 1 MiB per owner) and visible capacity failures. Card/note-type editing and `complete-spaced-repetition-polish` own their established version/preview contracts. Reuse these rather than create another content owner.

Account menus, card menus, PDF selection, global overlays and dialogs each implement dismissal differently. `navigation.tsx` and `navigation-history.ts` already own traversal and save/keep/discard/stay guards. The assistant has portal/focus handling that must remain compatible. See proposal.md for motivation and the two delta specs for observable guarantees.

## Goals / Non-Goals

**Goals:** shared feedback and layer primitives; typed domain adapters; safe inversion of a small explicit allow-list; lossless local recovery.

**Non-Goals:** blanket autosave, arbitrary undo of every mutation, duplicating review receipts, rewriting the Next history bridge or storing editor text in the navigation journal. Deletion restoration is excluded from this planning default.

## Decisions

### 1. Save state belongs to a revision, not a boolean

Introduce a shared save controller/presentation with `clean`, `dirty`, `saving`, `saved`, `failed`, `uncertain`, `conflict`. Carry owner, entity/draft scope, submitted revision and request ID. Render a compact inline status by Save or by the edited control, using polite status announcements; errors remain until resolved or explicitly dismissed. Keep existing explicit Save flows. An older acknowledgement can update the baseline but cannot clear or mark a newer draft saved.

Use operation IDs only when committing; toggling preview, restoring a draft or opening a panel does not save. Validation errors are actionable without network replay; 409 conflicts preserve both local input and a fetched current baseline for an explicit new edit. `uncertain` displays “Проверяем, сохранилось ли изменение” and never an unqualified Saved/Failed label. Use existing ApiError support references for unexpected 5xx, not raw provider text.

Migration inventory:

| Surface | Save feedback/recovery | Generic Undo |
| --- | --- | --- |
| Card and note-type editors | Shared presentation, existing draft/preview/version rules; receipt integration where missing | None; keep established domain controls |
| Written study notes in source/notebook/retained work | Create/edit feedback, persistent drafts, safe retry and version conflict | Pin/unpin only |
| Source metadata | Title, author, description and tags; retain form on failure | Those same fields only |
| Notebook title | Preserve rename input and show outcome | Title only |
| Deck metadata | Name, color, icon; preserve input | Those same fields only |
| Deck move | Pending/error feedback and safe retry | Parent/sibling placement |
| PDF/text selection comments | Preserve selected passage and failed editor input using existing save API semantics | None |

Do not present undocumented Undo on other toggles. Any future adapter must define its actual inverse and conflict tests first.

### 2. Reuse drafts and guards without silent capacity loss

Extend the existing draft envelope with a separately typed `study-note` scope (source/notebook owner and entity or creation slot) plus original server version, submitted request ID and revision. Preserve existing `note`/`type` formats and limits. Existing legacy records remain readable. The shared draft list/export must understand the new kind, including retained notes and deleted origins. Small metadata forms keep their input in their mounted form and use dirty leave guards; persistent reload drafts are required here for written notes, not all metadata dialogs.

Clear only the exact acknowledged revision after confirmed save. An unresolved create receipt stays associated with the creation draft so reload can resolve it before another create. On storage failure, keep input and expose text export; never clear another draft to make room. Account changes tear down active controllers without deleting another owner's independent recovery data. Drafts contain private user content and never enter logs or the operation feed.

### 3. Typed receipt-backed writes and conditional inverses

Add a bounded `ui_action_receipts` table keyed by `(userId, requestId)` with UUIDv7 identity, canonical request hash, action kind, target identity, result identity/version, allow-listed before/after metadata for eligible inverses, creation/expiry and consumed-undo outcome. Store no full source/card/study-note bodies in receipts: body writes use request hashes and resulting identity/version. Normal save receipts remain reconcilable for seven days; after expiry an unresolved create must ask the user to inspect existing work or create explicitly, never blindly replay. Advertised Undo lasts ten minutes. Cleanup can remove expired receipts after the seven-day reconciliation horizon using bounded batches; user deletion cascades.

Versioned per-domain endpoints/adapters accept request ID and observed version and invoke the existing transactional domain logic. Add a read-only owner-scoped receipt lookup and explicit Undo endpoint. Route names must fail closed on an older API instead of allowing ignored preconditions. Card/note-type adapters preserve all type versions, structural previews and confirmation tokens in their transaction; they gain receipt behavior only where not already supplied by the active recovery work. A duplicate request is resolved before consuming any one-time confirmation token again. This extends the existing open recovery change's contract and does not mark its tasks complete.

Mutation and receipt commit together; matching request replay returns its original result identity, changed arguments return 409. If the target has since changed/deleted, reconciliation reports that distinction rather than applying the old response over current UI data. Undo runs under the same domain locks, checks owner, expiry and post-mutation version, performs a narrowly typed inverse and records consumption atomically. Never let clients submit trusted before-values or an arbitrary reverse patch. Lost undo responses resolve through its stored outcome. Receipt APIs remain cookie-authenticated and do not grant PAT writes or bypass assistant approval.

### 4. Revisions must detect intervening writes, including old clients

Do not use `updatedAt` alone: pinning is excluded from content recency and background ingestion also changes source timestamps. Add metadata revision counters for allow-listed source metadata, study-note editable fields/pin, notebook title and deck metadata. SQL triggers increment the relevant counter whenever a relevant value changes, covering legacy REST and agent writers; unrelated source processing or reading progress does not invalidate metadata undo. This also catches A→B→C→B changes. A conservative whole-group conflict is acceptable and safer than erasing later edits.

Deck placement uses an owner-scoped hierarchy revision incremented on any deck insert/delete/reparent/order change, including legacy routes. New moves and undo acquire the existing owner advisory lock, capture the old parent plus exact affected sibling order, and store the resulting hierarchy revision. Undo rejects if that revision changes, even for an apparently unrelated later move. This is intentionally conservative; it prevents resurrecting parents, moving newer siblings or creating cycles. Metadata-only edits do not bump hierarchy revision. Refactor shared writers to acquire compatible locks where needed; triggers provide revision coverage, not a replacement for serialization.

Alternative: client-only inverse PATCH or matching current field values. Rejected because both miss intervening writes, lose offers on route changes and can overwrite another tab's work.

### 5. Undo remains available beyond a toast

Add typed action buttons to toast presentation, with pause on hover/focus and an explicit close. A shell-owned, account-keyed “Недавние действия” list stores only receipt IDs, bounded labels, expiry and state for the current session; fetch full pagination of unexpired session offers instead of evicting them when the four-toast display limit is reached. Pending/failed undo remains actionable. Expiry uses server time and is shown clearly. This is not persistent action history across devices.

Use a server-issued session scope associated with receipts, stored as an opaque per-tab sessionStorage value; restore offers after same-tab reload through owner-scoped pagination. Scope is a filter, never authorization. If storage is unavailable, keep it in memory and disclose the reload limit. The list can appear as a distinct “Действия” section in the shell Operations panel when `add-operation-center` is installed, or through its own shell control when delivered first. Do not mix quick saves into the long-job active count. Keep both contracts independently testable.

### 6. One top-layer registry, integrated with navigation

Introduce a layer registry carrying owner, kind, parent, root/portal elements, invoking focus target and guarded `requestClose(reason)`. Migrate shell drawers, account/card/thread menus, shared dialogs, command palette, mobile inspector/filter sheets, reader saved-work panels, PDF/text selection controls and assistant-owned popups. Stable desktop rails are not transient layers. Route-backed reader/editor overlays continue to use route entries rather than acquiring duplicate layer entries.

Process only the top applicable layer. Owned portals count as inside. Escape from an IME composition does not discard editing. A simple display-only selection toolbar can dismiss; a passage note editor keeps its quote/location snapshot through its guard and errors. Outside clicks on nonmodal menus preserve the clicked focus destination; modal backdrops consume the click and request closure without click-through. Focus return uses `preventScroll`, a connected invoker or a documented surviving workspace target. Modal focus containment includes owned portals and excludes disabled confirmation controls.

For mobile Back, extend the existing navigation provider/history bridge with opaque, tab-local layer markers merged with Next state. A transient layer pushes a same-route entry without serializing input or selection. Back consumes one layer marker; manual close consumes only its own marker. A generation token invalidates dismissed/unmounted layer markers so Forward or reload cannot resurrect stale DOM. The bridge normalizes stale markers to the valid underlying route entry without loops. Dirty-layer guards use the existing one-decision traversal coordination, including repeated Back. Do not add late popstate listeners or monkey-patch history/router methods. Browser/OS keyboard dismissal remains outside this registry; viewport changes alone never close a layer.

## Risks / Trade-offs

- [Broad UI migration causes inconsistent partial behavior] → use the explicit surface matrix and a shared dismissal conformance suite, then browser-test nested surfaces.
- [New receipts bypass preview/admission rules] → adapters call existing domain services transactionally and preserve confirmation checks; verify REST, assistant and MCP boundaries.
- [Conservative undo conflicts disappoint users] → explain “Объект уже изменён; отмена недоступна” and preserve current state; never broaden the inverse silently.
- [History markers interfere with restored entries] → extend the current bridge and reusable navigation browser proof; test reload, Forward and repeated Back on mobile WebKit and Chromium.
- [Draft and receipt retention differ] → unresolved expired creates stay explicit and inspectable; no automatic replay, cleanup or truncation of local text.

## Migration Plan

1. Add receipt storage, metadata/hierarchy revisions and triggers in committed migrations. Index receipts by owner/session/expiry/ID and unique owner/request ID; revisions are direct lookup fields. Test fresh-chain migration and representative preexisting records, trigger behavior for legacy writes, and bounded cleanup.
2. Deploy compatible API before web. Existing request shapes remain supported, but only versioned routes advertise the new recovery/undo guarantee. Do not enable the new UI against an older API.
3. Roll out save/draft adapters, then Undo surfaces, then migrate all listed layer consumers and verify their common semantics. The shared layer adapter can be consumed by Operations independently of the full undo backend.
4. Prefer web-only rollback, retaining receipts/revisions/triggers and current draft formats. Old API rollback disables new write/undo routes; keep additive storage intact and drain in-flight writes. Draft recovery must remain available on the compatible client until users resolve it.

The planning default is reversible small changes only. Trash/undelete is a separate potential expansion, not an implicit promise or a blocker for this bounded change.
