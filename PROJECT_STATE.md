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
  - Persisted HTTP REST API (`@cookout-ai/api`) backed by Express and Prisma SQLite, including recipe CRUD (with step-by-step instructions), persisted "recompute live" event planning, persisted checkable shopping lists (standalone or event-linked, grouped by grocery category), and Google Gemini-powered recipe import (ingredients + instructions).
  - Accessible, responsive React Web UI (`@cookout-ai/web`) built with shadcn/ui primitives and TanStack Query state management, with three top-level views (Recipes, Shopping List Builder, Event Planner) plus a four-mode AI import flow (text / URL / image upload / camera capture) inside the recipe form. The Shopping List and Event Planner views each run in two modes — build/plan a fresh one, or select a saved one from a sibling list component to view/edit/check off/delete. Every consolidated shopping list (preview or saved) renders grouped under grocery-aisle category headers (Produce, Meat, Dairy, etc.).
  - Full automated testing suite: Vitest unit/integration tests across all three workspaces + a Playwright E2E suite (recipe lifecycle, AI import fixture interception, event planning) running against real servers and an isolated database (`prisma/e2e.db`).
- **Test counts** (see §9 for the full breakdown): 277 Vitest tests, 8 Playwright E2E tests, all passing.

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
│   │   │   └── recipeMapper.ts     # Mappers converting Prisma Recipe/RecipeStep <-> Domain entities
│   │   ├── eventMapper.ts      # Mappers converting Prisma Event <-> Domain Event; serializeEventPlan() shared by the ephemeral preview route and every persisted Event route
│   │   ├── shoppingListMapper.ts # Mappers converting Prisma ShoppingList/ShoppingListItem <-> Domain ShoppingList
│   │   └── categoryOverrides.ts  # Manual grocery-category corrections (IngredientCategoryOverride table), applied at the JSON-serialization boundary
│   │   └── package.json
│   └── web/                        # Vite + React web application workspace
│       ├── e2e/                    # Playwright specs: recipe-lifecycle, ai-import, event-planner
│       ├── src/
│       │   ├── components/
│       │   │   ├── ui/             # shadcn UI primitives (Button, Card, Input, etc.)
│       │   │   ├── Navigation.tsx  # Tab switcher: Recipes / Shopping List / Event Planner
│       │   │   ├── RecipeForm.tsx  # Recipe create/edit form + ingredients + ordered step editor (add/remove/reorder) + 4-mode AI import (text/url/image/camera)
│       │   │   ├── RecipeList.tsx
│       │   │   ├── ShoppingListBuilder.tsx  # Two modes: build a fresh list (unchanged ephemeral preview + "Save Shopping List"), or view/check-off/delete a saved one
│       │   │   ├── SavedShoppingLists.tsx   # Card grid of saved lists (mirrors RecipeList/EventList), sibling to ShoppingListBuilder
│       │   │   ├── EventPlanner.tsx  # Two modes: plan/preview a fresh event (unchanged ephemeral preview + "Save Event"), or view/update/delete a saved one + Save/Regenerate/View Shopping List
│       │   │   └── EventList.tsx     # Card grid of saved events, sibling to EventPlanner
│       │   ├── lib/                # api.ts (HTTP client), queries.ts (TanStack Query hooks), formatQuantity.ts, groceryCategories.ts (category display order + grouping helper), utils.ts
│       │   └── App.tsx             # Lifts selectedEventId/selectedShoppingListId (nullable-selected-entity pattern, same as editingRecipe) + cross-tab handoff from an event to its linked shopping list
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
│       ├── events/                 # GuestGroup, computeEligibleServings, planEventShoppingList, Event (persisted)
│       ├── recipes/                # Recipe, IngredientLine, RecipeStep, scaleRecipe
│       ├── shopping/               # ShoppingListItem (computed), consolidateShoppingList, ShoppingList + ShoppingListLine (persisted), GroceryCategory + categorizeIngredient (deterministic aisle-grouping heuristic)
│       ├── units/                  # Quantity value object, unit registry
│       └── index.ts                # Public domain exports
├── prisma/
│   ├── schema.prisma                # Recipe, IngredientLine, RecipeStep, Event, ShoppingList, ShoppingListItem, IngredientCategoryOverride models
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
- **Validation Rules**: `id` and `name` must be non-empty strings. `baseServings` must be a positive integer (> 0). `ingredients` must be a non-empty array of `IngredientLine` instances. `steps` (optional, defaults to `[]`) must be an array of `RecipeStep` instances if provided — unlike `ingredients`, a recipe may have zero steps (an instruction-less recipe is a normal, valid, incremental state).
- **Immutability**: Enforced via `Object.freeze(this)`, `Object.freeze([...ingredients])`, and `Object.freeze([...steps])`.
- **Limitations**: Duplicate `ingredientId`s within a single recipe are allowed.

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
- **Responsibilities**: Holds `ingredientId`, `displayName` (first-seen wins), consolidated `quantity`, an array of `sourceRecipeIds` contributing to the total, and a derived `category: GroceryCategory` (see entry 12) for aisle-grouped display.
- **Immutability**: Readonly interface.

### 7. `EventPlan`

- **Purpose**: Represents the complete output of an event planning calculation (`planEventShoppingList`).
- **Responsibilities**: Encapsulates the input `GuestGroup`, arrays of `includedRecipes` and `excludedRecipes` (with exclusion reasons), and the final `shoppingList`.
- **Immutability**: Enforced via `Object.freeze()`.

### 8. `RecipeStep`

- **Purpose**: Represents a single ordered cooking instruction within a recipe.
- **Responsibilities**: Holds `instruction` (plain text). Ordering is implicit in array position within `Recipe.steps` — the class itself has no `position` field (that only exists at the Prisma persistence layer), mirroring `IngredientLine`.
- **Validation Rules**: `instruction` must be a non-empty string.
- **Immutability**: Enforced via `Object.freeze(this)`.
- **Design note**: Deliberately holds only text today (no duration/temperature/notes) so those fields can be added later without a schema change.

### 9. `Event` (persisted)

- **Purpose**: A saved event plan's _inputs_ — name, guest group, and selected recipe ids.
- **Responsibilities**: Holds `id`, `name`, `guestGroup: GuestGroup`, `recipeIds: string[]`.
- **Validation Rules**: `id`/`name` non-empty strings; `guestGroup` must be a `GuestGroup` instance; `recipeIds` must be an array of non-empty strings (may be empty — an event can be saved before its menu is filled in).
- **Immutability**: Enforced via `Object.freeze(this)` and `Object.freeze([...recipeIds])`.
- **Critical design decision — "recompute live"**: `Event` stores only its inputs, never a computed plan. Every read recomputes the plan fresh via `planEventShoppingList()`. Editing a recipe's ingredients retroactively changes every event that references it; a `recipeId` that no longer resolves to a `Recipe` is tolerated (dropped at the API layer, not a domain-layer concern — see §10).

### 10. `ShoppingListLine`

- **Purpose**: A single persisted, checkable line item within a saved `ShoppingList` — the identity-bearing, mutable-over-time counterpart to the computed `ShoppingListItem`.
- **Responsibilities**: Holds `id`, `ingredientId`, `displayName`, `quantity: Quantity`, `sourceRecipeIds: string[]`, `checked: boolean` (defaults `false`), and a derived `category: GroceryCategory` (see entry 12).
- **Validation Rules**: `id`/`ingredientId`/`displayName` non-empty strings; `quantity` must be a `Quantity` instance; `sourceRecipeIds` an array of non-empty strings (may be empty, leaving room for a future manually-added line with no recipe source); `checked` must be a boolean.
- **Immutability**: Enforced via `Object.freeze(this)` and `Object.freeze([...sourceRecipeIds])`.
- **Design note**: `ShoppingListItem` (computed, identity-free) was deliberately left untouched rather than extended — a computation result and a database row with mutable state are different lifecycles, and overloading one type would force fake ids on unsaved items or fake `checked` state on computed-only ones.

### 11. `ShoppingList` (persisted)

- **Purpose**: A saved, named collection of `ShoppingListLine`s — usable standalone or linked to one `Event`.
- **Responsibilities**: Holds `id`, `name`, `eventId: string | null`, `items: ShoppingListLine[]`.
- **Validation Rules**: `id`/`name` non-empty strings; `eventId` must be a string or exactly `null` (not `undefined`); `items` must be an array of `ShoppingListLine` instances (may be empty).
- **Immutability**: Enforced via `Object.freeze(this)` and `Object.freeze([...items])`.
- **Design note**: A `ShoppingList` is always a deliberate, user-triggered _snapshot_ — unlike `Event`, it is never recomputed on read. Saving or regenerating one copies the currently-computed items into fresh `ShoppingListLine` rows with new ids and `checked: false`; regenerating is a full delete-and-recreate that discards prior checked state (a reviewed tradeoff, not a bug — see §13).

### 12. `GroceryCategory` + `categorizeIngredient()`

- **Purpose**: Buckets an ingredient into a grocery-aisle-style category (`Produce`, `Meat`, `Seafood`, `Dairy`, `Bakery`, `Frozen`, `Pantry Staples`, `Spices & Condiments`, `Beverages`, `Other`) so shopping lists can render grouped the way a store is laid out, instead of as one flat list.
- **Responsibilities**: `categorizeIngredient(ingredientId, displayName)` is a pure keyword-matching function over the ingredient's own identity/label; `GROCERY_CATEGORY_ORDER` gives the canonical display/grouping order.
- **Not persisted**: `category` is a _derived_ field, computed inside the `ShoppingListLine`/`ShoppingListItem` constructor path every time (fresh from consolidation or rehydrated from Prisma) — there's no database column for it. Improving the keyword ruleset retroactively improves grouping for every existing recipe/list with zero migration.
- **Limitations**: A deterministic heuristic (consistent with the "deterministic domain, AI at the edge" rule — no AI call involved), so it will fall back to `Other` for unrecognized ingredients and can be wrong for genuinely ambiguous names (e.g. "pepper").
- **Manual correction**: A user can now correct a wrong categorization — see §10's Ingredient Category Overrides and §13 item 9. The domain layer itself is untouched by this; overrides are resolved entirely in `apps/api`.

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

| Error Class                | Thrown When                                                                                                                                               | Example Scenario                                                         |
| :------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| `InvalidQuantityError`     | Amount is negative, NaN, or non-finite.                                                                                                                   | `Quantity.create(-5, 'g')`                                               |
| `InvalidUnitError`         | Unit string is not registered in `units.ts`.                                                                                                              | `Quantity.create(1, 'invalid_unit')`                                     |
| `UnitMismatchError`        | Attempting arithmetic across incompatible unit categories.                                                                                                | `qtyGrams.add(qtyCups)`                                                  |
| `InvalidRecipeError`       | Recipe ID/name is empty, baseServings $\le 0$, or ingredient list is empty.                                                                               | `new Recipe('r1', '', 4, [])`                                            |
| `InvalidGuestGroupError`   | Guest count rules are violated (`veganCount > vegetarianCount` or `vegetarianCount > totalGuests`).                                                       | `new GuestGroup({ totalGuests: 10, vegetarianCount: 2, veganCount: 5 })` |
| `InvalidEventError`        | A persisted `Event`'s fields violate invariants (empty id/name, `guestGroup` not a `GuestGroup` instance, `recipeIds` not an array of non-empty strings). | `new Event({ id: 'e1', name: '', guestGroup, recipeIds: [] })`           |
| `InvalidShoppingListError` | A persisted `ShoppingList` or `ShoppingListLine`'s fields violate invariants (empty id/name, invalid `eventId`, non-`Quantity` quantity, etc.).           | `new ShoppingList({ id: 'l1', name: '', eventId: null, items: [] })`     |

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

- **Total Vitest Tests**: **277 passing tests** across 16 test files, spanning `packages/domain` (units, recipes + recipeStep, shopping + shoppingListLine + shoppingList + groceryCategory, events + event), `apps/api` (health, recipe CRUD incl. steps, shopping-list preview, event-plan preview, Event CRUD, ShoppingList CRUD, event-linked ShoppingList, ingredient category overrides, AI import text/URL/image incl. instructions), and `apps/web` (App — incl. recipe steps editor, event save/view/update/delete lifecycle, shopping-list save/view/toggle lifecycle — formatQuantity).
- **Playwright E2E Tests**: **8 passing tests** across 3 spec files — `recipe-lifecycle.spec.ts` (full CRUD + shopping list math), `ai-import.spec.ts` (fixture-intercepted text/URL/image/camera import + a failure-path case), `event-planner.spec.ts` (happy path + 400 validation).
- **Vitest cross-file isolation**: `apps/api`'s test files share one physical SQLite file (`prisma/test.db`) via the root `DATABASE_URL`. The root `vitest.config.ts` sets `fileParallelism: false` so all test files run serially rather than racing (a per-project setting in `apps/api/vitest.config.ts` alone is not honored by the root `projects` orchestrator); every file that mutates `Recipe`/`IngredientLine` also resets those tables in a `beforeEach` as defense in depth.

### Confidence Level

**High**. Unit tests verify exact mathematical and error invariants. API integration tests verify HTTP response codes and database persistence against SQLite. Playwright E2E tests verify real end-to-end network proxying, database mutations, DOM rendering, and Gemini-fixture-driven AI import flows against a running stack (`:3010`/`:3011`, `e2e.db`).

---

# 10. API Layer (`apps/api`)

### Express Endpoints

| Method   | Endpoint                                    | Description                                                                                                                                                           |
| :------- | :------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/health`                               | Health check                                                                                                                                                          |
| `POST`   | `/api/recipes/import-text`                  | Gemini-parsed recipe draft from raw pasted text                                                                                                                       |
| `POST`   | `/api/recipes/import-url`                   | Gemini-parsed recipe draft from a webpage URL (SSRF-guarded, Cheerio fallback scraping)                                                                               |
| `POST`   | `/api/recipes/import-image`                 | Gemini-parsed recipe draft from an uploaded photo (Busboy streaming, 8MB limit, magic-byte sniffing)                                                                  |
| `POST`   | `/api/recipes`                              | Create a new recipe                                                                                                                                                   |
| `GET`    | `/api/recipes`                              | Fetch all saved recipes                                                                                                                                               |
| `GET`    | `/api/recipes/:id`                          | Fetch recipe by ID                                                                                                                                                    |
| `PUT`    | `/api/recipes/:id`                          | Full replace update recipe                                                                                                                                            |
| `DELETE` | `/api/recipes/:id`                          | Delete recipe (cascade delete ingredient lines)                                                                                                                       |
| `POST`   | `/api/shopping-list`                        | Ephemeral preview: generate a consolidated shopping list across recipes (never persisted)                                                                             |
| `POST`   | `/api/events/plan`                          | Ephemeral preview: guest-group event plan — eligible servings + consolidated list (never persisted)                                                                   |
| `POST`   | `/api/events`                               | Save a new event; returns the recomputed plan immediately (summary + plan combined)                                                                                   |
| `GET`    | `/api/events`                               | List saved events (summary shape only — no recomputed plan per row)                                                                                                   |
| `GET`    | `/api/events/:id`                           | Fetch one saved event with its plan recomputed live; reports `droppedRecipeIds` if any recipe was deleted                                                             |
| `PUT`    | `/api/events/:id`                           | Update a saved event's name/guestGroup/recipeIds (single scalar-column update; preserves any linked ShoppingList)                                                     |
| `DELETE` | `/api/events/:id`                           | Delete a saved event (cascades its linked ShoppingList, if any)                                                                                                       |
| `POST`   | `/api/shopping-lists`                       | Save a new standalone shopping list (`eventId` always `null`)                                                                                                         |
| `GET`    | `/api/shopping-lists`                       | List saved shopping lists, items included                                                                                                                             |
| `GET`    | `/api/shopping-lists/:id`                   | Fetch one saved shopping list                                                                                                                                         |
| `DELETE` | `/api/shopping-lists/:id`                   | Delete a saved shopping list (cascades its items; no effect on a linked Event)                                                                                        |
| `PATCH`  | `/api/shopping-lists/:listId/items/:itemId` | Toggle one item's `checked` state — cheap, targeted, fires on every checkbox tap                                                                                      |
| `PUT`    | `/api/events/:eventId/shopping-list`        | Idempotent "save/regenerate this event's shopping list" — full delete-and-recreate, discards prior checked state, name defaults to the event's name unless overridden |
| `PUT`    | `/api/ingredient-categories/:ingredientId`  | Set (or replace) a manual grocery-category correction for an ingredient, globally by `ingredientId`                                                                   |
| `DELETE` | `/api/ingredient-categories/:ingredientId`  | Clear a manual correction, reverting that ingredient to the `categorizeIngredient()` heuristic — idempotent                                                           |

None of the `import-*` endpoints persist to the database — they return a draft `CreateRecipeInput`-shaped payload (now including `instructions: string[]`) for the client to review and submit via `POST /api/recipes`. Neither `POST /api/shopping-lists` nor `PUT /api/events/:eventId/shopping-list` accept client-supplied quantities — both always re-run `toDomainRecipe → scaleRecipe → consolidateShoppingList` server-side before persisting. Every route that returns a shopping-list item (`POST /api/shopping-list` preview, `POST /api/events/plan` and every persisted Event route's embedded plan, and every ShoppingList route) includes a `category: GroceryCategory` field per item, resolved fresh at serialization time from the heuristic plus any stored override — never a stored column on the item itself.

### Ingredient Category Overrides

A `IngredientCategoryOverride` Prisma model (`ingredientId` primary key, `category`, `updatedAt`) stores manual corrections to `categorizeIngredient()`'s keyword heuristic, keyed globally by `ingredientId` — not scoped to one recipe or one saved list, matching how category was already treated everywhere else as a pure function of ingredient identity. `apps/api/src/categoryOverrides.ts` owns validation (`category` must be one of the `GroceryCategory` enum values, else `InvalidShoppingListError` → 400) and the read/write helpers. The domain layer (`ShoppingListLine`, `ShoppingListItem`, `consolidateShoppingList`) is untouched — it keeps producing the heuristic-only category exactly as before. Every route that emits a `category` field (`serializeEventPlan()`, `toShoppingListJSON()`, and the `POST /api/shopping-list` preview) fetches the full overrides map once per request and resolves `overrides.get(ingredientId) ?? heuristicCategory` at the JSON-serialization boundary, so a correction retroactively fixes that ingredient everywhere it appears — past saved lists included, with no migration. The frontend's editing surface is intentionally narrower than the read surface: `ShoppingListBuilder.tsx`'s saved-list view mode is the only place with a category `<select>` per item (wired to `useSetIngredientCategory()`, PUT `/api/ingredient-categories/:ingredientId`), plus a small reset icon next to it (wired to `useClearIngredientCategory()`, DELETE) shown only when that item is actually overridden — `toShoppingListJSON()` includes a `categoryIsOverridden` boolean per item precisely so the client can decide whether the reset control is relevant, rather than always showing an icon that does nothing when there's no override to clear. Ephemeral previews (build-mode, event-plan preview) just display whatever overrides already exist, with no edit or reset control, since there's nothing persisted yet to attach a correction to.

### Request Flow Into Domain (recipe CRUD)

1. Express route handler receives JSON request.
2. Handler passes raw body to `validateAndCreateDomainRecipe(req.body, id)` in `recipeMapper.ts`.
3. Domain constructors (`Quantity`, `IngredientLine`, `Recipe`) validate; a `DomainError` becomes `400 Bad Request` before touching the database.
4. `prisma.$transaction()` performs the atomic SQLite write.
5. The updated Prisma model is mapped back to a domain entity via `toDomainRecipe()` and returned as JSON.

### AI Import Pipeline

`geminiClient.ts` is the single integration point with `@google/genai`. It supports fixture interception (`USE_GEMINI_FIXTURES=true`, backed by `src/__fixtures__/recordedGeminiFixtures.ts`) so E2E tests and local dev never need a live API key or incur API cost; `checkProductionGuard()` throws at startup if fixtures are enabled with `NODE_ENV=production`. `importUrl.ts` fetches user-supplied URLs behind `ssrfGuard.ts` (blocks internal/private network targets) with a 2MB decompressed-size cap and a 30s timeout; `importImage.ts` validates uploads via streaming Busboy parsing and magic-byte header sniffing (not just file extension) before ever calling Gemini. The shared `GEMINI_SYSTEM_PROMPT` extracts both `ingredients` and an ordered `instructions: string[]` array; a `stepsFromInstructions()` helper in `recipeMapper.ts` bridges the AI-facing `instructions` field name to the domain-facing `steps` field before validation (these are genuinely different field names at two boundaries — this was a real bug caught during implementation, since calling the recipe validator directly on the raw Gemini JSON silently dropped every extracted instruction).

### Persisted Event & ShoppingList Request Flow

- **"Recompute live"**: `POST /api/events`, `GET /api/events/:id`, and `PUT /api/events/:id` all fetch each of the event's `recipeIds` fresh from the database and call `planEventShoppingList()` on every request — the plan is never cached. Editing a recipe's ingredients is reflected in every event referencing it on the very next read.
- **Stale recipe tolerance**: if a `recipeId` no longer resolves to a `Recipe` (deleted since the event was saved), it's silently dropped from the recomputed plan rather than 404ing the whole event — the dropped ids are tracked and returned as `droppedRecipeIds` in the response, which the frontend surfaces as a warning banner.
- **ShoppingList is a snapshot, not a live view**: saving (`POST /api/shopping-lists`) or regenerating (`PUT /api/events/:eventId/shopping-list`) a `ShoppingList` copies the currently-computed items into fresh `ShoppingListLine` rows via `buildShoppingListLinesFromConsolidated()`. Regenerating is a full delete-and-recreate inside a `$transaction` (the old row's cascade-deleted items and the new row gets a fresh id) — no attempt is made to preserve `checked` state across regeneration by matching ingredients; this was explicitly reviewed and kept simple.
- **`ShoppingList.eventId` is nullable + `@unique`**: usable standalone (`null`) or linked to at most one `Event`. Deleting the `Event` cascades to its linked `ShoppingList`; the reverse relationship doesn't exist.

---

# 11. Frontend (`apps/web`)

### Architecture & Screens

Single-page React app (`App.tsx`) with three top-level tabs, synced to `window.location.hash`:

1. **Recipes (`#recipes`)**:
   - `RecipeForm.tsx` — dual-purpose creation/edit form: name, servings, dietary tags, an ingredients editor, an ordered step editor (add/remove/up-down-reorder — order is load-bearing for instructions, unlike ingredients), plus a 4-mode AI import flow (Text / URL / Image / Camera) that pre-fills the form (including steps) from a Gemini draft for human review before submission. Camera mode uses a dedicated file input with `capture="environment"` for fast mobile photo capture.
   - `RecipeList.tsx` — recipe card grid with search-by-name, dietary-tag toggle filters, bulk select/delete, "send to shopping list," an Instructions section per card, and Edit/Delete actions.
2. **Shopping List Builder (`#shopping-list`)**: two sibling components sharing the tab —
   - `SavedShoppingLists.tsx` — card grid of saved lists (item count, checked-count, "linked to event" badge), select/delete.
   - `ShoppingListBuilder.tsx` — **build mode** (no list selected): unchanged multi-recipe selector with per-recipe target servings and a name field, generating an ephemeral preview via `POST /api/shopping-list`, plus a "Save Shopping List" button once a preview exists. **View mode** (a saved list selected): fetches the list via `GET /api/shopping-lists/:id`, renders each item with a real checkbox wired to the toggle mutation, plus "Delete Shopping List." Both modes render items grouped under grocery-category headers via `lib/groceryCategories.ts`'s `groupByCategory()`, not a flat list.
3. **Event Planner (`#event-planner`)**: two sibling components sharing the tab —
   - `EventList.tsx` — card grid of saved events (guest breakdown, recipe count), select/delete.
   - `EventPlanner.tsx` — **create/preview mode** (no event selected): unchanged guest-group input against saved recipes, calling `POST /api/events/plan` for a live preview, plus a "Save Event" button once a preview exists. **View mode** (a saved event selected): fetches the event via `GET /api/events/:id` (recomputed live), pre-fills the form for editing, shows a dropped-recipe warning banner if applicable, and adds "Update Event," "Delete Event," and "Save/Regenerate Shopping List" (with a "View Shopping List" link that cross-tab-hands-off into the Shopping List tab's view mode once one exists). The consolidated event shopping list is also grocery-category-grouped, same as the Shopping List tab.

### State Management & Navigation

- **URL Hash Synchronization**: `currentTab` syncs with `window.location.hash`. No new top-level tabs were added for saved events/lists — deliberately: the closest precedent (the Recipes tab combining create-form + list + detail) already established the pattern of one tab, multiple sibling components, gated by a lifted nullable-selected-entity id.
- **TanStack Query**: `useRecipes()` shares query key `['recipes']`. Mutations invalidate `['recipes']` on success. `useEvents()`/`useEvent(id)` and `useShoppingLists()`/`useShoppingList(id)` follow the same list/detail pattern under `['events']`/`['shoppingLists']`. Create/update mutations for Events and ShoppingLists are deliberately **non-optimistic** (their responses carry server-recomputed data the client can't cheaply predict, and they're low-frequency "save" actions); delete mutations are optimistic, mirroring the recipe-delete pattern; the shopping-list-item checkbox toggle is the one optimistic **targeted single-item patch** in this area, since it's the one interaction where instant feedback genuinely matters (checking items off while at the store).

---

# 12. Features NOT Yet Built

These are genuinely still open — not implemented anywhere in the codebase as of this writing:

- **Pantry Inventory Subtraction**: Deducting on-hand pantry items from a generated shopping list.
- **Cost Estimation**: Price estimates on shopping list items.
- **Practical Scaling Heuristics (v2)**: Non-linear rounding for indivisible ingredients (e.g. recommending 1 whole egg instead of 0.25 egg) — documented in `docs/ideas/practical-scaling.md`.
- **Auth & Multi-Tenancy**: No user login; all recipes, events, and shopping lists are global and shared in one SQLite database.
- **AI-Extracted Instructions for images/URL beyond text round-trip**: instructions are extracted for all four import modes, but recipe step _editing_ has no drag-and-drop reorder (up/down buttons only) and no per-step duration/temperature fields yet.
- **Offline tolerance for shopping-list checkbox toggling**: a failed `PATCH` while checking off items at the store just flickers the checkbox back (default optimistic-rollback) — no request queue or background retry.

---

# 13. Open Design Decisions

1. **Duplicate Ingredient IDs in a Single Recipe**: Allowed in the domain `Recipe` constructor. Deduplication happens during `consolidateShoppingList()`.
2. **Dietary Tag Storage in SQLite**: Stored as a JSON string (`dietaryTagsJson`) on the `Recipe` table and parsed at the API boundary, since SQLite has no native array column type.
3. **Full-Group Serving Scaling in Event Planning**: Each eligible recipe scales to 100% of its eligible guest count (e.g. two vegetarian mains both scale to the full vegetarian count). Per-guest dish-splitting is deferred to a future UI workflow.
4. **"Recompute Live" for Events**: A saved `Event` stores only its inputs (name, guest group, recipe ids) — never a cached plan. Every read recomputes fresh. Explicitly chosen over snapshotting so that editing a recipe retroactively updates every event referencing it, at the cost of a saved event's plan being able to silently change if you edit its recipes later (a documented tradeoff, not a bug).
5. **`ShoppingListItem` Left Untouched, New `ShoppingListLine` Class Added**: Rather than extending the existing computed, identity-free `ShoppingListItem` to carry an id and `checked` state, a separate `ShoppingListLine` class was introduced for the persisted concept. A computation result and a database row with mutable state are different lifecycles; overloading one type would force fake ids on unsaved items or fake `checked` state on computed-only ones.
6. **Regenerating a ShoppingList Discards Checked State**: Both `POST /api/shopping-lists` (implicitly, since it's always a fresh create) and `PUT /api/events/:eventId/shopping-list` (explicitly, on repeat calls) do a full delete-and-recreate rather than attempting to preserve `checked` state by matching ingredients across regenerations. Reviewed and kept simple deliberately — a fuzzy-matching heuristic risks silently carrying over a check that no longer applies.
7. **No New Top-Level Nav Tabs for Saved Events/ShoppingLists**: Saved-entity browsing lives nested inside the existing Event Planner / Shopping List tabs (a list component above the builder/planner, gated by a lifted nullable-selected-id), matching the precedent already set by the Recipes tab combining create-form + list + detail in one place.
8. **Grocery-Category Grouping is a Deterministic Heuristic, Not AI or Stored Data**: `categorizeIngredient()` is plain keyword matching over `ingredientId`/`displayName`, consistent with the "deterministic domain, AI at the edge" rule — no Gemini call, no schema change, no migration. `category` is derived fresh every time a `ShoppingListLine`/`ShoppingListItem` is constructed rather than persisted, so improving the ruleset later improves grouping retroactively for every existing recipe/list. The frontend duplicates the category string list (`apps/web/src/lib/groceryCategories.ts`) rather than importing from `packages/domain`, matching the existing dietary-tag-options precedent (web talks to the domain package only through the API, never by import).
9. **Manual Category Overrides Resolved at the API Boundary, Not in the Domain Layer**: rather than threading an overrides map through `categorizeIngredient()`/`ShoppingListLine`/`consolidateShoppingList` (which would ripple through every constructor and test in `packages/domain`), a correction is stored in a small `IngredientCategoryOverride` table and applied only where `apps/api` builds JSON responses (`serializeEventPlan()`, `toShoppingListJSON()`, the shopping-list preview route). The domain objects' own `.category` stays heuristic-only and untouched; the wire-format `category` can differ from it. This keeps the override feature entirely an application-layer concern — the same boundary AI import is scoped to — at the cost of the domain object's `.category` no longer being the final word on what a client sees.

---

# 14. ADR Summary

### ADR 0001: Monorepo Architecture

- **Decision**: Adopt npm workspaces with three packages (`packages/domain`, `apps/api`, `apps/web`).
- **Rationale**: Strict separation of concerns; `packages/domain` has zero framework dependencies and could be published or reused independently.
- **Tradeoffs**: Requires path mapping and module resolution configuration across workspaces.

---

# 15. Technical Debt

| Debt                                         | Severity | Impact                                                                                        | Mitigation Plan                                                                |
| :------------------------------------------- | :------- | :-------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| **JSON Column for Dietary Tags**             | Low      | `dietaryTagsJson` string column in Prisma SQLite requires manual JSON parse/serialize.        | Migrate to a normalized join table if the database ever moves off SQLite.      |
| **No Authentication / Multi-Tenancy**        | Medium   | All recipes in SQLite are global and shared.                                                  | Add user authentication and a `userId` foreign key on `Recipe`.                |
| **Unbounded List Fetching**                  | Low      | `GET /api/recipes` returns all recipes without pagination.                                    | Implement cursor-based pagination once recipe count exceeds ~100.              |
| **No Offline Tolerance for Checkbox Toggle** | Low      | A failed `PATCH .../items/:itemId` while shopping just rolls the checkbox back with no retry. | Add a request queue with background retry if this proves annoying in real use. |

---

# 16. Performance

- **Unit Conversions & Consolidation**: $O(N)$ linear complexity, sub-millisecond for realistic ingredient counts.
- **SQLite Database I/O**: Local disk reads/writes resolve in single-digit milliseconds per request.
- **TanStack Query Caching**: Eliminates redundant network requests when switching tab views.
- **N+1 Avoidance in Event Listing**: `GET /api/events` selects only `shoppingList: { select: { id: true } }` rather than recomputing each event's plan (which would mean fetching every referenced recipe per row) — see §10's "recompute live" note.

---

# 17. Security

- **Current Security Posture**: Safe for local and single-user deployment; not yet hardened for multi-tenant production use.
- **Validation**: All incoming API payloads pass strict domain validation before reaching Prisma/SQLite.
- **AI Import Hardening**: SSRF guard on URL import (blocks internal/private network targets); streaming size limits + magic-byte sniffing on image upload (not just extension/MIME trust); Gemini fixture interception has a hard production guard so recorded fixtures can never leak into a production response.
- **Risks**: No authentication middleware, authorization checks, or rate limiting currently implemented.

---

# 18. Current Assessment

- **Strengths**: Outstanding domain isolation, immutable value objects throughout, clean monorepo boundaries, comprehensive automated test coverage (274 Vitest + 8 Playwright E2E), strict TypeScript typing, deterministic-domain/AI-at-the-edge separation maintained even as the AI import surface grew to four input modes and now extracts instructions too, and even as grocery-category grouping was added via a keyword heuristic rather than a Gemini call. Recipes, events, and shopping lists are all now genuinely persisted and revisitable — not just planning tools that reset on refresh — while still cleanly separating ephemeral preview computation from deliberate, user-triggered save actions.
- **Weaknesses**: Lack of authentication and pagination; no pantry/cost-estimation features yet; recipe step reordering has no drag-and-drop; shopping-list checkbox toggling has no offline tolerance; the manual category-override editing UI (set and reset) lives only in the saved-shopping-list view — ephemeral previews (build-mode, event-plan preview) display overrides but can't create or clear them.
- **Maintainability**: Excellent — modular architecture and thorough tests make adding new features straightforward and safe.
