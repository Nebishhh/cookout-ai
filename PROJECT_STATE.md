# PROJECT_STATE.md — CookOut AI Comprehensive Technical Handoff

> **Target Audience**: Senior Software Engineer / Technical Architect entering the codebase for the first time.
> **Scope**: Complete, exhaustive technical snapshot of the repository's actual shipped state. This is the single canonical status document — `PROJECT_HANDOFF.md` and `ROADMAP.md` (milestone-numbered snapshots that had drifted out of sync with shipped code) have been retired in favor of this file. Keep it current when you ship a feature that changes the picture described here.

---

# 1. Executive Summary

### Project Purpose

**CookOut AI** is a production-grade full-stack TypeScript application designed for culinary event planning, recipe scaling, dietary group management, consolidated shopping list generation, and AI-assisted recipe import. It solves the real-world domain problem of scaling recipes for varying party sizes and consolidating ingredients across disparate units (mass, volume, count) without precision loss or invalid unit conversions.

### Intended Users

- Home cooks, party hosts, and event organizers planning gatherings for varying guest counts.
- Hosts managing mixed dietary restrictions (omnivore, vegetarian, vegan) across multiple dishes.

### Current Maturity

- **Architectural Status**: all four planned layers are implemented and tested:
  - Pure, food-agnostic domain kernel (`@cookout-ai/domain`) with zero external runtime dependencies.
  - Persisted HTTP REST API (`@cookout-ai/api`) backed by Express and Prisma SQLite, including recipe CRUD, shopping-list generation, guest-group event planning, and Google Gemini-powered recipe import.
  - Accessible, responsive React Web UI (`@cookout-ai/web`) built with shadcn/ui primitives and TanStack Query state management, with three top-level views (Recipes, Shopping List Builder, Event Planner) plus a four-mode AI import flow (text / URL / image upload / camera capture) inside the recipe form.
  - Full automated testing suite: Vitest unit/integration tests across all three workspaces + a Playwright E2E suite (recipe lifecycle, AI import fixture interception, event planning) running against real servers and an isolated database (`prisma/e2e.db`).
- **Test counts** (see §9 for the full breakdown): 190 Vitest tests, 8 Playwright E2E tests, all passing.

### Overall Architecture Philosophy

1. **Domain-Driven Design (DDD)**: Core business rules, unit conversions, recipe scaling, and dietary eligibility logic reside strictly inside an isolated, immutable domain package (`packages/domain`). The domain package depends on nothing outside itself.
2. **Clean Monorepo Boundaries**: The system uses npm workspaces separating `packages/domain` (domain kernel), `apps/api` (infrastructure & HTTP endpoints), and `apps/web` (user interface).
3. **Immutability & Value Objects**: Domain objects (`Quantity`, `Recipe`, `IngredientLine`, `GuestGroup`) are frozen value objects that guarantee validity upon construction and prevent accidental side effects.
4. **Deterministic Calculation Over AI Inference**: All core mathematical scaling, unit conversions, and dietary subgroup filtering are 100% deterministic code, living in `packages/domain`. AI capability (Google Gemini) is scoped entirely to `apps/api`, for structured text extraction from unstructured recipe text/URLs/images — never for core arithmetic or eligibility calculation. AI-imported recipes are never auto-persisted; they return a draft the client must explicitly review and submit.

---

# 2. Technology Stack

| Category                     | Technology                 | Version    | Purpose & Selection Rationale                                                                                                            |
| :--------------------------- | :------------------------- | :--------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| **Language**                 | TypeScript                 | `^5.7.3`   | Strong static typing across monorepo boundaries, preventing null reference errors and signature mismatches.                              |
| **Runtime**                  | Node.js                    | `>=18.0.0` | Standard server-side JavaScript runtime with native ES modules support (`Node16`/`NodeNext`).                                            |
| **Monorepo**                 | npm Workspaces             | Native     | Native package management and workspace linking without third-party monorepo overhead (e.g. Lerna or Nx).                                |
| **Backend Framework**        | Express.js                 | `^4.21.2`  | Minimalist, stable HTTP web framework for routing, middleware handling, and JSON API delivery.                                           |
| **Database**                 | SQLite                     | 3.x        | Zero-configuration file-based relational database (`dev.db`, `test.db`, `e2e.db`). Ideal for rapid development and isolated test suites. |
| **ORM**                      | Prisma                     | `^6.3.1`   | Type-safe database client and auto-generated migrations. Guarantees compile-time type alignment between SQL schema and TypeScript types. |
| **AI**                       | `@google/genai` (Gemini)   | `^2.13.0`  | Structured extraction of recipe drafts from raw text, webpage URLs, and photos; never used for domain arithmetic.                        |
| **HTML parsing**             | Cheerio                    | `^1.2.0`   | Fallback structured-data scraping for URL import when a page lacks machine-readable recipe markup.                                       |
| **Multipart parsing**        | Busboy                     | `^1.6.0`   | Streaming multipart parser for image uploads, enabling size-limit enforcement without buffering the whole file.                          |
| **Frontend UI Framework**    | React                      | `^18.3.1`  | Declarative UI framework for building reactive components.                                                                               |
| **Frontend Build Tool**      | Vite                       | `^6.1.0`   | Ultra-fast HMR dev server and optimized Rollup production bundler.                                                                       |
| **State & Data Fetching**    | TanStack Query             | `^5.101.4` | Automatic caching, stale-time management, background refetching, and mutation cache invalidation (`['recipes']`).                        |
| **Styling**                  | Tailwind CSS               | `^3.4.17`  | Utility-first CSS framework for design system enforcement.                                                                               |
| **UI Components**            | shadcn/ui (Radix + Lucide) | Custom     | Accessible-by-default primitives (`Button`, `Card`, `Input`, `Label`, `Select`, `Checkbox`).                                             |
| **Icons**                    | Lucide React               | `^0.475.0` | Clean, accessible vector icon set.                                                                                                       |
| **Unit/Integration Testing** | Vitest                     | `^3.0.5`   | Native ESM test runner with JSDom support for React Testing Library and Supertest API tests.                                             |
| **E2E Testing**              | Playwright                 | `^1.61.1`  | Full-stack browser automation testing driving real frontend/backend servers and isolated DB, with Gemini fixture interception.           |
| **Linting**                  | ESLint + `jsx-a11y`        | `^9.20.1`  | Strict JavaScript/TypeScript linting with automated accessibility checks.                                                                |
| **Formatting**               | Prettier                   | `^3.5.1`   | Code style consistency across all workspace files.                                                                                       |
| **Git Hooks**                | Husky + lint-staged        | `^9.1.7`   | Pre-commit formatting and linting enforcement.                                                                                           |

---

# 3. Repository Structure

```
cookout-ai/
├── .github/workflows/ci.yml        # GitHub Actions CI (format, lint, typecheck, vitest, build, e2e)
├── CLAUDE.md                       # Guidance for Claude Code when working in this repo
├── .claude/skills/                 # Project skills (vendored + installed via `npx skills add`)
├── apps/
│   ├── api/                        # Express HTTP API application workspace
│   │   ├── src/
│   │   │   ├── __fixtures__/       # Recorded Gemini response fixtures (USE_GEMINI_FIXTURES=true)
│   │   │   ├── middleware/errorHandler.ts
│   │   │   ├── app.ts              # Express app setup, CORS, JSON parsing, all route definitions
│   │   │   ├── geminiClient.ts     # Gemini API client, fixture interception, production guard
│   │   │   ├── ssrfGuard.ts        # SSRF protection for URL-import fetches
│   │   │   ├── imageValidator.ts   # Streaming Busboy size limit + magic-byte sniffing
│   │   │   ├── importText.ts / importUrl.ts / importImage.ts  # AI import route handlers
│   │   │   ├── index.ts            # HTTP server listener (port 3001)
│   │   │   ├── prisma.ts           # Shared PrismaClient singleton instance
│   │   │   └── recipeMapper.ts     # Mappers converting Prisma models <-> Domain entities
│   │   └── package.json
│   └── web/                        # Vite + React web application workspace
│       ├── e2e/                    # Playwright specs: recipe-lifecycle, ai-import, event-planner
│       ├── src/
│       │   ├── components/
│       │   │   ├── ui/             # shadcn UI primitives (Button, Card, Input, etc.)
│       │   │   ├── Navigation.tsx  # Tab switcher: Recipes / Shopping List / Event Planner
│       │   │   ├── RecipeForm.tsx  # Recipe create/edit form + 4-mode AI import (text/url/image/camera)
│       │   │   ├── RecipeList.tsx
│       │   │   ├── ShoppingListBuilder.tsx
│       │   │   └── EventPlanner.tsx
│       │   ├── lib/                # api.ts (HTTP client), queries.ts (TanStack Query hooks), formatQuantity.ts, utils.ts
│       │   └── App.tsx
│       ├── playwright.config.ts    # Isolated ports 3010/3011, e2e.db
│       └── package.json
├── docs/
│   ├── adr/0001-monorepo-architecture.md
│   ├── agents/                     # Config consumed by the Matt Pocock engineering skills
│   ├── ideas/practical-scaling.md  # Design doc for v2 non-linear rounding heuristics (not yet built)
│   └── glossary.md
├── packages/domain/                 # Pure TypeScript Domain Package (@cookout-ai/domain)
│   └── src/
│       ├── errors.ts               # DomainError hierarchy
│       ├── events/                 # GuestGroup, computeEligibleServings, planEventShoppingList
│       ├── recipes/                # Recipe, IngredientLine, scaleRecipe
│       ├── shopping/               # ShoppingListItem, consolidateShoppingList
│       ├── units/                  # Quantity value object, unit registry
│       └── index.ts                # Public domain exports
├── prisma/
│   ├── schema.prisma                # Recipe & IngredientLine models
│   ├── dev.db / test.db / e2e.db    # gitignored SQLite files
├── scripts/smokeTestLiveGemini.js   # Manual live-API schema-drift check (documented in README, not in CI)
├── package.json                     # Root workspace configuration
└── vitest.config.ts                 # Vitest workspace config (`projects: ['apps/*', 'packages/*']`)
```

---

# 4. Domain Model

```
                    ┌─────────────────────────────────┐
                    │            GuestGroup           │
                    ├─────────────────────────────────┤
                    │ totalGuests: number             │
                    │ vegetarianCount: number         │
                    │ veganCount: number              │
                    │ omnivoreCount: number (derived) │
                    └─────────────────────────────────┘
                                     │
                                     ▼
┌───────────────────────────┐      ┌───────────────────────────┐
│          Recipe           │ ───> │  computeEligibleServings  │
├───────────────────────────┤      └───────────────────────────┘
│ id: string                │                │
│ name: string              │                ▼
│ baseServings: number      │      ┌───────────────────────────┐
│ dietaryTags: DietaryTag[] │      │        scaleRecipe        │
│ ingredients: Line[]       │      └───────────────────────────┘
└───────────────────────────┘                │
              │                              ▼
              ▼                    ┌───────────────────────────┐
┌───────────────────────────┐      │   consolidateShoppingList │
│      IngredientLine       │      └───────────────────────────┘
├───────────────────────────┤                │
│ ingredientId: string      │                ▼
│ displayName: string       │      ┌───────────────────────────┐
│ quantity: Quantity        │      │         EventPlan         │
└───────────────────────────┘      └───────────────────────────┘
              │
              ▼
┌───────────────────────────┐
│         Quantity          │
├───────────────────────────┤
│ amount: number            │
│ unit: string              │
│ category: UnitCategory    │
└───────────────────────────┘
```

### 1. `Quantity`

- **Purpose**: Represents an immutable numerical measurement bound to a specific physical unit (e.g. `2 cup`, `500 g`, `3 count`).
- **Responsibilities**: Performs unit validation, category lookup, arithmetic addition, unit conversions, and string formatting.
- **Validation Rules**: `amount` must be a non-negative finite number. `unit` must exist in the static unit registry (`units.ts`).
- **Immutability**: Enforced via `Object.freeze(this)`. Operations like `.add()` or `.convertTo()` return brand-new `Quantity` instances.
- **Limitations**: Food-agnostic. Does not know that `1 egg` weighs `50 g` or that `1 cup flour` equals `120 g` (volume-to-mass conversions across categories are rejected).

### 2. `Recipe`

- **Purpose**: Represents an immutable culinary recipe definition.
- **Responsibilities**: Holds metadata (`id`, `name`, `baseServings`), dietary tags (`Vegetarian`, `Vegan`), and an ordered list of `IngredientLine` objects.
- **Validation Rules**: `id` and `name` must be non-empty strings. `baseServings` must be a positive integer (> 0). `ingredients` must be a non-empty array of `IngredientLine` instances.
- **Immutability**: Enforced via `Object.freeze(this)` and `Object.freeze([...ingredients])`.
- **Limitations**: Duplicate `ingredientId`s within a single recipe are allowed. Does not store step-by-step cooking instructions.

### 3. `IngredientLine`

- **Purpose**: Represents a specific ingredient requirement within a recipe.
- **Responsibilities**: Pairs a unique ingredient identifier (`ingredientId`, e.g. `"flour"`), a human-friendly label (`displayName`, e.g. `"All-Purpose Flour"`), and a measured `Quantity`.
- **Validation Rules**: `ingredientId` and `displayName` must be non-empty strings. `quantity` must be a valid `Quantity` instance.
- **Immutability**: Enforced via `Object.freeze(this)`.

### 4. `GuestGroup`

- **Purpose**: Represents an event guest list and its dietary breakdown.
- **Responsibilities**: Enforces dietary subset invariants and calculates the derived omnivore count.
- **Validation Rules**: `totalGuests` must be a positive integer (> 0). `vegetarianCount` and `veganCount` must be non-negative integers. Enforces `0 <= veganCount <= vegetarianCount <= totalGuests`.
- **Immutability**: Enforced via `Object.freeze(this)`.

### 5. `ScaledRecipe`

- **Purpose**: Represents the output of scaling a `Recipe` to a target serving count.
- **Responsibilities**: Holds `sourceRecipeId`, `sourceRecipeName`, `targetServings`, `scaleFactor`, scaled `ingredients`, and inherited `dietaryTags`.
- **Immutability**: Readonly interface.

### 6. `ShoppingListItem`

- **Purpose**: Represents a merged ingredient line item in a consolidated shopping list.
- **Responsibilities**: Holds `ingredientId`, `displayName` (first-seen wins), consolidated `quantity`, and an array of `sourceRecipeIds` contributing to the total.
- **Immutability**: Readonly interface.

### 7. `EventPlan`

- **Purpose**: Represents the complete output of an event planning calculation (`planEventShoppingList`).
- **Responsibilities**: Encapsulates the input `GuestGroup`, arrays of `includedRecipes` and `excludedRecipes` (with exclusion reasons), and the final `shoppingList`.
- **Immutability**: Enforced via `Object.freeze()`.

---

# 5. Domain Services

### 1. `scaleRecipe(recipe: Recipe, targetServings: number): ScaledRecipe`

- **Algorithm**: Validates `targetServings` (must be positive integer > 0); `scaleFactor = targetServings / recipe.baseServings`; maps each `IngredientLine` to `quantity = line.quantity.multiply(scaleFactor)`.
- **Business Rules**: `scaleRecipe(recipe, 0)` is strictly rejected (throws `InvalidRecipeError`).
- **Time Complexity**: $O(N)$ where $N$ is the number of ingredient lines.

### 2. `computeEligibleServings(recipe: Recipe, guestGroup: GuestGroup): number`

- **Algorithm**: Vegan-tagged recipes → all guests eligible. Vegetarian-tagged → `totalGuests - veganCount`. Untagged → `omnivoreCount` (`totalGuests - vegetarianCount`).
- **Time Complexity**: $O(1)$.

### 3. `consolidateShoppingList(scaledRecipes: ScaledRecipe[]): ShoppingListItem[]`

- **Algorithm**: Groups ingredient lines by `ingredientId`; accumulates quantities via `Quantity.add()` (auto-converting same-category units); tracks unique `sourceRecipeIds` per item.
- **Edge Cases**: Cross-category addition (e.g. `500 g` + `2 cup`) throws `UnitMismatchError`.
- **Time Complexity**: $O(R \times I)$ where $R$ is recipe count, $I$ is average ingredients per recipe.

### 4. `planEventShoppingList(recipes: Recipe[], guestGroup: GuestGroup): EventPlan`

- **Algorithm**: For each recipe, computes `eligibleServings`; excludes 0-eligible recipes with a reason; scales and includes the rest; consolidates all included recipes into one shopping list.
- **Time Complexity**: $O(R \times I)$.

---

# 6. Business Rules

### Unit & Quantity Rules

1. **Unit Registry Boundaries**: `Mass` (`g`, `kg`, `oz`, `lb`), `Volume` (`ml`, `l`, `tsp`, `tbsp`, `cup`, `fl oz`), `Count` (`count`, `clove`, `egg`, `onion`).
2. **Category Isolation**: Arithmetic across categories throws `UnitMismatchError`.
3. **Primary Base Conversion**: Volume converts via `ml`; mass converts via `g`.

### Recipe & Scaling Rules

1. Base servings must be a positive integer.
2. Ingredient amounts scale linearly ($A_{\text{target}} = A_{\text{base}} \times \frac{S_{\text{target}}}{S_{\text{base}}}$).
3. Scaling to 0 servings is forbidden.

### Dietary Subset & Event Planning Rules

1. **Subset Hierarchy**: `0 <= veganCount <= vegetarianCount <= totalGuests`.
2. Vegan dishes feed 100% of guests. Vegetarian dishes feed `totalGuests - veganCount`. Untagged recipes feed only `totalGuests - vegetarianCount`.
3. Dishes with 0 eligible guests are excluded from scaling and shopping-list calculations.

---

# 7. Error Model

All domain errors inherit from `DomainError` in `packages/domain/src/errors.ts`.

| Error Class              | Thrown When                                                                                         | Example Scenario                                                         |
| :----------------------- | :-------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| `InvalidQuantityError`   | Amount is negative, NaN, or non-finite.                                                             | `Quantity.create(-5, 'g')`                                               |
| `InvalidUnitError`       | Unit string is not registered in `units.ts`.                                                        | `Quantity.create(1, 'invalid_unit')`                                     |
| `UnitMismatchError`      | Attempting arithmetic across incompatible unit categories.                                          | `qtyGrams.add(qtyCups)`                                                  |
| `InvalidRecipeError`     | Recipe ID/name is empty, baseServings $\le 0$, or ingredient list is empty.                         | `new Recipe('r1', '', 4, [])`                                            |
| `InvalidGuestGroupError` | Guest count rules are violated (`veganCount > vegetarianCount` or `vegetarianCount > totalGuests`). | `new GuestGroup({ totalGuests: 10, vegetarianCount: 2, veganCount: 5 })` |

Typed errors let callers (`Express` error middleware, React form handlers) `instanceof`-check and map domain violations directly to HTTP status codes or UI validation messages without parsing strings.

---

# 8. Public API (`packages/domain/src/index.ts`)

```typescript
export * from './errors.js';
export * from './units/index.js';
export * from './recipes/index.js';
export * from './shopping/index.js';
export * from './events/index.js';

export const DOMAIN_PACKAGE_NAME = '@cookout-ai/domain';
```

There is no AI-related export from the domain package — Gemini integration lives entirely in `apps/api` (see §10), consistent with the "deterministic domain, AI at the edge" rule in §1.

---

# 9. Testing

### Testing Strategy & Frameworks

- **Vitest**: Monorepo unit and integration test runner (`projects: ['apps/*', 'packages/*']`).
- **React Testing Library**: Frontend UI component testing with JSDom.
- **Supertest**: Express HTTP API integration testing.
- **Playwright**: End-to-end browser automation testing.

### Current Test Suite Numbers

- **Total Vitest Tests**: **190 passing tests** across 11 test files, spanning `packages/domain` (units/recipes/shopping/events), `apps/api` (health, recipe CRUD, shopping-list, event-plan, AI import text/URL/image), and `apps/web` (App, formatQuantity).
- **Playwright E2E Tests**: **8 passing tests** across 3 spec files — `recipe-lifecycle.spec.ts` (full CRUD + shopping list math), `ai-import.spec.ts` (fixture-intercepted text/URL/image/camera import + a failure-path case), `event-planner.spec.ts` (happy path + 400 validation).
- **Vitest cross-file isolation**: `apps/api`'s test files share one physical SQLite file (`prisma/test.db`) via the root `DATABASE_URL`. The root `vitest.config.ts` sets `fileParallelism: false` so all test files run serially rather than racing (a per-project setting in `apps/api/vitest.config.ts` alone is not honored by the root `projects` orchestrator); every file that mutates `Recipe`/`IngredientLine` also resets those tables in a `beforeEach` as defense in depth.

### Confidence Level

**High**. Unit tests verify exact mathematical and error invariants. API integration tests verify HTTP response codes and database persistence against SQLite. Playwright E2E tests verify real end-to-end network proxying, database mutations, DOM rendering, and Gemini-fixture-driven AI import flows against a running stack (`:3010`/`:3011`, `e2e.db`).

---

# 10. API Layer (`apps/api`)

### Express Endpoints

| Method   | Endpoint                    | Description                                                                                          |
| :------- | :-------------------------- | :--------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/health`               | Health check                                                                                         |
| `POST`   | `/api/recipes/import-text`  | Gemini-parsed recipe draft from raw pasted text                                                      |
| `POST`   | `/api/recipes/import-url`   | Gemini-parsed recipe draft from a webpage URL (SSRF-guarded, Cheerio fallback scraping)              |
| `POST`   | `/api/recipes/import-image` | Gemini-parsed recipe draft from an uploaded photo (Busboy streaming, 8MB limit, magic-byte sniffing) |
| `POST`   | `/api/recipes`              | Create a new recipe                                                                                  |
| `GET`    | `/api/recipes`              | Fetch all saved recipes                                                                              |
| `GET`    | `/api/recipes/:id`          | Fetch recipe by ID                                                                                   |
| `PUT`    | `/api/recipes/:id`          | Full replace update recipe                                                                           |
| `DELETE` | `/api/recipes/:id`          | Delete recipe (cascade delete ingredient lines)                                                      |
| `POST`   | `/api/shopping-list`        | Generate a consolidated shopping list across recipes                                                 |
| `POST`   | `/api/events/plan`          | Guest-group event plan: eligible servings + consolidated list                                        |

None of the `import-*` endpoints persist to the database — they return a draft `CreateRecipeInput`-shaped payload for the client to review and submit via `POST /api/recipes`.

### Request Flow Into Domain (recipe CRUD)

1. Express route handler receives JSON request.
2. Handler passes raw body to `validateAndCreateDomainRecipe(req.body, id)` in `recipeMapper.ts`.
3. Domain constructors (`Quantity`, `IngredientLine`, `Recipe`) validate; a `DomainError` becomes `400 Bad Request` before touching the database.
4. `prisma.$transaction()` performs the atomic SQLite write.
5. The updated Prisma model is mapped back to a domain entity via `toDomainRecipe()` and returned as JSON.

### AI Import Pipeline

`geminiClient.ts` is the single integration point with `@google/genai`. It supports fixture interception (`USE_GEMINI_FIXTURES=true`, backed by `src/__fixtures__/recordedGeminiFixtures.ts`) so E2E tests and local dev never need a live API key or incur API cost; `checkProductionGuard()` throws at startup if fixtures are enabled with `NODE_ENV=production`. `importUrl.ts` fetches user-supplied URLs behind `ssrfGuard.ts` (blocks internal/private network targets) with a 2MB decompressed-size cap and a 30s timeout; `importImage.ts` validates uploads via streaming Busboy parsing and magic-byte header sniffing (not just file extension) before ever calling Gemini.

---

# 11. Frontend (`apps/web`)

### Architecture & Screens

Single-page React app (`App.tsx`) with three top-level tabs, synced to `window.location.hash`:

1. **Recipes (`#recipes`)**:
   - `RecipeForm.tsx` — dual-purpose creation/edit form, plus a 4-mode AI import flow (Text / URL / Image / Camera) that pre-fills the form from a Gemini draft for human review before submission. Camera mode uses a dedicated file input with `capture="environment"` for fast mobile photo capture.
   - `RecipeList.tsx` — recipe card grid with Edit/Delete actions.
2. **Shopping List Builder (`#shopping-list`)**: `ShoppingListBuilder.tsx` — multi-recipe selector with per-recipe target servings, generating a consolidated list.
3. **Event Planner (`#event-planner`)**: `EventPlanner.tsx` — guest-group input (total/vegetarian/vegan counts) against saved recipes, calling `POST /api/events/plan` and rendering included/excluded recipes plus the consolidated event shopping list.

### State Management & Navigation

- **URL Hash Synchronization**: `currentTab` syncs with `window.location.hash`.
- **TanStack Query**: `useRecipes()` shares query key `['recipes']`. Mutations invalidate `['recipes']` on success.

---

# 12. Features NOT Yet Built

These are genuinely still open — not implemented anywhere in the codebase as of this writing:

- **Pantry Inventory Subtraction**: Deducting on-hand pantry items from a generated shopping list.
- **Cost Estimation**: Price estimates on shopping list items.
- **Recipe Search & Filter UI**: Filtering saved recipes by name or dietary tags.
- **Optimistic UI Updates**: Instantly updating the TanStack Query cache before network requests resolve.
- **Practical Scaling Heuristics (v2)**: Non-linear rounding for indivisible ingredients (e.g. recommending 1 whole egg instead of 0.25 egg) — documented in `docs/ideas/practical-scaling.md`.
- **Auth & Multi-Tenancy**: No user login; all recipes are global and shared in one SQLite database.

---

# 13. Open Design Decisions

1. **Duplicate Ingredient IDs in a Single Recipe**: Allowed in the domain `Recipe` constructor. Deduplication happens during `consolidateShoppingList()`.
2. **Dietary Tag Storage in SQLite**: Stored as a JSON string (`dietaryTagsJson`) on the `Recipe` table and parsed at the API boundary, since SQLite has no native array column type.
3. **Full-Group Serving Scaling in Event Planning**: Each eligible recipe scales to 100% of its eligible guest count (e.g. two vegetarian mains both scale to the full vegetarian count). Per-guest dish-splitting is deferred to a future UI workflow.

---

# 14. ADR Summary

### ADR 0001: Monorepo Architecture

- **Decision**: Adopt npm workspaces with three packages (`packages/domain`, `apps/api`, `apps/web`).
- **Rationale**: Strict separation of concerns; `packages/domain` has zero framework dependencies and could be published or reused independently.
- **Tradeoffs**: Requires path mapping and module resolution configuration across workspaces.

---

# 15. Technical Debt

| Debt                                  | Severity | Impact                                                                                 | Mitigation Plan                                                           |
| :------------------------------------ | :------- | :------------------------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| **JSON Column for Dietary Tags**      | Low      | `dietaryTagsJson` string column in Prisma SQLite requires manual JSON parse/serialize. | Migrate to a normalized join table if the database ever moves off SQLite. |
| **No Authentication / Multi-Tenancy** | Medium   | All recipes in SQLite are global and shared.                                           | Add user authentication and a `userId` foreign key on `Recipe`.           |
| **Unbounded List Fetching**           | Low      | `GET /api/recipes` returns all recipes without pagination.                             | Implement cursor-based pagination once recipe count exceeds ~100.         |

---

# 16. Performance

- **Unit Conversions & Consolidation**: $O(N)$ linear complexity, sub-millisecond for realistic ingredient counts.
- **SQLite Database I/O**: Local disk reads/writes resolve in single-digit milliseconds per request.
- **TanStack Query Caching**: Eliminates redundant network requests when switching tab views.

---

# 17. Security

- **Current Security Posture**: Safe for local and single-user deployment; not yet hardened for multi-tenant production use.
- **Validation**: All incoming API payloads pass strict domain validation before reaching Prisma/SQLite.
- **AI Import Hardening**: SSRF guard on URL import (blocks internal/private network targets); streaming size limits + magic-byte sniffing on image upload (not just extension/MIME trust); Gemini fixture interception has a hard production guard so recorded fixtures can never leak into a production response.
- **Risks**: No authentication middleware, authorization checks, or rate limiting currently implemented.

---

# 18. Current Assessment

- **Strengths**: Outstanding domain isolation, immutable value objects throughout, clean monorepo boundaries, comprehensive automated test coverage (190 Vitest + 8 Playwright E2E), strict TypeScript typing, deterministic-domain/AI-at-the-edge separation maintained even as the AI import surface grew to four input modes.
- **Weaknesses**: Lack of authentication and pagination; no pantry/cost-estimation features yet.
- **Maintainability**: Excellent — modular architecture and thorough tests make adding new features straightforward and safe.
