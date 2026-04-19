# NeuroNexus

Anki reimagined — graph view, garden gamification, AI affordances.

Monorepo with a **Bun + Elysia + BetterAuth + Drizzle** backend and a **Next.js 16 / React 19** frontend.

## Layout

```
apps/web           # Next.js App Router, client-first UI
apps/api           # Elysia HTTP server on Bun
packages/db        # Drizzle schema, client, migrations
packages/auth      # BetterAuth config, shared by api + web
packages/shared    # Pure TS types + FSRS helpers
docker-compose.yml # Local Postgres 17
```

## First-time setup

```bash
# 1. Install deps (uses bun workspaces)
bun install

# 2. Copy env template and adjust if needed
cp .env.example .env

# 3. Start Postgres
docker compose up -d postgres

# 4. Push schema to the database (no migrations folder yet, we use `push` in dev)
bun run db:push
```

## Daily dev

```bash
bun run dev           # runs web (:3001) and api (:3000) in parallel
bun run dev:web       # Next.js only
bun run dev:api       # Elysia only (auto-reloads on file change)
```

Open http://localhost:3001, you'll be bounced to `/auth/sign-up` on first visit.

## Common DB commands

```bash
bun run db:push       # sync TypeScript schema → Postgres (dev, destructive)
bun run db:generate   # create a versioned SQL migration file
bun run db:migrate    # apply migrations (prod)
bun run db:studio     # open drizzle-kit studio
```

## Typecheck

```bash
bun run typecheck     # tsc --noEmit across all workspaces
```

## Quality gates

```bash
docker compose up -d postgres
bun run typecheck
bun run test
bun run build
```

If a change touches the shipped learner flow, also run:

```bash
bun run smoke:learner
```

The full branch, validation, push, and PR contract lives in
[docs/ops/autonomous-delivery.md](docs/ops/autonomous-delivery.md).

## Environment variables

See `.env.example`. Required everywhere:

- `DATABASE_URL` — Postgres connection string
- `BETTER_AUTH_SECRET` — 32+ char random string (`openssl rand -base64 32`)
- `BETTER_AUTH_URL` — public base URL of `apps/api` (http://localhost:3000 in dev)
- `WEB_ORIGIN` — public origin of `apps/web`, used for CORS allow-list
- `NEXT_PUBLIC_API_URL` — what the browser uses to reach the API

A single root `.env` is loaded by the api via `bun --env-file=../../.env`, and by Next via a symlink at `apps/web/.env.local → ../../.env`.
