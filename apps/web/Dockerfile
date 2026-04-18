# syntax=docker/dockerfile:1.7
# ── Web Dockerfile (Next.js 16 standalone) ────────────────────────────────
# Build from the repo root so bun workspaces resolve `@neuronexus/*`.
#
#   docker build -f apps/web/Dockerfile -t neuronexus-web:latest .

FROM oven/bun:1.3-alpine AS deps
WORKDIR /repo
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/auth/package.json packages/auth/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

FROM deps AS build
WORKDIR /repo
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/
COPY apps/api/ apps/api/
# Next.js ships a tiny runtime if we configure `output: 'standalone'` in
# next.config.ts — see next.config.ts. This makes the final image ~120 MB
# instead of ~800 MB.
WORKDIR /repo/apps/web
RUN bun run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3001
USER node
CMD ["node", "apps/web/server.js"]
