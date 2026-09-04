# AGENTS.md

All guidance for coding agents working in this repository lives in a single file: **[`CLAUDE.md`](./CLAUDE.md)**.

Read it before making any changes. It covers:

- **Commands** — dev/build/typecheck/lint/format/test, single-workspace and single-file runs, Prisma schema push.
- **Vitest cross-workspace test isolation** — the shared `prisma/test.db` and the root-level `fileParallelism: false` requirement. Read this before adding an `apps/api/src/*.test.ts` file.
- **Architecture** — the `packages/domain` → `apps/api` → `apps/web` dependency direction, and why business logic belongs in the domain package.
- **Agent skills** — issue tracker (GitHub Issues via `gh`), triage labels, domain docs.
- **Status doc** — `PROJECT_STATE.md` is the canonical status/architecture snapshot; keep it in sync.

This file exists so agents that look for `AGENTS.md` by convention find their way there. Keep the guidance itself in `CLAUDE.md` only — don't duplicate it here, or the two will drift.
