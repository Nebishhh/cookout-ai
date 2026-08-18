# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root unless noted (npm workspaces).

```bash
npm run dev                                   # api (:3001) + web (:3000) concurrently
npm run build                                  # tsc -b across all workspaces
npm run typecheck                              # tsc -b --noEmit-equivalent project-reference check
npm run lint / npm run lint:fix                # ESLint flat config, whole repo
npm run format / npm run format:check          # Prettier, whole repo
npm test                                       # Vitest: domain + api + web (see gotcha below)
npm run test:e2e                               # Playwright, isolated ports 3010/3011 + prisma/e2e.db
```

Single-workspace / single-file runs:

```bash
npx vitest run src/app.test.ts --dir apps/api  # one API test file
npm --workspace=apps/api run test              # one workspace's Vitest suite
npm --workspace=apps/web run dev -- --host     # web dev server bound for LAN/mobile testing
npx tsx --env-file=apps/api/.env scripts/smokeTestLiveGemini.ts   # manual live Gemini schema-drift check (not in CI, costs real API calls)
```

Prisma (`prisma/schema.prisma` is the single schema for both `dev.db` and test DBs):

```bash
npx prisma db push --schema=prisma/schema.prisma
```

### Vitest cross-workspace test isolation

The root `vitest.config.ts` uses Vitest's `projects` feature (`apps/*`, `packages/*`) and injects one shared `DATABASE_URL` (`prisma/test.db`) via env for every project. `apps/api`'s test files therefore share a single physical SQLite file. The root config sets `test.fileParallelism: false` to serialize file execution across the whole run — this has to live in the **root** config, not just `apps/api/vitest.config.ts`: a per-project `fileParallelism: false` is silently ignored by the root `projects` orchestrator's shared worker pool (verified empirically — the per-project-only setting still raced; only setting it at root fixed it). If you add a new `apps/api/src/*.test.ts` file that touches the `Recipe`/`IngredientLine` tables, give it the same `beforeEach` cleanup pattern already used in `app.test.ts` — don't rely on file-run-order luck.

E2E tests use a separate, fully isolated `prisma/e2e.db` (wiped at the start of `npm run test:e2e`) and run with `USE_GEMINI_FIXTURES=true`, so they don't share this DB or make live AI calls.

## Architecture

Three-workspace monorepo with a strict dependency direction: `packages/domain` → `apps/api` → `apps/web` (web talks to api over HTTP, not by importing it).

- **`packages/domain`** — pure TypeScript, zero runtime dependencies, zero framework awareness. All business rules live here: `Quantity`/unit conversion (`units/`), `Recipe`/`IngredientLine`/`scaleRecipe` (`recipes/`), `consolidateShoppingList` (`shopping/`), `GuestGroup`/`computeEligibleServings`/`planEventShoppingList` (`events/`). Domain objects are immutable value objects that validate on construction (`errors.ts` has the `DomainError` hierarchy). All arithmetic (scaling, unit conversion, dietary eligibility) is deterministic code here — never delegated to the AI layer. If you're tempted to put business logic in `apps/api`, it almost certainly belongs in `packages/domain` instead.
- **`apps/api`** — Express + Prisma/SQLite. `app.ts` wires routes; `recipeMapper.ts` converts between Prisma rows and domain objects at the persistence boundary (dietary tags are stored as a JSON string column and parsed here, since SQLite has no native array type). The AI import surface (`importText.ts`, `importUrl.ts`, `importImage.ts`) all funnel through `geminiClient.ts`, which supports fixture interception via `USE_GEMINI_FIXTURES` (backed by `src/__fixtures__/recordedGeminiFixtures.ts`) for deterministic E2E/dev runs, with a `checkProductionGuard()` that hard-fails if fixtures are ever enabled with `NODE_ENV=production`. `importUrl.ts` fetches arbitrary user-supplied URLs, so `ssrfGuard.ts` validates/blocks internal-network targets before fetching, and `imageValidator.ts` does streaming Busboy size limits + magic-byte sniffing (not just extension checks) for image uploads. AI-imported recipes are never auto-persisted — they return a draft for the client to review and explicitly submit.
- **`apps/web`** — React 18 + Vite + TanStack Query + Tailwind/shadcn primitives (`components/ui/`). Feature components (`RecipeForm`, `RecipeList`, `EventPlanner`, `ShoppingListBuilder`, `Navigation`) live in `components/`; `lib/api.ts` is the typed HTTP client, `lib/queries.ts` holds the TanStack Query hooks. Vite proxies `/api` to `http://localhost:3001` in dev.

## Agent skills

### Issue tracker

GitHub Issues on `github.com/Nebishhh/cookout-ai`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `docs/adr/` at the repo root, `docs/glossary.md` for domain vocabulary, no `CONTEXT.md` yet (created lazily by `/domain-modeling`). See `docs/agents/domain.md`.

## Status doc

`PROJECT_STATE.md` is the single canonical status/architecture snapshot — keep it in sync when shipping a feature that changes the picture; don't let it drift the way the old `PROJECT_HANDOFF.md`/`ROADMAP.md` did (both were superseded and removed for describing already-shipped features as future work).
