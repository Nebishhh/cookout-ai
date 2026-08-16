# syntax=docker/dockerfile:1

##### Stage 1: builder — full workspace install (incl. devDependencies) + build #####
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# apps/web's devDependency @playwright/test would otherwise try to download a Chromium
# binary during `npm ci`; nothing in this image ever launches a browser.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# @prisma/client's postinstall (`prisma generate`, triggered by `npm ci` below) probes
# the OS's OpenSSL version to pick which query engine binary to generate. Without
# OpenSSL installed here, it silently guesses wrong (debian-openssl-1.1.x) and the
# mismatch only surfaces as a runtime crash later — install it before `npm ci` runs.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Manifests + Prisma schema first, so the slow `npm ci` layer is cached across
# source-only changes. @prisma/client's postinstall generate step needs
# prisma/schema.prisma present.
COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY prisma ./prisma

# npm workspaces monorepo: install MUST happen at the root with the root lockfile (not
# per-workspace) so shared deps hoist into one node_modules and the three @cookout-ai/*
# packages get linked in as workspace symlinks.
RUN npm ci

# Now the real source, then build (tsc project references handle domain -> api / web
# ordering automatically via `tsc -b`).
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts
RUN npm run build

##### Stage 2: runtime — build output + the builder's already-verified node_modules #####
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Prisma's query engine needs OpenSSL to detect the libssl version at runtime; the slim
# base image doesn't include it. Without this, Prisma falls back to a guessed version
# ("may not work as expected" per its own warning) instead of a hard failure.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# The whole hoisted node_modules from the builder, copied as-is (not reinstalled): it
# already has @prisma/client's generated Linux query engine (matching this image, since
# both stages share the same Debian base) AND the `prisma` CLI, which the entrypoint
# needs for `prisma db push` at every container start.
COPY --from=builder /app/node_modules ./node_modules

# Workspace manifests + build output only — no src/, tests, or .tsbuildinfo files.
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/domain/package.json ./packages/domain/package.json
COPY --from=builder /app/packages/domain/dist ./packages/domain/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/prisma ./prisma
# Only the one-time multi-tenancy backfill script — not smokeTestLiveGemini.js, which is a
# dev-only manual check with no place in a running deployment.
COPY --from=builder /app/scripts/backfillOwnerUser.js ./scripts/backfillOwnerUser.js

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
