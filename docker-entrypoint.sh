#!/bin/sh
# Runs once per container start/restart, before the API process starts.
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set, e.g. file:/data/prod.db}"

echo "[entrypoint] Applying migrations (prisma migrate deploy) against $DATABASE_URL"
# Applies every migration under prisma/migrations this database hasn't seen yet, in order, and
# records each one. Unlike the `prisma db push` it replaced, it is non-interactive by design, a
# destructive change (dropping or renaming a column, an incompatible type change) has a scripted
# path through a hand-written migration instead of needing a human at a prompt, and a database
# whose recorded history doesn't match the shipped migrations is refused rather than guessed at.
#
# A volume created by the old `db push` — anything predating the migration baseline — holds tables
# but no _prisma_migrations history, so this fails with P3005 until it is baselined once by hand.
# See "Baselining an existing database" in DEPLOY.md. The container refusing to start is the
# intended outcome there: that step needs a human to back up /data/prod.db first.
npx prisma migrate deploy --schema=prisma/schema.prisma

echo "[entrypoint] Starting API server"
exec node apps/api/dist/index.js
