#!/bin/sh
# Runs once per container start/restart, before the API process starts.
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set, e.g. file:/data/prod.db}"

echo "[entrypoint] Syncing SQLite schema (prisma db push) against $DATABASE_URL"
# --skip-generate: the Prisma Client was already generated at build time (see Dockerfile);
# no need to regenerate it on every container start.
#
# Deliberately NO --accept-data-loss: db push runs non-interactively here (no TTY), so a
# purely additive schema change (new table/column — the common case) applies automatically
# and idempotently on every start. A genuinely destructive future change (dropping/renaming
# a column, an incompatible type change) makes this command fail loudly instead, and the
# container refuses to start rather than silently discarding data. There is no
# prisma/migrations/ history in this project (see CLAUDE.md) to fall back on for such a
# case — it needs a human to inspect /data/prod.db and handle it by hand.
npx prisma db push --schema=prisma/schema.prisma --skip-generate

echo "[entrypoint] Starting API server"
exec node apps/api/dist/index.js
