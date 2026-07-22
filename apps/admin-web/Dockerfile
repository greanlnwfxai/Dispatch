# Build context is the repository root (see docker-compose.yml: admin-web.build.context: .)
# because apps/admin-web depends on the npm-workspace packages under packages/*.

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
COPY apps/admin-web ./apps/admin-web

# NEXT_PUBLIC_* vars are inlined into the browser bundle at build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:6002
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build:packages \
 && npm run build --workspace=apps/admin-web

# ── runner ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=6001
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# .next/standalone already contains a minimal, self-sufficient node_modules
# (traced via outputFileTracingRoot) plus a copy of apps/admin-web/server.js.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/admin-web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/admin-web/.next/static ./apps/admin-web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/admin-web/public ./apps/admin-web/public

USER nextjs

EXPOSE 6001

CMD ["node", "apps/admin-web/server.js"]
