# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3-alpine AS deps
WORKDIR /repo
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/auth/package.json packages/auth/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

FROM deps AS runtime
WORKDIR /repo
COPY tsconfig.base.json ./
COPY packages/db/ packages/db/
WORKDIR /repo/packages/db
ENV NODE_ENV=production
CMD ["bun", "run", "src/migrate.ts"]
