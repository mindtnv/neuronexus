# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

## Commands

All commands run from the repo root via **Bun workspaces**:

- `docker compose up -d postgres` — start Postgres before anything else touches the DB
- `bun run dev` — runs `apps/web` (:3001) + `apps/api` (:3000) in parallel
- `bun run dev:web` / `bun run dev:api` — single workspace
- `bun run build` — `next build` + `bun build` for api
- `bun run typecheck` — `tsc --noEmit` across every workspace
- `bun run test` — **full test suite** (FSRS units + API integration). Auto-pushes schema to the test DB first.
- `bun run test:unit` / `bun run test:api` — narrow to one package
- `bun run db:push` — sync Drizzle schema to Postgres (dev, non-versioned, `--force`)
- `bun run db:push:test` — same, but against `TEST_DATABASE_URL`
- `bun run db:generate` / `db:migrate` — versioned migration flow for prod
- `bun run db:studio` — drizzle-kit Studio

Ports: web **3001**, api **3000**, postgres **5432**. Swagger UI at `http://localhost:3000/docs` — use it instead of curl when poking new endpoints.

Prereqs: `bun >=1.3`, Docker, a root `.env` (copy from `.env.example`). CI gates: `bun run typecheck` + `bun run test` + clean builds. No linter configured.

## Production

- **Versioned migrations**: edit schema → `bun run db:generate` → commit the `packages/db/src/migrations/*.sql` files. Apply via `bun run db:migrate:apply` (calls the programmatic `packages/db/src/migrate.ts`). CI runs `db:migrate:apply:test` before `bun run test`. Dev loop still uses `db:push --force` for speed.
- **Rate limiting**: `apps/api/src/rate-limit.ts` — IP-based, in-memory. Sign-in = 5/min, sign-up = 5/hour, forgot-password = 3/hour. Disabled under `NODE_ENV=test`. For multi-instance prod, swap the `Map` for Redis — the `rateLimitCheck` interface is the same.
- **Email / password reset**: `packages/auth/src/email.ts` picks `ConsoleEmailProvider` (dev, logs to stdout) or `ResendEmailProvider` (set `RESEND_API_KEY` + `EMAIL_FROM`). BetterAuth's `emailAndPassword.sendResetPassword` calls `sendEmail`; the web side has `/auth/forgot-password` → token email → `/auth/reset-password?token=…`. All calls go via bare `fetch` on the client (not the BetterAuth SDK) so version bumps don't rename methods under us.
- **GDPR**: `GET /profile/export` returns a full JSON dump of the user (profile, decks, cards, reviews, achievements). `DELETE /profile` (body: `{ confirmEmail }`) removes the user — FK cascades clean everything else. Covered by 5 integration tests.
- **Health**: `GET /health` runs `SELECT 1` via `dbPing()` and returns `{ ok, db: { ok, latencyMs } }` or 503. Docker healthcheck calls this every 30 s.
- **Graceful shutdown**: SIGTERM/SIGINT → `app.stop()` → `closeDb()`. The api logs `[api] bye.` before exit; Docker `stop_grace_period` should be ≥ 5 s.
- **Prod builds**:
  - API: `bun build src/index.ts --target bun --outdir ./dist` (currently ~2.75 MB bundle). Served by `bun dist/index.js`.
  - Web: `next build` with `output: 'standalone'` + security headers (CSP, X-Frame-Options, Permissions-Policy, Referrer-Policy). CSP whitelists `NEXT_PUBLIC_API_URL` for `connect-src`.
- **Docker**: `apps/api/Dockerfile` (multi-stage Bun 1.3-alpine), `apps/web/Dockerfile` (multi-stage Bun → node:22-alpine for the Next standalone runtime), `docker-compose.prod.yml` orchestrates api + web + postgres + a one-shot `migrate` service. Build from repo root so workspace symlinks resolve.
- **CI**: `.github/workflows/ci.yml` — postgres-17 sidecar, bun-setup@v2, install → `db:migrate:apply:test` → typecheck → test → build on every PR.
- **Structured logging**: `apps/api/src/logger.ts` — pino, dev via `pino-pretty`, prod emits one JSON line per log. `LOG_LEVEL` overrides default (`debug` dev / `info` prod / `silent` test). Redacts `authorization` / `cookie` / `password` / `token` automatically. Every incoming request gets a child logger bound to `{ requestId, method, path }` via `.onRequest`; handlers pull it out of `store.log`.
- **Request ID**: `apps/api/src/app.ts` honours upstream `x-request-id` header (set by LB / reverse proxy) or generates a UUID. Echoed back in the response and exposed via `Access-Control-Expose-Headers` so the web client can surface it in error toasts. Covered by 2 integration tests.
- **Pagination**: `GET /cards` is cursor-paginated (`?limit=500&cursor=<iso>`), ordered by `created_at DESC`. Response shape `{ items, nextCursor }` — next page starts after that cursor; `nextCursor: null` means end of stream. `DEFAULT_CARDS_PAGE=500`, hard cap `MAX_CARDS_PAGE=1000`. Store bootstraps the first page only; deeper fetch is on-demand. Covered by 1 pagination integration test.
- **Loading states**: `apps/web/src/components/ui.tsx` exports `NNSkeleton` (shimmer via `@keyframes nn-shimmer` in `globals.css`). Home and Review substitute the full screen for a layout-matching skeleton while `!bootstrapped` — no more opacity dimmer.

## AI / RAG (knowledge base + grounded chat)

A read-only, source-agnostic RAG foundation: a derived `kb_chunk` table (pgvector, HNSW cosine) indexed from `cards.render_text`, plus persisted `conversations` / `messages`. Scoped by `user.id`. Chat is strictly read-only over the user's own content — no card authoring, no SRS writes, no schedule moves.

- **Env vars (all optional — `apps/api/src/env.ts` `env.ai`):** `OPENAI_API_KEY`, `EMBEDDING_MODEL` (default `text-embedding-3-small`), `EMBEDDING_DIM` (default `1536`), `CHAT_BASE_URL` (default `https://api.openai.com/v1`, OpenAI-compatible), `CHAT_MODEL` (e.g. `gpt-4o-mini`), `CHAT_API_KEY`, `CHAT_MODELS` (optional allow-list for the per-turn reasoning/model picker), `INDEXING_ENABLED` (default `true`). Server-only secrets — never `NEXT_PUBLIC_*`. See `.env.example`.
- **Degrade, never crash:** none of the above use `required()`. Two INDEPENDENT derived flags gate behavior: `embeddingEnabled = Boolean(OPENAI_API_KEY) && INDEXING_ENABLED !== 'false'` (gates the index queue + write-hooks) and `chatEnabled = Boolean(CHAT_API_KEY)` (gates the SSE chat endpoint). With no keys the index queue no-ops and `/chat` shows a setup notice; the rest of the app is unaffected. `GET /ai/status` (auth) reports `{ embeddingEnabled, chatEnabled, webSearchEnabled, embeddingModel, chatModel, embeddingDim, degraded, models }` — `models` is the parsed `CHAT_MODELS` allow-list (`{ id, label, default }[]`, `[]` when unset).
- **Reasoning/model selector (`CHAT_MODELS`):** an OPTIONAL CSV allow-list for a per-turn model picker — each entry is `model` or `model|label`, the FIRST entry is the default (e.g. `CHAT_MODELS="gpt-5.5high|Deep,gpt-5.5none|Fast"`). Parsed by `parseChatModels` in `@neuronexus/shared` (`chat-models.ts`: trims, drops blanks, de-dups by id, first=default; empty/undefined ⇒ `[]`). Surfaced as `{ id, label, default }[]` via `GET /ai/status` (NEVER the key/base URL — only labels/ids leave the server). The web composer renders a compact picker only when `models` is non-empty; the choice persists in `localStorage` (`nn:chat:model`) and is re-validated against the live allow-list on load (a stale value silently falls back to the default). The chosen model rides the stream/resume/regenerate body (`model?`) → validated server-side against the allow-list (unknown → 400 `invalid_model`) → threaded `runAgentTurn(model) → chatStreamAgentic({ model })` on EVERY step. Unset ⇒ picker hidden, chat behaves exactly as the single `CHAT_MODEL`. No new required env, no migration.
- **Agentic progress read-tools:** two READ tools backed by `apps/api/src/modules/progress-stats.ts` (a tested, user-scoped `GROUP BY date_trunc('day', reviewed_at)` aggregation helper — `user_id` is the mandatory FIRST conjunct on every query). `card_progress(cardId)` returns one card's FSRS state (`state/reps/lapses/due/stability/difficulty/lastReview/suspended`) + its last-N review history (scoped by BOTH `cardId` AND `userId`). `study_stats({ scope:'global'|'deck', deckId?, days? })` returns review count, retention % (`rating >= 3`), study minutes, and a day-bucketed heatmap for the window (`days` clamped 1..365, default 30); `scope:'global'` also reports streak/level/xp from `profile`. Deck scope includes the subtree via the EXPORTED server walker `descendantIds` in `apps/api/src/modules/cards.ts` (NOT the web-only `lib/decks.ts`); a foreign/un-owned `deckId` resolves to an EMPTY scope, never a global fallback. Both follow the `search_cards` pattern (`kind:'read'`, return `ToolResult`, never throw into the loop, registered in `buildToolRegistry`, compact text well under `TOOL_RESULT_MAX_CHARS`); empty history renders "no reviews yet", not an error. `buildAgentSystemPrompt` routes progress-meta questions ("что я заваливаю?", "сколько я занимался?") to these tools while keeping conversation-meta + small-talk tool-free.
- **Chat UX (rename / stop / regenerate / copy / jump-to-card / deck scope):** `PATCH /chat/conversations/:id` renames a thread (user-scoped 404, title 1..200 → 400 on violation); the web thread list does inline rename + a hand-rolled relative "updated N ago" timestamp (no dep). Stop uses an `AbortController` in `streamChat`/`resumeChat`/`regenerateChat` (`apps/web/src/lib/chat-stream.ts`) — the `AbortError` is swallowed (never `onError`). The user row commits BEFORE streaming but the assistant turn commits only at end-of-stream, so an aborted/torn turn leaves a TRAILING user row with no answer; a recoverable "stopped — regenerate?" affordance shows both live AND on reload (trailing-user detection in `reconstructMessages`/render). `POST /chat/conversations/:id/regenerate` is delete-tx THEN replay-tx (NOT atomic — its failure tail is identical to the abort tail, recovered by the same affordance); it replays the LAST user message with the CURRENT model. Copy strips `[card:<id>]` tokens then `navigator.clipboard.writeText` + a toast. Jump-to-card: a chat citation's "open card" affordance `router.push('/cards?focus=<id>')`; `cards-browser.tsx` reads `?focus=` and opens the bottom edit dock on that card (then clears the param). The composer's optional deck-scope picker sends a turn-level `deckId?` that constrains `search_cards` retrieval to that deck's subtree.
- **Embeddings are DERIVED, disposable index.** `kb_chunk` is rebuildable at any time from `cards.render_text` (like `cards.render_text` is itself a derived search cache). Deleting the source card cascades the chunk (FK on `kb_chunk.card_id`). Rebuild via `POST /ai/reindex` (user-scoped) or the `backfill.ts` script. `kb_chunk.source_hash` = `hash(render_text + embeddingModel)` so a no-content `updatedAt` bump (e.g. `forget`/`setDue`/bulk `move`) does NOT trigger a paid re-embed.
- **pgvector prerequisite (prod):** the production Postgres must have the `vector` extension available. The bundled `docker-compose.prod.yml` uses `pgvector/pgvector:pg17`; for managed Postgres (Neon/Supabase/RDS) confirm pgvector is enabled before applying the `0010_*` migration (it runs `CREATE EXTENSION vector` as its first statement). `CREATE EXTENSION` is **per-database** — both `neuronexus` and `neuronexus_test` need it. Locally the `predb:push` / `predb:push:test` hooks in `packages/db/package.json` run `ensureVectorExtension()` BEFORE `drizzle-kit push --force` (a `beforeEach` ensure is too late — push is a separate process). Index type is **HNSW** (`vector_cosine_ops`) — no training/`lists` tuning, good recall on a small/growing corpus.
- **Reindex-on-model-change runbook:** changing `EMBEDDING_MODEL` to one with a different dimension requires: (1) update `EMBEDDING_MODEL` + `EMBEDDING_DIM` env; (2) edit the `kb_chunk.embedding` column dimension in `packages/db/src/schema/app.ts`; (3) `drizzle-kit generate` from `packages/db` → a new `00NN_*` migration that drops + re-adds the `vector(N)` column + rebuilds the HNSW index (a dimension change can't be done in place); (4) apply via `bun run db:migrate:apply`; (5) `POST /ai/reindex` (or run `backfill.ts`) — every chunk's `source_hash` includes `embeddingModel`, so all chunks are detected as stale and re-embedded. Same-dimension model swaps skip steps 2–4 (only env + reindex).

## Product shape

**NeuroNexus** is a reimagined Anki (spaced-repetition flashcards) with a graph view, garden gamification, and AI affordances. The architecture is **server-of-truth over Bun + Elysia + Postgres**, with a Next.js/React 19 client. Auth via BetterAuth. No offline mode yet — every page requires a logged-in session; the client is a thin mirror of the server's state.

The app was first built client-only against Dexie, then migrated to the current server-first shape. Expect occasional leftover files or comments from the Dexie era; delete on sight if they're clearly orphaned.

## Monorepo layout

```
apps/web           # Next.js App Router, port 3001
apps/api           # Elysia server on Bun, port 3000
packages/db        # Drizzle schema + client + migrations
packages/auth      # BetterAuth config (shared between api and web)
packages/shared    # Pure-TS types, FSRS helpers (no DOM/Node deps)
docker-compose.yml # Postgres 17
.env               # root env file, read by api (--env-file) and web (symlink)
```

Workspaces are declared in the root `package.json`; cross-package deps use `"workspace:*"`. **Next.js needs `transpilePackages: ['@neuronexus/*']`** in `apps/web/next.config.ts` — it does not auto-transpile workspace TS.

## Backend architecture (apps/api)

### Entry point
`apps/api/src/index.ts` composes the server: `cors` → `swagger` → `authPlugin` → `/health` → `onError` → domain modules. **Do not `export default app`** — if you do, Bun auto-binds `Bun.serve(app)` and collides with the explicit `.listen()` call. Only `export type App = typeof app` for Eden Treaty.

### Auth plugin
`apps/api/src/auth-plugin.ts` both `.mount(auth.handler)` (exposing `/api/auth/*`) **and** defines a reusable `auth: true` macro that resolves `{ user, session }` or returns 401. Every protected route passes `{ auth: true }` in its route config — this is how the route gets typed access to `user.id`.

### Domain modules
Each under `apps/api/src/modules/*.ts`, prefixed with its resource (`/decks`, `/cards`, `/reviews`, `/profile`). All operations scope by `user.id` pulled from the session. FK `ON DELETE CASCADE` on `decks.parent_id`, `cards.deck_id`, `reviews.card_id` and `.deck_id` means deleting a deck cascades the full subtree at the DB level — do NOT re-implement the cascade in the handler.

### FSRS grading
`apps/api/src/modules/reviews.ts` reconstructs a `ts-fsrs` Card shape from the flat Drizzle columns, calls `gradeFsrs` from `@neuronexus/shared` with the user's `desiredRetention`, then writes back the new FSRS state + a `reviews` row + an updated `profile` (streak/xp/level/plantStage) inside a single `db.transaction`. Keep grade handling transactional — it's the only multi-table mutation in the app.

**Leech auto-suspend:** after a grade, if `card.lapses` crosses the threshold (Anki default: 8), `suspended` is set to `true` in the same transaction and the response includes `leeched: true`. Subsequent `POST /reviews` on a suspended card returns 409.

**XP formula:** `{ Again: 0, Hard: 5, Good: 10, Easy: 15 }` — defined in `xpForRating` in `@neuronexus/shared`. Formula lives there, not in the handler, so the web app can preview deltas client-side.

### Review queue
`GET /cards/queue?deckId=…&newLimit=20&reviewLimit=200` returns `{ due, new, total }`. Due list is ordered by `due ASC`, new list by `createdAt ASC`. Suspended cards are excluded from both. Call this — not `GET /cards?due=true` — when building the reviewer UI: that endpoint is for ad-hoc queries and lacks the daily caps.

## Database (packages/db)

- `schema/auth.ts` — BetterAuth tables (`user`, `session`, `account`, `verification`). Regenerate with `bun run --filter @neuronexus/auth auth:generate` if you add plugins.
- `schema/app.ts` — domain tables (`profile`, `decks`, `cards`, `reviews`). FSRS state flattened into columns; `due` indexed together with `user_id` for the "what's due now" query.
- `client.ts` — singleton `postgres()` pool + `drizzle()` instance. Use `db` + `schema` from `@neuronexus/db`.
- `drizzle.config.ts` — the `loadRootEnv()` function walks up from `packages/db` to parse the root `.env` manually, because drizzle-kit spawns a Node subprocess that doesn't inherit Bun's auto-loaded env. Don't replace this with `dotenv` — it's intentionally zero-dep.

**Schema changes workflow:** edit schema → `bun run db:push` in dev (destructive, no history). For prod, switch to `db:generate` + `db:migrate` and commit the generated SQL files.

## Auth (packages/auth)

Two entry points, imported separately to avoid pulling server code into the browser bundle:

- `@neuronexus/auth/server` — `auth` (BetterAuth instance with `drizzleAdapter`). Used by `apps/api` and, if needed, by Next.js Server Components via `auth.api.getSession({ headers })`.
- `@neuronexus/auth/client` (also `@neuronexus/auth` barrel) — `authClient` + `signIn`, `signUp`, `signOut`, `useSession`. Configured with `credentials: 'include'` to send the session cookie cross-origin in dev (api on :3000, web on :3001).

Email+password only right now. Sessions are HTTP cookies; on prod move both apps behind a single domain (or shared parent via `advanced.crossSubDomainCookies`).

## Frontend architecture (apps/web)

### Server-first data flow
- `src/lib/api.ts` — **Eden Treaty** client: `treaty<App>(baseURL, { fetch: { credentials: 'include' } })`. `credentials: 'include'` is mandatory — without it BetterAuth session cookies don't cross the :3000↔:3001 boundary. Also exports `ok(result)` which unwraps Eden's `{ data, error }` envelope and throws on non-2xx. **Every API call goes through this.**
- Eden's inferred types occasionally choke on the store's generic patch handlers; calls in `store.ts` cast through `(api as any)` intentionally. When adding new endpoints, start without the cast — only fall back to `any` if TS explodes on `treaty<App>` path chains.
- `src/lib/store.ts` — Zustand store. Each method translates to one API call; the store holds a cached mirror for synchronous reads in components. No more Dexie.
- `src/lib/mappers.ts` — converts server rows (ISO dates, column names like `learningSteps`) into the UI types in `lib/types.ts` (epoch numbers, camelCase, reconstructed FSRS Card). If you add a column, extend the mapper, not the component.
- `src/lib/bootstrap.tsx` — watches `useSession()`. When a user signs in, fetches `/profile /decks /cards` in parallel and populates the store. On sign-out, clears the mirror.

### Auth UX
- `apps/web/src/app/auth/sign-in` and `/sign-up` are the public routes (render under `app/auth/layout.tsx`, no app shell).
- `apps/web/src/components/auth-gate.tsx` wraps the `(app)` group. Client-side guard: if no session, `router.replace('/auth/sign-in?next=...')`. Client-only because the whole app is statically prerendered.
- After sign-in `useSession()` flips `data.session` truthy, bootstrap fires, app renders.

### Routing
- `apps/web/src/app/layout.tsx` — fonts, `I18nProvider`, `Bootstrap` (no auth gate here — sign-in pages live under this layout too).
- `apps/web/src/app/(app)/layout.tsx` — `AuthGate` → `AppShellWrapper` (sidebar + topbar + bottom tabs + global overlays).
- `apps/web/src/app/(app)/*/page.tsx` — route stubs, all `'use client'`, all render `<NNTopbar />` + a screen component from `src/components/screens/`.

### Styling
Design tokens are CSS custom properties in `apps/web/src/app/globals.css` (`--ink-*`, `--lime-*`, `--surface`, `--r-md`, `--shadow-lg`, `--font-sans`, …). Dark is default; `[data-theme="light"]` overrides. UI primitives in `apps/web/src/components/ui.tsx` — `NNIcon`, `NNBtn` (7 variants × 4 sizes), `NNBadge`, `NNCard`, `NNKbd`, `NNLogo`, `NNPlant`, `NNHeatmap`, `NNMiniGraph`, `NNTag`. Inline `style={{}}` referencing CSS vars; no Tailwind.

### i18n
`apps/web/src/lib/i18n.tsx` → `useT()`, `useLocale()`, `useDateLocale()`. Dictionaries at `lib/messages/{en,ru}/*.ts`. Add a string to **both** locales, reference via `t('<ns>.<key>')`. Dot notation with `{name}` interpolation.

### Responsive shell
Breakpoints in `lib/use-breakpoint.ts` — mobile <720, tablet 720–1100, desktop ≥1100. `components/app-shell.tsx` swaps inline sidebar ↔ drawer (opened via `window.dispatchEvent(new Event('nn:open-drawer'))`). Bottom tabs on mobile only. Drawer state is driven by custom window events `nn:open-drawer` / `nn:close-drawer` — **do not** prop-drill open handlers.

### Global overlays
`components/overlays/global-overlays.tsx` listens for `⌘K`, `?`, and custom events `nn:open-palette` / `nn:open-cheatsheet`. Any component can open an overlay via `window.dispatchEvent(...)`. `?` handler skips when focus is in an editable element.

### Empty-state redirects
`lib/use-empty-redirect.ts` — `useEmptyRedirect('first-run' | 'done' | 'graph')`. Waits for `bootstrapped` before redirecting so initial fetches don't flash the empty screen.

## Gamification (shared + reviews handler + /achievements)

The grade handler is the single place where gamification state advances. It calls `applyGradeRollup` from `@neuronexus/shared` inside the same transaction that writes the FSRS card + review row. Rollup semantics:

1. **Streak + freeze:** `applyStreakWithFreeze` bumps `streak_days` when yesterday=last-review, consumes a freeze when there's a **one-day** gap (multi-day gaps always reset), and resets otherwise. Capped at `MAX_STREAK_FREEZES` (5).
2. **Today minutes ledger:** `today_minutes` + `today_minutes_date` accumulate `durationMs` across grades within the same calendar day; reset when a new day arrives.
3. **Daily goal stamp:** once today's minutes cross `daily_goal_minutes`, `daily_goal_met_count` increments **once** per day.
4. **Achievement evaluator:** `evaluateAchievements(stats, alreadyUnlocked)` returns `{ code, def }[]`. Stats snapshot is a live DB read inside the transaction (`totalReviews` via `COUNT(*)`, `deckCount` via `COUNT(*)`), so "polyglot" (3 decks) fires on the first grade after the user creates the 3rd deck.
5. **Rewards:** achievement definitions can carry `{ streakFreezes, species[], xp }`. Rewards are summed via `sumRewards`, species are added to `profile.unlocked_species` (dedup'd), freezes and xp added onto the running totals.

The catalog lives in `packages/shared/src/gamification.ts` → `ACHIEVEMENTS` (16 codes today: streak 7/30/100/365, reviews 100/1000/10000, decks 3/10, level 5/10/20, garden 3/5, dailyGoal 7/30). Keep the catalog monotonic within each `kind` — the unit tests enforce that.

**Plant species unlock:** five species beyond the default `fern` (`cactus`, `succulent`, `bonsai`, `sakura`, `mushroom`). Each is gated by an achievement's `reward.species`. `profile.plant_species` still stores the *current* selection; `profile.unlocked_species` lists everything the user can choose.

`POST /reviews` response now carries `{ card, review, profile, leeched, newAchievements, freezeUsed, dailyGoalJustMet }` — the web layer uses these to trigger toasts / confetti / freeze indicators.

The read API is `GET /achievements` (per-user list with unlockedAt + progress + pct), `GET /achievements/summary` (home-banner count + 3 most recent), and `GET /achievements/catalog` (static catalog, client-cacheable).

## Shared FSRS (packages/shared)

`packages/shared/src/fsrs.ts` wraps `ts-fsrs` for both server (grading) and client (rating preview). Use `Rating 1|2|3|4`, mapped to FSRS `Grade` via `ratingMap` — do NOT use `FsrsRating` directly (it includes `Manual`).

`getScheduler({ requestRetention, enableFuzz, deterministicSeedCardId })` memoizes one `fsrs()` instance per unique cache key. This lets per-user `desiredRetention` work without allocating a scheduler on every call. In tests, pass `{ enableFuzz: false }` for exact-`due` assertions.

Anki-compatible defaults exported as `ANKI_DEFAULTS`: `requestRetention=0.9`, `learningSteps=['1m','10m']`, `relearningSteps=['10m']`, `leechThreshold=8`, `maximumInterval=36500` days. Keep this module the single source of truth for those numbers — the reviews handler imports them; don't inline magic constants.

Streak / XP / plant-stage helpers (`nextStreak`, `xpForRating`, `levelFromXp`, `plantStageFromStreak`) are here too, so both the grade handler and UI previews agree.

## Testing

- **Test runner:** `bun test` (built-in). Files: `*.test.ts` anywhere in the tree. `bun run test` at the root runs every suite, after running `bun run db:push:test` (the `pretest` hook) to keep the test DB schema current.
- **Test database:** `TEST_DATABASE_URL` points at `neuronexus_test`, created by `docker/postgres-init.sh` on first container boot. `packages/db/src/env.ts` switches to it automatically when `NODE_ENV=test`, so there's no way to accidentally hit the dev DB from tests.
- **Integration pattern:** tests import `buildApp()` from `apps/api/src/app.ts` and call `app.handle(new Request(...))` — no network, no port binding. Helpers in `apps/api/tests/helpers.ts` wrap body/cookie serialization (`callApp`), cookie extraction (`extractCookie`), and sign-up (`signUpAndCookie`). Every `beforeEach` calls `resetTestDb()` which `TRUNCATE … RESTART IDENTITY CASCADE`s the full domain + auth table set (refuses to run unless the URL contains "test").
- **FSRS tests use `{ enableFuzz: false }`** to make `due` assertions stable. If you need fuzz on in a specific test (e.g., testing the fuzz bounds), pass `deterministicSeedCardId` to pin the RNG.
- Current suite: **599 tests passing** (unit + integration — auth, decks, cards, reviews, achievements, GDPR, rate-limit, note-types, undo, rich-content). Run one file: `NODE_ENV=test bun --env-file=./.env test apps/api/tests/reviews.test.ts`.

## Builtin note types

Migration `packages/db/src/migrations/0007_builtin_note_types.sql` seeds the three system note types (Basic, Cloze, Type-in) on every fresh database via a partial unique index `note_types_builtin_uq` + `INSERT … ON CONFLICT DO NOTHING`. This replaced the old seed-only path that made note-type creation impossible on prod without a manual seed run.

`ensureBuiltins()` from `@neuronexus/db` (`packages/db/src/ensure-builtins.ts`) is the test/startup contract — call it in `beforeEach` helpers and at API startup to guarantee the three rows exist before any note-type-dependent operation. Stable UUID literals are exported as `BUILTIN_NOTE_TYPES` from the same module; use those constants instead of querying by name.

## Undo (POST /reviews/undo)

`POST /reviews/undo` atomically reverts the most recent grade for the authenticated user. The grade handler stores a `undo_snapshot` JSONB column (migration `0008_undo_snapshot.sql`) on the `reviews` row at write time, capturing the exact pre-grade card + profile fields. Undo reads the snapshot and restores those fields — including `updatedAt` — in a single transaction.

Error boundaries:
- Double-undo → 404 (snapshot cleared after first undo)
- NULL snapshot (legacy row) → 404
- Card mutated after the grade via `forget` or `setDue` → 409 (guards against restoring stale FSRS state)
- Suspended/leeched card — undo still works; leech state is part of the snapshot

Side-effect: restoring pre-grade `updatedAt` means the card won't appear at the top of `edited:` / `sort:updated` queries after an undo — this is intentional (it wasn't edited, it was reverted).

UI surface: `⌘Z` keyboard shortcut + explicit undo button inside the reviewer. Both dispatch the same store action.

## Forget / set-due (PATCH /cards/:id)

`PATCH /cards/:id` accepts two new optional fields alongside the existing patch surface:

- `forget: true` — resets the card to a fresh FSRS state via `fsrsResetColumns` (stability/difficulty/interval zeroed, state=New, lapses unchanged). Clears `suspended`.
- `setDue: <ISO string>` — overrides the `due` timestamp without touching any other FSRS field.
- Combining both in one request → 400.
- Invalid ISO date for `setDue` → 400.

The handler uses **explicit field mapping**, not a body spread, so unknown fields are silently ignored rather than applied to the row. Add new patchable fields to the explicit map if needed — never destructure the whole body into the update.

## Rich card content

Card fields are rendered as Markdown using `markdown-it` (`{ html: false, linkify: false }`) on the client, field-by-field inside `apps/web/src/components/render-card.tsx`. Syntax highlighting uses highlight.js in class-based mode (no inline styles); the theme lives in `apps/web/src/app/globals.css`. Mermaid diagrams are rendered asynchronously via the `RichCard` component (`apps/web/src/components/rich-card.tsx`) which uses a dedicated `MERMAID_DOMPURIFY_CONFIG` allow-list to permit SVG output.

**`RichCard` is the single card-render component** — used in the reviewer, card-form, note-type editor, and the cards browser. Never render raw field HTML outside of it.

Render pipeline order matters:
1. Math placeholders are substituted **before** markdown parsing (prevents `$…$` from being mangled by markdown-it).
2. Main DOMPurify sanitization runs on the markdown output.
3. Mermaid SVG islands are injected **after** main sanitization via a single `inject-node` pass (they cannot pass through the main sanitizer).

## Sanitizer (DOMPurify allow-list)

The main sanitizer allow-list was extended to cover rich Markdown output: `h1`–`h6`, `blockquote`, `pre`, `code`, `a`, `table`, `thead`, `tbody`, `tr`, `th`, `td`. The extension is symmetric — both the card-render edge and the note-type-editor preview edge use the same config, pinned by a bypass corpus in the test suite.

`<a href>` whitelisting is enforced via a `uponSanitizeAttribute` hook that permits only `https?:` and `mailto:` schemes. The previous `ALLOWED_URI_REGEXP` approach was removed in favour of the hook — do not re-introduce the regexp.

`style` attributes remain **blocked** in the main sanitizer. KaTeX and Mermaid output passes through isolated sink configs that allow `style` only for their respective output nodes (`KATEX_DOMPURIFY_CONFIG`, `MERMAID_DOMPURIFY_CONFIG`). `MEDIA_TOKEN_RE` is unchanged.

## Nested decks

`Deck.parentId?: string` gives Anki-style hierarchy. Tree helpers live in `apps/web/src/lib/decks.ts`: `buildDeckTree`, `flattenTree` (with `expanded: Set<string>`), `getDescendantIds`, `getDeckPath`, `aggregateCounts`, `canBeParentOf` (cycle guard), `deckPathLabel`. When rendering counts, **aggregate through the subtree** — a parent's "due" count includes descendants.

The `PATCH /decks/:id` handler also runs a cycle-guard on `parentId` changes. DB-level cascade takes care of deletes.

## Conventions & gotchas

- **Client-everywhere for screens:** every `(app)/*/page.tsx` is `'use client'`. Server Components that call `auth.api.getSession()` for SSR are OK outside the app group, but the app shell depends on client state.
- **`useSearchParams` + Suspense:** wrap consumers in `<Suspense fallback={null}>` (see `/editor` and `/auth/sign-in`).
- **Don't split screens into client+server halves** to save bundle size — dynamic topbar subtitles depend on the store.
- **Root `.env`:** the api loads it via `bun --env-file=../../.env` in its `dev` script; web via `apps/web/.env.local` which is a symlink to the root `.env`. Don't duplicate envs.
- **No default export from apps/api/src/index.ts** — Bun's auto-serve would collide with `app.listen()`.
- **Deck deletes cascade** at the DB level (FK `ON DELETE CASCADE`). The `decks.deleteConfirm` i18n message already spells out the subtree warning — keep it accurate if you change deletion semantics.
- **Remote cron trigger** (`trig_01VB9fKge65wEAm4VDzDDEEw`) runs hourly and opens PRs that fix non-working frontend UX (originally scoped to the Dexie era, still useful for mocked buttons / broken interactions). Small focused PRs from that agent are authoritative bug fixes — review and merge normally. If the PR references a feature that now depends on the backend, verify the API path actually exists before merging.
- **`AGENTS.md` is a verbatim mirror of this file** for Codex. After editing CLAUDE.md, `cp CLAUDE.md AGENTS.md` and restore the `# AGENTS.md` / "Codex" header at the top. Don't let them drift.
