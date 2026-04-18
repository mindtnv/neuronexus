# syntax=docker/dockerfile:1.7
# ── API Dockerfile (Bun + Elysia) ──────────────────────────────────────────
# Multi-stage: install workspace deps → bundle → slim runtime image.
# Build from the repo root so bun workspaces resolve `@neuronexus/*` symlinks.
#
#   docker build -f apps/api/Dockerfile -t neuronexus-api:latest .
#
# Runtime env vars (no baked-in defaults — must be passed):
#   DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, WEB_ORIGIN,
#   API_PORT (default 3000), NODE_ENV=production

FROM oven/bun:1.3-alpine AS deps
WORKDIR /repo
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/auth/package.json packages/auth/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

FROM deps AS build
WORKDIR /repo
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/api/ apps/api/
# apps/web isn't needed at runtime, but the api workspace's type-only imports
# from `@neuronexus/api` (eden) don't touch web — safe to skip it.
RUN cd apps/api && bun build src/index.ts --target bun --outdir ./dist --minify

FROM oven/bun:1.3-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV API_PORT=3000
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/packages/db/src/migrations ./migrations
# Baked migrations are referenced by our programmatic migrator if we ever run
# it inside the container (entrypoint script example in docker-compose.prod).
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${API_PORT}/health || exit 1
USER bun
CMD ["bun", "dist/index.js"]
