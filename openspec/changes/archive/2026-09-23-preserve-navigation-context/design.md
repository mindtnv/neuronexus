# Design

## Context

See `proposal.md` for motivation and scope. Read-only inspection found these integration points:

- `components/navigation.tsx` owns `AppLink`, programmatic navigation and one active editor guard. Progress currently keys on pathname; query-only transitions opt out. Its `popstate` handler tracks progress but does not run the leave guard.
- `components/app-shell.tsx` keeps the shared assistant outside route content. Route screens can unmount; preserving the shell alone does not preserve their local state.
- `screens/library.tsx` keeps search/filter/sort and details in component state; only view/search-mode preferences persist. Its `useSessionResource` cache remembers data for a query, not which query or scroll position to restore.
- `screens/cards-browser.tsx` synchronizes `q` with the URL but keeps sort, focus, selection and panel state locally. It consumes `focus` with replace. Decks similarly consume `focus`, persist collapsed IDs as a preference, and keep selected deck/search locally. Notebooks keeps search/archive state locally.
- `screens/library-reader.tsx` resolves explicit locations before server reading progress and legacy storage. It consumes location parameters, has stable reader panels, and returns standalone visits to `/library`. `reading-progress.ts` already binds its delayed writes to source/account.
- `screens/notebook-workspace.tsx` keeps the notebook mounted below a portal reader, preserving its state for that immediate round trip. `viewer` is local; opening it does not create a browser history entry. Its existing source query handling provides a URL entry point for reload.
- `source-links.tsx`, `source-peek.tsx` and related-card actions use ordinary pushes. The editor recognizes an allow-listed review `returnTo`; `review-session.ts` has only an in-memory editor handoff. Full recoverable sessions are planned in `complete-spaced-repetition-polish`, not present in this inspected code.
- Component tests use Bun, the shared test DOM and injected Next router contexts. They cannot alone establish real browser history or layout correctness. Browser acceptance is required in addition.

## Goals / Non-Goals

**Goals:** one typed navigation protocol with screen adapters; per-history-entry identity; predictable precedence; bounded reconstruction from current data; current-tab reload recovery; reuse existing domain state owners.

**Non-Goals:** keeping every visited React tree or PDF canvas mounted; caching full collection contents in browser storage; reproducing server state; modifying scheduling, draft formats, assistant transport, source deletion semantics or existing preference retention. Only stable read/inspection panels restore; action menus, bulk selections, file inputs, drawing gestures, DOM text selections and confirmation dialogs do not.

## Decisions

### 1. Distinguish history entries from section defaults

Extend the navigation provider with explicit `section`, `open-object`, `return` and ordinary explicit-link intents. Browser traversal is an independent intent. Each app-managed history entry has a namespaced navigation ID and logical position; snapshots map that ID to its view and optional parent-origin ID. A separate map stores the last collection view for each of Library, Cards, Decks and Notebooks.

Only explicit section controls (sidebar, bottom tabs and palette Go-to-section actions) use the section map. Object results use `open-object`; their destination is determined by the URL, not hidden old filters. Clicking the already-active section does not append a duplicate entry. Editors, readers and notebook child views never become a collection section's default destination.

Use browser traversal when the parent is a known reachable entry in the current history branch. Otherwise replace with the validated parent snapshot or safe parent route. Do not push a new parent entry on return. Preserve browser-owned/framework-owned history fields when adding namespaced metadata; never overwrite Next's state object. Branches abandoned after Back are not considered traversable even if their snapshots remain cached.

Browser verification found that a Window popstate listener installed by a normal React effect runs too late for Next synchronous traversal. A small pre-hydration event bridge delegates to the active provider before Next handles the event and captures the initial history marker before Next rewrites it on hydration. It does not patch router/history methods.

The history adapter must observe same-path query commits, Back/Forward and reload rather than relying solely on `usePathname`. Snapshot updates, scroll changes and query typing replace/update the current entry; deliberate object excursions push. Establish compatibility with the pinned Next runtime using a real-browser round-trip test before rolling this adapter through screens. Blanket router monkey-patching and a second independent router are rejected.

### 2. Separate URL state, tab snapshots and domain state

Precedence is determined per navigation intent:

| Intent | Initial view |
| --- | --- |
| Back/Forward or reload of a matching managed entry | Its validated entry snapshot, consistent with the entry URL |
| Fresh explicit URL/object link | Explicit target/query/location; unspecified collection query defaults to unfiltered; existing appearance preferences still apply |
| Sidebar/mobile section control | Last collection snapshot for that section; defaults if absent |
| Fresh reader with no explicit location/snapshot | Existing server reading state, then existing legacy fallback |

URL adapters retain existing `q`, `focus`, reader location and notebook source parameters and validate all new optional view parameters. A consumed one-shot parameter is recorded in the current entry before canonical replacement, so reload retains the resolved target. An externally changed URL invalidates conflicting stored view fields. Never serialize parent snapshots, labels, quotes, card bodies or draft text into a URL. Search terms already supported as URL query state remain shareable through the normal URL; opaque navigation metadata is never added to a copied link.

The new store contains IDs, view parameters, bounded search strings, scroll anchors, logical focus targets and opaque references to other state owners. It contains no server records, transcript bodies, note content, token credentials, mutation previews or grade queues. Existing server reading progress can advance on a citation visit; an earlier history-entry anchor still wins when returning to it.

### 3. Account-bound session storage with a bounded memory fallback

Use a versioned namespace such as `nn:navigation:v1:<ownerId>` in `sessionStorage`, backed by memory during the current page lifecycle. Attach the authenticated owner only after session resolution. Link from the root navigation provider to authenticated lifecycle events and `useNN.reset()` without creating a provider per screen.

Initial implementation limits: 64 entry snapshots including origins, 512 KiB total encoded storage, 64 KiB per entry and an origin traversal depth of 16. Oversized field updates are rejected intact, with the previous value retained. Pin the current entry, then prefer retaining its nearest origins and the four section states; evict least-recently-used unpinned entries. If a single snapshot exceeds bounds, reject optional fields or that snapshot without truncating a query into different semantics. Cyclic or missing origins terminate at a safe parent. Limits are named constants with tests, not unlimited maps.

Validate schema/version, field lengths, finite coordinates and allow-listed routes on read. A fresh page navigation without a matching managed history entry does not inherit cloned session storage from an opener; initialize an independent session namespace/map for that entry. A duplicated tab may start from the browser-copied current view, but subsequent writes remain independent. No cross-tab broadcast of navigation snapshots is introduced.

On explicit sign-out/account change, clear this feature's outgoing account data and increment a generation token before rendering another account. Ignore any late reads/writes for the previous generation. Temporary session uncertainty hides restoration until the same owner is confirmed; preserve only an internal return reference across reauthentication, not a URL containing private state. A different owner clears it. Existing drafts and preferences have their own lifecycles and are never deleted by navigation cleanup.

Capture state continuously with a short debounce, and synchronously flush before approved app navigation and on `pagehide`/visibility loss. Do not depend on an unmount effect or `beforeunload` alone. Storage denial/corruption/quota failure degrades to memory and one localized non-blocking reload-recovery notice per tab session, without a toast on every scroll.

### 4. Typed screen adapters own view semantics

| Surface | Snapshot fields / integration |
| --- | --- |
| Library | Search and search mode, kind/reading/tag/unattached filters, sort, inspected source ID, grid/list anchor, details panel scroll. Existing view preference remains separately owned. |
| Cards | Query and existing structured route scope, sort field/direction, focused card ID, stable filter/detail visibility, main table X/Y anchor and filter/detail scroll. Exclude multi-select and action-menu state. |
| Decks | Search, selected deck ID, effective normal/search expansion state and tree/detail scroll. Global width/icon/color preferences stay in existing stores. |
| Notebooks list | Search, archive visibility, list anchor and logical focused notebook. Exclude create form contents. |
| Notebook workspace | Notebook ID, active mobile/dock tab, inspected saved note/artifact IDs, source-list/panel anchors, nested reader descriptor and existing conversation/session reference. Reuse the existing persisted explicit source scope, including empty selection. |
| Standalone or nested source | Source ID, representation, PDF page plus fractional page offset or text chunk/position anchor, current TOC/marks/notes/studio panel and inspected saved object IDs. Existing zoom/width preferences remain owned by the reader. |
| Editor and Review | Origin IDs and opaque draft/session references, integrated into their existing controllers. No second serialization of mutable content or grading history. |
| Assistant and secondary routes | Preserve existing controller behavior. Navigating through these routes retains the origin snapshots, but this release does not add graph/statistics/settings-specific state codecs. |

Provide a small adapter API to capture, initialize, report data/anchor readiness and cancel restoration. Initialize view settings before starting requests so default queries do not race restored ones. Define a visible Reset view command for the four collection screens; clear browsing state without resetting palette, density, columns or saved widths.

### 5. Restore semantic anchors with a finite lifecycle

Snapshots record a primary visible row ID and its offset from the relevant scroll container, up to two adjacent fallback IDs, plus X scroll when applicable. PDF locations use page and fractional offset; text locations use existing chunk/position locators with a within-block offset. Raw Y is a fallback for small stable panels, not the sole locator for reflowable content.

Lifecycle: authenticate/validate entry -> initialize view -> obtain current data -> resolve anchor -> restore scroll once layout is ready -> restore logical focus -> settle. Each run carries owner/entry/query/generation identity and a cancellation signal. Wheel/touch/pointer-driven scrolling, scroll keys, editing filters, changing selection or navigating cancel conflicting work. Programmatic restoration scroll is distinguished from user intent. No interval keeps fighting the user to maintain an old offset.

Reuse in-memory session data for immediate same-tab returns, then revalidate. On reload, reconstruct lists with existing cursor endpoints: initial budget at most 20 page requests, 10,000 rows and 5 seconds of active restoration, whichever is reached first. Replay current response cursors unchanged; never fabricate offsets/cursors or rely on the 500-card bootstrap to represent the collection. Stop on anchor discovery, end-of-list, error, interaction or budget. API-owned detail endpoints can restore an inspected item outside the loaded list, but cannot claim its list position has been restored.

Within budget and unchanged data, restore the anchor to within 8 CSS pixels of its prior container offset. After reflow or clamping, the semantic anchor must be visible. If no stored anchor survives, use the beginning of the current result set and explain the fallback once; retain search/filter/sort and loaded results. Offer retry for failed/budget-limited reconstruction, never spin indefinitely. Placeholder layout prevents the default list flashing before initialization. Restoration uses instant positioning, respects reduced motion and waits for the relevant PDF/text layout milestone rather than an arbitrary timeout.

### 6. Nested readers participate in history without a second reader

Keep `SourceStudyWorkspace` as the shared reader. Opening it from a notebook records the notebook parent entry and pushes the existing notebook URL with a validated `source` descriptor. The workspace reconstructs `viewer` from the navigation entry/URL, preserving the currently mounted notebook where possible. Closing uses contextual return; Back closes the reader and Forward restores it. Reload reconstructs both the notebook state and the child reader state.

Source-to-card and card-to-source links use typed object navigation and retain that nested parent descriptor. Returned labels resolve from owned current objects, with generic localized fallbacks (`Back to Library`, `Back to notebook`, `Back to review`). If an originating notebook is unavailable, fall back to `/notebooks`; standalone source fallback is `/library`; card/editor fallback is `/cards`; review scope fallback is the accessible deck collection or `/review`. Do not bypass access checks using stored titles or render deleted content from snapshots.

Native DOM selection, unfinished ink strokes and open mutation confirmations are deliberately not navigation snapshots. Existing persisted annotations and saved study work remain discoverable at their actual anchors.

### 7. One leave guard and one owner for mutable work

Unify AppLink/programmatic/context-return/browser traversal with the existing async guard. For managed browser traversal with an active guard, retain the rendered current workspace, restore the current history position under a suppression token, and replay the requested traversal exactly once if approved. Cancelling leaves the original URL/entry/content intact. Repeated Back events while the decision is pending must not queue multiple dialogs or replay an outdated destination. Unmanaged history or full-page exits retain the native unload protection; never attempt to hijack external browser history.

Capture outgoing state only after the guard permits navigation; cancelled intent cannot consume a parent or replace a section default. Stable panel restoration must not recreate a confirmation dialog. Guard registration, account changes and late async saves must retain existing generation checks.

Review integration is explicitly dependent on the single recoverable session owner delivered by `complete-spaced-repetition-polish` R2-049/R2-050/R2-051/R2-052/R2-059 and relevant active-time handling. Extend its navigation adapter/reference surface as necessary inside that owning workstream before claiming review acceptance here. Preserve legacy `returnTo`/`resume` editor URLs. A live stale card/session is reconciled by that owner; navigation cannot silently recreate a queue, count a saved grade again, or replay an uncertain write. No change to AI preview/confirmation is introduced.

## Risks / Trade-offs

- History metadata and query-only portals interact with Next restoration -> verify actual Chromium/WebKit/Firefox Back/Forward, same-path pushes and reload; merge metadata and retain a single navigation owner.
- Deep collections cannot be reconstructed cheaply with only cursor APIs -> explicit budget and honest fallback; no new locate endpoint in this version. Increasing the acceptance guarantee beyond the budget requires a separate API decision.
- Browser session restoration may retain sessionStorage after closure -> no promised expiry on close; guarantee is same-tab transitions/reload, and sign-out/account isolation remains enforced.
- Mobile keyboard and changed geometry can cause double jumps -> semantic anchors, viewport clamping, logical focus with `preventScroll`, no automatic editable focus on reload.
- Restoring stale permissions or data -> authorize and refresh through existing APIs; snapshots contain metadata only.
- The parallel SRS change may change draft/review APIs -> integration tasks name the required behaviors, and full change completion is gated on the compatible owner rather than duplicating it.

## Migration Plan

This change is web-only and adds a versioned optional sessionStorage format. No database migrations, indexes, server configuration or production operations are required by it. Existing preference and source-reading keys remain unchanged; there is no wholesale localStorage migration. Old reader/card/editor links remain accepted.

Release after targeted navigation/browser acceptance and the repository gates. For review integration, verify the prerequisite session-owner work and follow its separate compatibility/deployment requirements. This change alone imposes no API-before-web ordering. Roll back the web build if needed; unknown snapshots are ignored by older code, and no stored cards, grades, reading progress or drafts require rollback. A future incompatible snapshot format gets a new version and safe discard behavior.
