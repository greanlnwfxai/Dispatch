# Build context is the repository root (see docker-compose.yml: api.build.context: .)
# because apps/api depends on the npm-workspace packages under packages/*.

# ── deps ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/validation/package.json ./packages/validation/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/test-utils/package.json ./packages/test-utils/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/admin-web/package.json ./apps/admin-web/package.json
COPY apps/mobile-pwa/package.json ./apps/mobile-pwa/package.json

RUN npm ci

# ── builder ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api

# Prisma Client types must exist before `nest build` compiles the
# infrastructure/database layer that imports @prisma/client.
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

RUN npm run build:packages \
 && npm run build --workspace=apps/api

# ── runner ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /repo

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 dispatch \
 && mkdir -p /var/lib/dispatch/evidence \
 && chown -R dispatch:nodejs /var/lib/dispatch

COPY --from=builder --chown=dispatch:nodejs /repo/node_modules ./node_modules
COPY --from=builder --chown=dispatch:nodejs /repo/packages ./packages
COPY --from=builder --chown=dispatch:nodejs /repo/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=dispatch:nodejs /repo/apps/api/package.json ./apps/api/package.json
# Schema + committed migrations + seed.ts — needed at runtime to run
# `prisma migrate deploy` / `prisma db seed` inside this container (see
# scripts/db-verify.sh). No automatic migration/seed/reset runs at
# container startup — CMD below only starts the compiled API.
COPY --from=builder --chown=dispatch:nodejs /repo/apps/api/prisma ./apps/api/prisma

USER dispatch
WORKDIR /repo/apps/api

EXPOSE 3000

CMD ["node", "dist/main.js"]
