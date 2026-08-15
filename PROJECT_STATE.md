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
- **Test counts** (see §9 for the full breakdown): 412 Vitest tests, 9 Playwright E2E tests, all passing.

### Overall Architecture Philosophy

1. **Domain-Driven Design (DDD)**: Core business rules, unit conversions, recipe scaling, and dietary eligibility logic reside strictly inside an isolated, immutable domain package (`packages/domain`). The domain package depends on nothing outside itself.
2. **Clean Monorepo Boundaries**: The system uses npm workspaces separating `packages/domain` (domain kernel), `apps/api` (infrastructure & HTTP endpoints), and `apps/web` (user interface).
3. **Immutability & Value Objects**: Domain objects (`Quantity`, `Recipe`, `IngredientLine`, `GuestGroup`) are frozen value objects that guarantee validity upon construction and prevent accidental side effects.
4. **Deterministic Calculation Over AI Inference**: All core mathematical scaling, unit conversions, and dietary subgroup filtering are 100% deterministic code, living in `packages/domain`. AI capability (Google Gemini) is scoped entirely to `apps/api`, for structured text extraction from unstructured recipe text/URLs/images — never for core arithmetic or eligibility calculation. AI-imported recipes are never auto-persisted; they return a draft the client must explicitly review and submit.

---

# 2. Technology Stack

| Category                         | Technology                                                                        | Version    | Purpose & Selection Rationale                                                                                                                                                 |
| :------------------------------- | :-------------------------------------------------------------------------------- | :--------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Language**                     | TypeScript                                                                        | `^5.7.3`   | Strong static typing across monorepo boundaries, preventing null reference errors and signature mismatches.                                                                   |
| **Runtime**                      | Node.js                                                                           | `>=18.0.0` | Standard server-side JavaScript runtime with native ES modules support (`Node16`/`NodeNext`).                                                                                 |
| **Monorepo**                     | npm Workspaces                                                                    | Native     | Native package management and workspace linking without third-party monorepo overhead (e.g. Lerna or Nx).                                                                     |
| **Backend Framework**            | Express.js                                                                        | `^4.21.2`  | Minimalist, stable HTTP web framework for routing, middleware handling, and JSON API delivery.                                                                                |
| **Database**                     | SQLite                                                                            | 3.x        | Zero-configuration file-based relational database (`dev.db`, `test.db`, `e2e.db`). Ideal for rapid development and isolated test suites.                                      |
| **ORM**                          | Prisma                                                                            | `^6.3.1`   | Type-safe database client and auto-generated migrations. Guarantees compile-time type alignment between SQL schema and TypeScript types.                                      |
| **AI**                           | `@google/genai` (Gemini)                                                          | `^2.13.0`  | Structured extraction of recipe drafts from raw text, webpage URLs, and photos; never used for domain arithmetic.                                                             |
| **HTML parsing**                 | Cheerio                                                                           | `^1.2.0`   | Fallback structured-data scraping for URL import when a page lacks machine-readable recipe markup.                                                                            |
| **Multipart parsing**            | Busboy                                                                            | `^1.6.0`   | Streaming multipart parser for image uploads, enabling size-limit enforcement without buffering the whole file.                                                               |
| **Frontend UI Framework**        | React                                                                             | `^18.3.1`  | Declarative UI framework for building reactive components.                                                                                                                    |
| **Frontend Build Tool**          | Vite                                                                              | `^6.1.0`   | Ultra-fast HMR dev server and optimized Rollup production bundler.                                                                                                            |
| **State & Data Fetching**        | TanStack Query                                                                    | `^5.101.4` | Automatic caching, stale-time management, background refetching, and mutation cache invalidation (`['recipes']`).                                                             |
| **Offline Mutation Persistence** | `@tanstack/react-query-persist-client` + `@tanstack/query-sync-storage-persister` | `^5.101.4` | Persists the query client to `localStorage` so the shopping-list checkbox toggle mutation survives a full page reload while paused/offline, then resumes it once back online. |
| **Styling**                      | Tailwind CSS                                                                      | `^3.4.17`  | Utility-first CSS framework for design system enforcement.                                                                                                                    |
| **UI Components**                | shadcn/ui (Radix + Lucide)                                                        | Custom     | Accessible-by-default primitives (`Button`, `Card`, `Input`, `Label`, `Select`, `Checkbox`).                                                                                  |
| **Icons**                        | Lucide React                                                                      | `^0.475.0` | Clean, accessible vector icon set.                                                                                                                                            |
| **Unit/Integration Testing**     | Vitest                                                                            | `^3.0.5`   | Native ESM test runner with JSDom support for React Testing Library and Supertest API tests.                                                                                  |
| **E2E Testing**                  | Playwright                                                                        | `^1.61.1`  | Full-stack browser automation testing driving real frontend/backend servers and isolated DB, with Gemini fixture interception.                                                |
| **Linting**                      | ESLint + `jsx-a11y`                                                               | `^9.20.1`  | Strict JavaScript/TypeScript linting with automated accessibility checks.                                                                                                     |
| **Formatting**                   | Prettier                                                                          | `^3.5.1`   | Code style consistency across all workspace files.                                                                                                                            |
| **Git Hooks**                    | Husky + lint-staged                                                               | `^9.1.7`   | Pre-commit formatting and linting enforcement.                                                                                                                                |

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
│   │   │   ├── aiRecipeExtraction.ts # Shared sanitize/parse/shape-guard/bounded-retry orchestration for all three AI import routes
│   │   │   ├── ssrfGuard.ts        # SSRF protection for URL-import fetches
│   │   │   ├── imageValidator.ts   # Streaming Busboy size limit + magic-byte sniffing
│   │   │   ├── importText.ts / importUrl.ts / importImage.ts  # AI import route handlers
│   │   │   ├── index.ts            # HTTP server listener (port 3001)
│   │   │   ├── prisma.ts           # Shared PrismaClient singleton instance
│   │   │   └── recipeMapper.ts     # Mappers converting Prisma Recipe/RecipeStep <-> Domain entities
│   │   ├── eventMapper.ts      # Mappers converting Prisma Event <-> Domain Event; serializeEventPlan() shared by the ephemeral preview route and every persisted Event route
│   │   ├── shoppingListMapper.ts # Mappers converting Prisma ShoppingList/ShoppingListItem <-> Domain ShoppingList
│   │   ├── categoryOverrides.ts  # Manual grocery-category corrections (IngredientCategoryOverride table), applied at the JSON-serialization boundary
│   │   └── recipePagination.ts   # Opaque cursor encode/decode for GET /api/recipes?limit=... (createdAt+id, base64url)
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
│       │   └── App.tsx             # Lifts selectedEventId/selectedShoppingListId (nullable-selected-entity pattern, same as editingRecipe) + cross-tab handoff from an event to its linked shopping list; also owns the localStorage-backed query-client persister (offline checkbox-toggle survival — see §15)
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
│       ├── shopping/               # ShoppingListItem (computed), consolidateShoppingList, ShoppingList + ShoppingListLine (persisted), GroceryCategory + categorizeIngredient (deterministic aisle-grouping heuristic), subtractPantryStock, applyPracticalRounding (Practical Scaling v2)
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
- **Related function — `parseGuestGroupText(text: string): ParsedGuestGroupText | null`** (`packages/domain/src/events/parseGuestGroupText.ts`): a deterministic, narrow regex/keyword extractor for the natural-language event-planning quick fill (e.g. "dinner for 12, 3 vegetarian, 1 vegan"). Same "deterministic heuristic lives in the domain package" precedent as `categorizeIngredient()`. Extraction only, never correction — returns raw extracted values even if they'd violate `GuestGroup`'s invariants, leaving that enforcement to `GuestGroup` itself; returns `null` when it can't confidently determine `totalGuests` (word-numbers, no digits, no total-guest signal), which is the sole trigger for the AI-fallback path in `POST /api/events/parse-description` (see §10).

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
- **Responsibilities**: Holds `instruction` (plain text) plus optional `duration`/`temperature` (`StepDuration`/`StepTemperature`) and an optional free-text `notes` field (e.g. "Tent with foil if browning too quickly."). Ordering is implicit in array position within `Recipe.steps` — the class itself has no `position` field (that only exists at the Prisma persistence layer), mirroring `IngredientLine`.
- **Validation Rules**: `instruction` must be a non-empty string. `notes`, if provided, must be a string — it's trimmed and stored as `null` when empty/whitespace-only, matching how `duration`/`temperature` are stored `| null` rather than `undefined`.
- **Immutability**: Enforced via `Object.freeze(this)`.

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

### 5. `applyPracticalRounding(items: ShoppingListItem[]): PracticallyRoundedItem[]` — Practical Scaling v2

- **Algorithm**: For each item, if `quantity.category === Count` and the amount isn't already a whole number, replaces `quantity` with `Math.ceil(amount)` in the same unit; every item gains `mathematicalQuantity` (the untouched pre-rounding `Quantity`) and `wasRoundedForPurchase: boolean`. Mass/Volume items pass through unchanged.
- **Why unit-category-based, not a curated ingredient dataset**: `docs/ideas/practical-scaling.md` originally proposed a curated 80-100-ingredient dataset keyed by `ingredientId` for "atomic" ingredient detection. Built differently: `ingredientId` is free-form text (user-typed or AI-extracted), not a controlled vocabulary, so a dataset keyed by it would silently miss most real recipes. The Count unit registry (`count`/`clove`/`egg`/`onion`) is already a small, controlled set where every unit is inherently atomic — reusing that existing distinction instead of inventing a parallel one.
- **Applied downstream of, not inside, `consolidateShoppingList()`/`subtractPantryStock()`** — both of those stay exact-math (matching their own "no rounding applied" scope notes); this is a separate, final, opt-in step, consistent with the "Quantity must not gain food-specific knowledge" design constraint.
- **Time Complexity**: $O(N)$.

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

- **Total Vitest Tests**: **412 passing tests** across test files spanning `packages/domain` (units incl. `Quantity.subtract()`, recipes + recipeStep incl. notes validation/trimming + stepDuration + stepTemperature, shopping + shoppingListLine + shoppingList + groceryCategory + subtractPantryStock + `practicalRounding` (Practical Scaling v2 — see §5 item 5), events + event + `parseGuestGroupText()`'s regex-extraction decision table), `apps/api` (health, recipe CRUD incl. steps with duration/temperature/notes round-trip, recipe list pagination, shopping-list preview, event-plan preview, Event CRUD, ShoppingList CRUD, event-linked ShoppingList, ingredient category overrides incl. `categoryIsOverridden` on ephemeral previews, pantry inventory subtraction, practical-scaling rounding across preview/save/event-plan routes, AI import text/URL/image incl. structured instructions with duration/temperature/notes, the shape-guard/bounded-retry `hasMinimalRecipeShape()`/`extractRecipeCandidate()` pair covering issue #1's retry-succeeds/retry-fails/no-retry-on-NoRecipeFound/no-retry-on-invalid-JSON decision table, a clean-429-message test per AI-call route (`isGeminiRateLimitError()`, see §10's AI Import Pipeline note), and `POST /api/events/parse-description`'s heuristic/AI-fallback/invariant-violation/config-guard decision table), and `apps/web` (App — incl. recipe steps editor + reorder + timing fields + notes field + offline-toggle retry, offline-toggle **persistence across a simulated page reload** via the localStorage-backed query-client persister, server-side search/dietary-tag filtering, event save/view/update/delete lifecycle, shopping-list save/view/toggle lifecycle, category-override editing in both build-mode and event-plan previews — formatQuantity, formatStepTiming). Note: the recipe-step _drag gesture_ itself has no automated coverage (jsdom stubs the layout measurement framer-motion's `Reorder` needs) — the underlying reorder state logic is covered via the pre-existing up/down-button test, which still exercises `handleMoveStep` unchanged.
- **Playwright E2E Tests**: **9 passing tests** across 3 spec files — `recipe-lifecycle.spec.ts` (full CRUD + shopping list math), `ai-import.spec.ts` (fixture-intercepted text/URL/image/camera import + a failure-path case), `event-planner.spec.ts` (happy path + 400 validation + the guest-description quick-fill's fixture-intercepted AI-fallback path).
- **Vitest cross-file isolation**: `apps/api`'s test files share one physical SQLite file (`prisma/test.db`) via the root `DATABASE_URL`. The root `vitest.config.ts` sets `fileParallelism: false` so all test files run serially rather than racing (a per-project setting in `apps/api/vitest.config.ts` alone is not honored by the root `projects` orchestrator); every file that mutates `Recipe`/`IngredientLine` also resets those tables in a `beforeEach` as defense in depth.

### Confidence Level

**High**. Unit tests verify exact mathematical and error invariants. API integration tests verify HTTP response codes and database persistence against SQLite. Playwright E2E tests verify real end-to-end network proxying, database mutations, DOM rendering, and Gemini-fixture-driven AI import flows against a running stack (`:3010`/`:3011`, `e2e.db`).

---

# 10. API Layer (`apps/api`)

### Express Endpoints

| Method   | Endpoint                                    | Description                                                                                                                                                                                             |
| :------- | :------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/api/health`                               | Health check                                                                                                                                                                                            |
| `POST`   | `/api/recipes/import-text`                  | Gemini-parsed recipe draft from raw pasted text                                                                                                                                                         |
| `POST`   | `/api/recipes/import-url`                   | Gemini-parsed recipe draft from a webpage URL (SSRF-guarded, Cheerio fallback scraping)                                                                                                                 |
| `POST`   | `/api/recipes/import-image`                 | Gemini-parsed recipe draft from an uploaded photo (Busboy streaming, 8MB limit, magic-byte sniffing)                                                                                                    |
| `POST`   | `/api/recipes`                              | Create a new recipe                                                                                                                                                                                     |
| `GET`    | `/api/recipes`                              | Fetch saved recipes — bare unbounded array by default, or a `{items, nextCursor}` page when `?limit=...` is present (see Recipe List Pagination below)                                                  |
| `GET`    | `/api/recipes/:id`                          | Fetch recipe by ID                                                                                                                                                                                      |
| `PUT`    | `/api/recipes/:id`                          | Full replace update recipe                                                                                                                                                                              |
| `DELETE` | `/api/recipes/:id`                          | Delete recipe (cascade delete ingredient lines)                                                                                                                                                         |
| `POST`   | `/api/shopping-list`                        | Ephemeral preview: generate a consolidated shopping list across recipes (never persisted)                                                                                                               |
| `POST`   | `/api/events/parse-description`             | Natural-language guest-breakdown quick fill: `{description}` → `{totalGuests, vegetarianCount, veganCount, source: 'heuristic' \| 'ai'}`, regex-first with a Gemini fallback (never persisted, see §10) |
| `POST`   | `/api/events/plan`                          | Ephemeral preview: guest-group event plan — eligible servings + consolidated list (never persisted)                                                                                                     |
| `POST`   | `/api/events`                               | Save a new event; returns the recomputed plan immediately (summary + plan combined)                                                                                                                     |
| `GET`    | `/api/events`                               | List saved events (summary shape only — no recomputed plan per row)                                                                                                                                     |
| `GET`    | `/api/events/:id`                           | Fetch one saved event with its plan recomputed live; reports `droppedRecipeIds` if any recipe was deleted                                                                                               |
| `PUT`    | `/api/events/:id`                           | Update a saved event's name/guestGroup/recipeIds (single scalar-column update; preserves any linked ShoppingList)                                                                                       |
| `DELETE` | `/api/events/:id`                           | Delete a saved event (cascades its linked ShoppingList, if any)                                                                                                                                         |
| `POST`   | `/api/shopping-lists`                       | Save a new standalone shopping list (`eventId` always `null`)                                                                                                                                           |
| `GET`    | `/api/shopping-lists`                       | List saved shopping lists, items included                                                                                                                                                               |
| `GET`    | `/api/shopping-lists/:id`                   | Fetch one saved shopping list                                                                                                                                                                           |
| `DELETE` | `/api/shopping-lists/:id`                   | Delete a saved shopping list (cascades its items; no effect on a linked Event)                                                                                                                          |
| `PATCH`  | `/api/shopping-lists/:listId/items/:itemId` | Toggle one item's `checked` state — cheap, targeted, fires on every checkbox tap                                                                                                                        |
| `PUT`    | `/api/events/:eventId/shopping-list`        | Idempotent "save/regenerate this event's shopping list" — full delete-and-recreate, discards prior checked state, name defaults to the event's name unless overridden                                   |
| `PUT`    | `/api/ingredient-categories/:ingredientId`  | Set (or replace) a manual grocery-category correction for an ingredient, globally by `ingredientId`                                                                                                     |
| `DELETE` | `/api/ingredient-categories/:ingredientId`  | Clear a manual correction, reverting that ingredient to the `categorizeIngredient()` heuristic — idempotent                                                                                             |
| `GET`    | `/api/pantry`                               | List all pantry items (on-hand stock, global by `ingredientId`)                                                                                                                                         |
| `PUT`    | `/api/pantry/:ingredientId`                 | Set (or replace) on-hand stock for an ingredient                                                                                                                                                        |
| `DELETE` | `/api/pantry/:ingredientId`                 | Remove on-hand stock — idempotent                                                                                                                                                                       |

None of the `import-*` endpoints persist to the database — they return a draft `CreateRecipeInput`-shaped payload (now including `instructions: Array<{instruction, duration, temperature}>`) for the client to review and submit via `POST /api/recipes`. Neither `POST /api/shopping-lists` nor `PUT /api/events/:eventId/shopping-list` accept client-supplied quantities — both always re-run `toDomainRecipe → scaleRecipe → consolidateShoppingList` server-side before persisting. Every route that returns a shopping-list item (`POST /api/shopping-list` preview, `POST /api/events/plan` and every persisted Event route's embedded plan, and every ShoppingList route) includes a `category: GroceryCategory` field per item, resolved fresh at serialization time from the heuristic plus any stored override — never a stored column on the item itself.

### Ingredient Category Overrides

A `IngredientCategoryOverride` Prisma model (`ingredientId` primary key, `category`, `updatedAt`) stores manual corrections to `categorizeIngredient()`'s keyword heuristic, keyed globally by `ingredientId` — not scoped to one recipe or one saved list, matching how category was already treated everywhere else as a pure function of ingredient identity. `apps/api/src/categoryOverrides.ts` owns validation (`category` must be one of the `GroceryCategory` enum values, else `InvalidShoppingListError` → 400) and the read/write helpers. The domain layer (`ShoppingListLine`, `ShoppingListItem`, `consolidateShoppingList`) is untouched — it keeps producing the heuristic-only category exactly as before. Every route that emits a `category` field (`serializeEventPlan()`, `toShoppingListJSON()`, and the `POST /api/shopping-list` preview) fetches the full overrides map once per request and resolves `overrides.get(ingredientId) ?? heuristicCategory` at the JSON-serialization boundary, so a correction retroactively fixes that ingredient everywhere it appears — past saved lists included, with no migration. `categoryIsOverridden` (per item, resolved the same `overrides.has(ingredientId)` way) is included on every one of these routes — `toShoppingListJSON()`, `serializeEventPlan()`, and the `POST /api/shopping-list` preview alike — so the client can always decide whether a reset control is relevant, not just on saved lists.

The editing UI (a category `<select>` per item, wired to `useSetIngredientCategory()`/PUT `/api/ingredient-categories/:ingredientId`, plus a reset icon shown only when `categoryIsOverridden`, wired to `useClearIngredientCategory()`/DELETE) now appears everywhere a shopping-list item renders: `ShoppingListBuilder.tsx`'s saved-list view mode (the original surface), its build-mode preview, and `EventPlanner.tsx`'s shared preview/view results section. The two mutation hooks' `onSuccess` already invalidates `['shoppingLists']` and `['events']` — real `useQuery` caches, so a saved list or a saved event's view mode (`useEvent(id)`) refetch and reflect the correction automatically. Build-mode's preview and create-mode's event-plan preview are different: `buildShoppingListMutation.data`/`planEventMutation.data` are mutation results, not cached queries, so nothing refetches them on invalidation. `ShoppingListBuilder`/`EventPlanner` each wrap the recategorize/reset handlers with a local `onSuccess` that re-runs the current build/plan mutation with the same inputs (`buildPayload()` / `{recipeIds, guestGroup}`) whenever `!isViewMode`, which is what makes the correction visible in the still-open preview without a page reload.

### Recipe List Pagination

`GET /api/recipes` is intentionally dual-shape by design, gated on a single clean switch: **the presence of `limit` in the query string.** With no params it returns exactly what it always has — a bare, unbounded `RecipeDto[]`, `orderBy: createdAt desc` — because `ShoppingListBuilder.tsx`/`EventPlanner.tsx` both render every recipe as a selector checkbox with no filter UI of their own and genuinely need the full catalog, not a page of it. When `limit` is present, it additionally accepts `cursor` (opaque, base64-encoded `{createdAt, id}` of the last row on the previous page — `apps/api/src/recipePagination.ts` owns encode/decode; the `id` tie-break matters because `createdAt` isn't `@unique`), `search` (substring match on `name`), and `tags` (comma-separated dietary tags, matched via a per-tag `dietaryTagsJson.contains('"Tag"')` substring check — the same pragmatic JSON-string-column tradeoff already used for `dietaryTagsJson` elsewhere), and returns `{ items: RecipeDto[], nextCursor: string | null }`. Only `RecipeList.tsx` opts into this: it calls a separate hook, `useRecipesPage()` (built on TanStack Query's `useInfiniteQuery`, query key `['recipes', 'page', {search, tags}]`), deliberately distinct from the original `useRecipes()`/`RECIPES_QUERY_KEY` that `ShoppingListBuilder`/`EventPlanner` still call unchanged — so none of the four existing optimistic recipe mutations (`useCreateRecipe`, `useUpdateRecipe`, `useDeleteRecipe`, `useBulkDeleteRecipes`) needed their cache-write logic touched; they were extended to additionally invalidate `['recipes', 'page']` on settle so RecipeList's paginated view stays in sync. RecipeList's name-search and dietary-tag filtering moved server-side as a consequence (debounced ~300ms for search; tag toggles fire immediately) so they still search the _whole_ catalog rather than just the currently-loaded page(s); a "Load More" button drives `fetchNextPage()`. One subtlety worth flagging for future edits: the top-level "database is empty" empty-state gate must check filter state against the _debounced_ params (`debouncedSearchQuery`/`selectedTags`), not the immediate `searchQuery` — using the immediate value caused a real bug where clearing an active filter would, for the ~300ms until the debounce caught up, transiently satisfy "no filter active AND zero results" and unmount the entire search UI into the wrong empty state.

### Pantry Inventory Subtraction

A `PantryItem` Prisma model (`ingredientId` primary key, `displayName`, `amount`, `unit`, `updatedAt`) stores on-hand stock as a global, standing fact per ingredient — same shape and rationale as `IngredientCategoryOverride`. `apps/api/src/pantryStore.ts` owns validation (delegated to the domain `Quantity` constructor — an invalid unit/negative amount throws a `DomainError`, mapped to 400 by the existing error middleware) and the read/write helpers, managed via `GET`/`PUT`/`DELETE /api/pantry/:ingredientId`.

The domain layer gained two new primitives for this: `Quantity.subtract()` (`packages/domain/src/units/quantity.ts`) — reuses `convertTo()`'s category/Count guards, clamps at zero rather than throwing for a would-be-negative result ("fully covered" is valid data, matching the "zero is valid" precedent used elsewhere) — and `subtractPantryStock(items, pantryStock)` (`packages/domain/src/shopping/subtractPantryStock.ts`), which applies that clamp-at-zero subtraction across a consolidated list and **omits** any item that reaches zero (a shopping list should not list what you already have enough of). A pantry entry recorded in an incompatible unit/category for a given item is tolerated by leaving that item unmodified rather than failing the whole list (mirrors `Event`'s `droppedRecipeIds` tolerance for a stale reference).

Every shopping-list-producing code path applies it: the `POST /api/shopping-list` preview, `POST /api/shopping-lists` save, and `PUT /api/events/:eventId/shopping-list` regenerate routes all call `getPantryStockMap()` + `subtractPantryStock()` directly on the consolidated list before persisting/responding; `serializeEventPlan()` (shared by the event-plan preview and every persisted Event route that recomputes its plan live) now also accepts a `pantryStock` param and applies the same subtraction internally, so a saved event's embedded shopping list reflects _current_ pantry stock on every read — consistent with "recompute live." **Deliberately not applied on plain `GET /api/shopping-lists`/`GET /api/shopping-lists/:id` reads**: a saved `ShoppingList` is a snapshot (see entry 11 in §4) — its persisted quantities already had pantry stock subtracted at save time, and re-deriving on every read would double-subtract or drift from what was actually saved, unlike `category` which is genuinely re-derived fresh every read.

Frontend: `PantryPanel.tsx` (rendered in the Shopping List tab, above `SavedShoppingLists`) is a simple add/list/remove UI, backed by `usePantryItems()`/`useSetPantryItem()`/`useClearPantryItem()` in `queries.ts`. Those mutations invalidate `['pantry']` and `['events']` (a saved event's plan recomputes live and needs to reflect new pantry stock) but deliberately **not** `['shoppingLists']` — per the snapshot rationale above, invalidating a saved list's cache wouldn't change what it shows anyway.

### Practical Scaling v2 (Non-Linear Rounding)

`applyPracticalRounding()` (see §4/§5, `packages/domain/src/shopping/practicalRounding.ts`) is called immediately after `subtractPantryStock()` in every shopping-list-producing code path — the `POST /api/shopping-list` preview, `POST /api/shopping-lists` save, `PUT /api/events/:eventId/shopping-list` regenerate routes, and `serializeEventPlan()` (shared by the event-plan preview and every persisted Event route). Every emitted shopping-list item gains `mathematicalQuantity` and `wasRoundedForPurchase` alongside the existing `quantity`/`category`/`categoryIsOverridden` fields.

**On save, the rounded amount is what's persisted**, not the exact mathematical one — `buildShoppingListLinesFromConsolidated()` receives the already-rounded items, same precedent as pantry subtraction permanently baking its reduction into what's saved. A consequence worth flagging: `toShoppingListJSON()` (reading a saved list back, via GET or immediately after POST/PUT) re-applies `applyPracticalRounding()` for consistency with the preview response shape, but since the persisted quantity is already whole by then, `wasRoundedForPurchase` reads back `false` even on a line that _was_ rounded at save time — only the live preview/plan responses (before saving) show `wasRoundedForPurchase: true` with a non-matching `mathematicalQuantity`. This is intentional (matches how `category` is also always re-derived fresh, never trusted from a stored value) but is the one place "was this rounded" and "is this currently rounded" diverge.

Frontend: the quantity badge in `ShoppingListBuilder.tsx` (both build-mode preview and saved-list view) and `EventPlanner.tsx`'s shared results section gets a small superscript `*` plus a `title` tooltip ("Rounded up for purchase — exact amount needed: …") whenever `wasRoundedForPurchase` is true. No new component — three call sites, each a few added lines on the existing `<span>`.

### Per-Step Duration/Temperature + AI-Import Structured-Output Hardening

`RecipeStep` (`packages/domain/src/recipes/recipeStep.ts`) gained two optional fields — `duration: StepDuration | null` and `temperature: StepTemperature | null` — via two new minimal value objects (`stepDuration.ts`, `stepTemperature.ts`; no `convertTo()`/`scale()`, since neither is ever summed across a recipe the way ingredient `Quantity` is). `RecipeStep`'s own "Design note" had anticipated this exact extension. `prisma/schema.prisma`'s `RecipeStep` model gained four matching nullable columns (`durationAmount`/`durationUnit`/`temperatureAmount`/`temperatureUnit`) — flat, mirroring `IngredientLine`'s `amount`/`unit` split rather than a JSON blob.

**The wire shape genuinely diverges between write and read.** `CreateStepInput` (request, `recipeMapper.ts` and `apps/web/src/lib/api.ts`) flattens duration/temperature into optional `durationAmount`/`durationUnit`/`temperatureAmount`/`temperatureUnit` fields, matching how `IngredientInput` already flattens `Quantity`. `toRecipeJSON()` (response) nests them instead — `duration: {amount, unit} | null` — since a single null check reads better than checking two fields for "not stated." `apps/web/src/lib/api.ts` models this as two separate types, `RecipeStepInput` (write) and `RecipeStepDto` (read); `RecipeForm.tsx`'s local `EditableStep` state re-flattens the read shape back to the write shape (`toEditableStep()`), and `queries.ts`'s optimistic-create/update cache entries do the same via `enrichStepsForOptimisticCache()` (mirroring the existing `enrichIngredientsWithCategory()` pattern for `Quantity`).

**Root-caused a real bug during this work**: a user reported AI-imported recipes showing only ingredients, no instructions. The `instructions` field was wired correctly at every boundary (Gemini prompt → route response → form pre-fill → save → display) — the actual gap was that `apps/api/src/geminiClient.ts`'s live `generateContent()` calls had no structured-output schema enforced, so JSON-shape compliance depended on prompt text alone. A response that quietly deviated (e.g. omitting `instructions`) failed silently: `RecipeForm.tsx` defaulted to zero steps, and `RecipeList.tsx` renders no Instructions section at all when `steps` is empty — not an empty section, just absent. Fixed by adding `config: { responseMimeType: 'application/json', responseSchema: RECIPE_RESPONSE_SCHEMA }` to both `generateContent()` calls (text and image), where `RECIPE_RESPONSE_SCHEMA` is an OpenAPI-subset schema (`Type` enum from `@google/genai`) with every field optional (no `required` at the root) so one schema covers both the success shape and the `{error, message}` shape. `stepsFromInstructions()` (`recipeMapper.ts`) still accepts a bare string as a defensive fallback (treated as `{instruction: thatString}`, no duration/temperature) — schema enforcement makes compliance reliable, not guaranteed, for a live response.

The Gemini prompt's `instructions` field changed from a flat `string[]` to an array of `{instruction, duration?, temperature?}` objects, with explicit instruction to extract duration/temperature **only when stated in the source text**, never inferred. All four recorded fixtures (`apps/api/src/__fixtures__/recordedGeminiFixtures.ts`) were updated to the new shape, deliberately mixing steps with and without timing so both paths stay covered. `apps/api/src/importImage.ts` is a separate file from `app.ts` (image import was extracted into its own handler) and needed the identical response-shaping fix independently — a real gap this session's first pass missed, caught by the Playwright e2e suite (image/camera import tests failed until fixed).

**A second real bug surfaced during manual browser verification** (not caught by the type system or initial tests): `RecipeStepRow`'s unit `<select>` displays a fallback default (`value={step.durationUnit ?? 'minutes'}`) before the user ever touches it — but that fallback is purely a render-time default, never written back into `EditableStep` state. Setting only the amount field (the common path — most users won't bother changing "minutes"/"°F" away from the default) left the unit `undefined`, which failed the submit payload's "both halves present" check and silently dropped the value. Fixed by having the amount `onChange` handlers also write the unit default into state the first time an amount is set. Covered by a dedicated regression test in `App.test.tsx` that sets only the amount fields and asserts both halves appear in the submitted payload.

### Per-Step Notes

`RecipeStep` gained a third optional field, `notes: string | null` — a free-text aside distinct from the instruction itself (e.g. "Tent with foil if browning too quickly."), following the same pattern as duration/temperature: validated in the constructor (must be a string when provided), trimmed, and stored `null` rather than `undefined` when absent or whitespace-only. `prisma/schema.prisma`'s `RecipeStep` model gained one matching nullable `notes String?` column — no flattening needed since, unlike duration/temperature, it's a single scalar rather than an amount/unit pair, so the write shape (`CreateStepInput`/`RecipeStepInput`) and read shape (`toRecipeJSON()`/`RecipeStepDto`) both just carry `notes` directly.

The three duplicated "build an `instructions` response" blocks (`app.ts`'s import-text and import-url routes, plus `importImage.ts`) each needed the same one-line addition — the same multi-boundary-duplication gap the duration/temperature work hit with `importImage.ts` previously. The Gemini prompt/schema were extended in parallel: `notes` is extracted only when the source text has a distinct aside/tip/warning attached to a step, never inferred, mirroring the duration/temperature extraction rule.

In `RecipeForm.tsx`, the notes input is collapsed behind its own "+ Add note" toggle (separate from "+ Add timing," since a step may want one, both, or neither) that starts open when the step already carries a value. `RecipeList.tsx` renders a step's notes as a small italicized line beneath the instruction/timing badges.

### AI Import Shape-Guard + Bounded Retry (GitHub issue #1)

**Root-caused live, not hypothetically**: a competitive-intelligence audit's live journey benchmark caught AI URL-import failing twice on two ordinary real recipe URLs, both times with a confusing `422 Recipe ingredients must be an array` leaking straight to the user. Direct debug capture showed the live `gemini-3.6-flash` call had returned syntactically valid JSON that was structurally wrong — every field crammed into a single `name` string, no `ingredients` array — despite `responseSchema` already being configured. The actual gap: `RECIPE_RESPONSE_SCHEMA` had no `required` at the root object (deliberately, so one schema could cover both the success shape and the `{error, message}` "not a recipe" shape), so `{name: "anything"}` alone was schema-valid.

**Two-layer fix.** First, the schema itself: `RECIPE_RESPONSE_SCHEMA` is now `anyOf: [RECIPE_ERROR_SHAPE, RECIPE_SUCCESS_SHAPE]` (`geminiClient.ts`) — `RECIPE_ERROR_SHAPE` requires `['error', 'message']`, `RECIPE_SUCCESS_SHAPE` requires `['name', 'baseServings', 'ingredients', 'instructions']` and gives `ingredients` a `minItems: '1'`. Second, and more importantly, an app-layer backstop that doesn't depend on trusting the schema alone: `hasMinimalRecipeShape()` (`recipeMapper.ts`) — deliberately narrow, only checks `name` is non-empty and `ingredients` is a non-empty array — and `extractRecipeCandidate()` (new file, `aiRecipeExtraction.ts`) orchestrate sanitize → parse → `NoRecipeFound`-check → shape-check, retrying **once, only on a malformed-shape result**, with an extra reinforcement prompt block appended to the retry call. `NoRecipeFound` and invalid-JSON responses are never retried — the former is already a correct, intentional model response; the latter is a separate, pre-existing failure mode.

This is the one genuinely new shared abstraction in this change, not introduced casually: all three import routes (`app.ts`'s import-text/import-url, `importImage.ts`) had already independently duplicated the sanitize/parse/`NoRecipeFound`-check block, and the per-step-notes work directly above this entry is itself an account of that exact duplication once causing a missed fix (`importImage.ts` needed the identical response-shaping change independently). Consolidating the retry orchestration into one function avoids repeating that.

A still-unusable-after-retry candidate now returns a clean `502 {error: 'ExtractionError', message: '...'}` explaining the AI extraction was incomplete and suggesting manual entry, instead of the old confusing 422. Verified against the live API, not just the SDK's `.d.ts`: both original failing URLs, plus the isolating plain-text case, now return clean `200` successes on the first attempt post-fix — the schema tightening alone resolved these particular cases without needing the retry path.

### Natural-Language Event-Planning Quick Fill

`EventPlanner.tsx` gained an always-visible "Quick Fill: Describe Your Guest List" input above the three guest-breakdown number fields — type "dinner for 12, 3 vegetarian, 1 vegan" and click "Fill In" instead of typing three numbers by hand. Deliberately scoped to the guest breakdown only; recipe selection stays the existing checkbox grid, matching the framing this is "a UI layer over the existing `GuestGroup` model, not new domain logic."

**Hybrid, regex-first with an AI fallback** — chosen specifically off the back of the issue #1 lesson above, for a target narrow enough that a regex genuinely covers the common cases without reintroducing that risk. `parseGuestGroupText()` (`packages/domain/src/events/parseGuestGroupText.ts`, see §4 entry 4) runs first, for free and instantly. Only when it returns `null` — can't confidently determine `totalGuests` (word-numbers like "twenty five," no digits at all, or a dietary count with no total-guest signal) — does `POST /api/events/parse-description` fall back to a live Gemini call (`parseGuestGroupWithGemini`/`parseGuestGroupWithGeminiTimeout`, `geminiClient.ts`), entirely separate prompt/schema from the recipe-import ones. A request the heuristic resolves never requires `GEMINI_API_KEY` to be configured at all — a real, tested property of the design, not just an optimization.

**No bounded-retry orchestrator on the AI-fallback path**, unlike `aiRecipeExtraction.ts` above — deliberate, not an oversight. The target is one required integer plus two optional ones; there's no nested-array structure for a model to garble the way it garbled `ingredients`/`instructions` in issue #1, so that machinery isn't proportionate here. The `anyOf`-with-real-`required` schema shape (issue #1's fix) is applied from the start rather than retrofitted. Verified live: all four canonical phrases resolve via the heuristic with zero Gemini calls; a genuinely ambiguous description (no guest count stated at all) correctly returns a clean `502 ExtractionError` rather than a guess; a word-number phrasing ("twenty five friends... five of them only eat plants") correctly falls back to Gemini and returns `{totalGuests: 25, vegetarianCount: 5, veganCount: 5, source: 'ai'}` — vegan count applied to vegetarian count too, matching `GuestGroup`'s inclusive-subset semantics.

The one input-adjacent detail worth flagging for future edits: the quick-fill input lives inside `EventPlanner.tsx`'s existing `<form onSubmit={handleSubmit}>`, so its "Fill In" button is `type="button"` and the text input has an `onKeyDown` guard that `preventDefault()`s on Enter — otherwise pressing Enter there would submit the whole event-planning form instead of just parsing the description.

### Request Flow Into Domain (recipe CRUD)

1. Express route handler receives JSON request.
2. Handler passes raw body to `validateAndCreateDomainRecipe(req.body, id)` in `recipeMapper.ts`.
3. Domain constructors (`Quantity`, `IngredientLine`, `Recipe`) validate; a `DomainError` becomes `400 Bad Request` before touching the database.
4. `prisma.$transaction()` performs the atomic SQLite write.
5. The updated Prisma model is mapped back to a domain entity via `toDomainRecipe()` and returned as JSON.

### AI Import Pipeline

`geminiClient.ts` is the single integration point with `@google/genai`. It supports fixture interception (`USE_GEMINI_FIXTURES=true`, backed by `src/__fixtures__/recordedGeminiFixtures.ts`) so E2E tests and local dev never need a live API key or incur API cost; `checkProductionGuard()` throws at startup if fixtures are enabled with `NODE_ENV=production`. `importUrl.ts` fetches user-supplied URLs behind `ssrfGuard.ts` (blocks internal/private network targets) with a 2MB decompressed-size cap and a 30s timeout; `importImage.ts` validates uploads via streaming Busboy parsing and magic-byte header sniffing (not just file extension) before ever calling Gemini. The shared `GEMINI_SYSTEM_PROMPT` extracts both `ingredients` and an ordered `instructions: string[]` array; a `stepsFromInstructions()` helper in `recipeMapper.ts` bridges the AI-facing `instructions` field name to the domain-facing `steps` field before validation (these are genuinely different field names at two boundaries — this was a real bug caught during implementation, since calling the recipe validator directly on the raw Gemini JSON silently dropped every extracted instruction).

**Rate-limit error handling**: a volume re-check of AI-import reliability found the free-tier `GEMINI_API_KEY` this project runs on (5 req/min) genuinely gets exhausted under moderate testing load, and every AI-call route was returning the raw upstream Gemini error JSON (quota metrics, a Cloud console link) straight through via a generic `Upstream AI service error: ...` message. `geminiClient.ts` exports `isGeminiRateLimitError(err)` (`err instanceof ApiError && err.status === 429` — `ApiError` is `@google/genai`'s own typed error, checked via `instanceof`/`.status` rather than string-matching `.message`, since `.message` on a live `ApiError` _is_ the raw JSON blob) and `GEMINI_RATE_LIMIT_MESSAGE`, a clean human-readable string. All four AI-call routes (`import-text`, `import-url`, `import-image`, `parse-description`) check this first in their catch block and return `429 {error: 'RateLimited', message: GEMINI_RATE_LIMIT_MESSAGE}` instead of falling through to the generic 502 path. Verified live, not just against mocks: a rapid-fire burst against the real (still-quota-exhausted) API returned the clean message on every call. This only cleans up the _message_ — the underlying quota constraint itself is unaddressed and would need a paid tier or app-level request throttling before AI import could be called reliable under real usage (see `docs/COOKOUT_STRATEGY.md` §6).

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
   - `RecipeForm.tsx` — dual-purpose creation/edit form: name, servings, dietary tags, an ingredients editor, an ordered step editor (add/remove, plus reorder — order is load-bearing for instructions, unlike ingredients) with per-step timing and a free-text notes field (each collapsed behind its own toggle), plus a 4-mode AI import flow (Text / URL / Image / Camera) that pre-fills the form (including steps) from a Gemini draft for human review before submission. Camera mode uses a dedicated file input with `capture="environment"` for fast mobile photo capture. Step reorder has two parallel controls: the original up/down buttons (the keyboard/screen-reader-accessible path, unchanged) and a drag handle built on framer-motion's `Reorder`/`useDragControls` (a `RecipeStepRow` subcomponent, since the handle-only-drag pattern needs `useDragControls()` called per-row, which can't happen inside the parent's `.map()`). Steps carry a client-only `id` (never sent to the server) purely so `Reorder.Item` and React have a stable identity to key off during a drag.
   - `RecipeList.tsx` — recipe card grid with server-side search-by-name and dietary-tag filtering (debounced ~300ms for search), bulk select/delete (operating on whatever's currently loaded, not the whole catalog), "send to shopping list," an Instructions section per card, Edit/Delete actions, and a "Load More" button backed by cursor pagination (see §10's Recipe List Pagination).
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

- **Cost Estimation**: Price estimates on shopping list items.
- **Practical Scaling batch-size recommendation**: the non-linear-rounding _shipping-list-quantity_ half of this idea is built (see §5 item 5, §10's "Practical Scaling v2" note) — what's still unbuilt is the other half from `docs/ideas/practical-scaling.md`: recommending a different serving-size batch (e.g. "make 8 servings instead of 6") to minimize rounding waste across a whole recipe.
- **Auth & Multi-Tenancy**: No user login; all recipes, events, and shopping lists are global and shared in one SQLite database.

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
10. **Recipe Pagination Diverges the Fetch Hook Rather Than Paginating the Shared One**: `useRecipes()` (unpaginated) and `useRecipesPage()` (cursor-paginated) are two separate hooks/query keys hitting the same `GET /api/recipes` route, distinguished server-side purely by whether `limit` is present. The alternative — paginating the one shared `['recipes']` cache — was rejected because `ShoppingListBuilder`/`EventPlanner` need the full catalog as a selector and would have silently broken (only seeing page 1) had the shared hook's shape changed. The cost: two hooks to keep in sync (the four recipe-mutation hooks now invalidate both query keys), and RecipeList's search/dietary-tag filtering had to move server-side alongside the pagination, since filtering only the loaded page would silently stop searching the whole catalog.
11. **Step Reorder Keeps the Up/Down Buttons Even After Adding Drag-and-Drop**: framer-motion's `Reorder` is pointer/mouse-driven, not independently keyboard-accessible, so the original up/down buttons (wired to the same `handleMoveStep`) stay as the accessible path rather than being replaced. The drag handle is additive. This also means the existing RTL test asserting reorder via `getByLabelText('Move step 3 up')` needed no changes.

---

# 14. ADR Summary

### ADR 0001: Monorepo Architecture

- **Decision**: Adopt npm workspaces with three packages (`packages/domain`, `apps/api`, `apps/web`).
- **Rationale**: Strict separation of concerns; `packages/domain` has zero framework dependencies and could be published or reused independently.
- **Tradeoffs**: Requires path mapping and module resolution configuration across workspaces.

---

# 15. Technical Debt

| Debt                                                    | Severity | Impact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Mitigation Plan                                                                                                                                                                                                       |
| :------------------------------------------------------ | :------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JSON Column for Dietary Tags**                        | Low      | `dietaryTagsJson` string column in Prisma SQLite requires manual JSON parse/serialize.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Migrate to a normalized join table if the database ever moves off SQLite.                                                                                                                                             |
| **No Authentication / Multi-Tenancy**                   | Medium   | All recipes in SQLite are global and shared.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Add user authentication and a `userId` foreign key on `Recipe`.                                                                                                                                                       |
| **Unbounded List Fetching (partially resolved)**        | Low      | `GET /api/recipes` still returns everything unbounded by default — RecipeList now paginates via `?limit=...`, but ShoppingListBuilder/EventPlanner deliberately still call the unbounded form (they need the full catalog as a selector).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | If either selector UI ever needs to scale past a full-catalog fetch, it needs its own solution (e.g. a lightweight `{id, name}`-only listing) — pagination isn't a fit for a "pick from everything" selector.         |
| **Checkbox Toggle: Session-Only Resilience (resolved)** | Low      | `useToggleShoppingListItemChecked()` retries a failed `PATCH .../items/:itemId` (3 attempts, exponential backoff) before rolling back — covers spotty-connection fetch failures. A literal offline (`navigator.onLine === false`) mutation pauses via TanStack Query's built-in `networkMode`, **and now survives a full page reload while still offline**: `App.tsx` persists the query client to `localStorage` via `@tanstack/react-query-persist-client` + `@tanstack/query-sync-storage-persister`, scoped to only this mutation (`shouldDehydrateMutation` checks `TOGGLE_SHOPPING_LIST_ITEM_MUTATION_KEY`), and resumes it via `queryClient.resumePausedMutations()` once the persisted cache is restored. Requires `queryClient.setMutationDefaults()` registration (see `queries.ts`'s doc comment on the hook) since a mutation rehydrated before any component mounts needs to already know its `mutationFn`. | None outstanding for this specific gap. A broader "view/edit recipes fully offline" story (Plan to Eat's partial-offline model, per `docs/COOKOUT_STRATEGY.md`) is still unbuilt — this only covers the one mutation. |

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

- **Strengths**: Outstanding domain isolation, immutable value objects throughout, clean monorepo boundaries, comprehensive automated test coverage (412 Vitest + 9 Playwright E2E), strict TypeScript typing, deterministic-domain/AI-at-the-edge separation maintained even as the AI import surface grew to four input modes and now extracts instructions (with per-step duration/temperature/notes) too, and even as grocery-category grouping was added via a keyword heuristic rather than a Gemini call. Recipes, events, and shopping lists are all now genuinely persisted and revisitable — not just planning tools that reset on refresh — while still cleanly separating ephemeral preview computation from deliberate, user-triggered save actions. Live Gemini calls now enforce a structured-output schema (split via `anyOf` into distinct success/error shapes, not one flat optional-everywhere object) rather than relying on prompt text alone for JSON-shape compliance, backstopped by an app-layer shape guard with one bounded, reinforced-prompt retry — verified live, not just against the SDK's types. The shopping-list checkbox toggle tolerates transient (spotty-WiFi) mutation failures via retry, **and now survives a full page reload while genuinely offline too**, via a localStorage-backed query-client persister that resumes the paused mutation once back online (verified by an integration test that unmounts and remounts `<App />` mid-test). A global standing pantry can subtract on-hand stock from any generated list, and **Practical Scaling v2 rounds fractional Count-category shopping-list quantities up to a buyable whole amount** (e.g. "1 egg" not "0.25 egg"), exposing the exact mathematical figure alongside it rather than silently discarding it. A Gemini 429/rate-limit rejection is now detected specifically (`err instanceof ApiError && err.status === 429`) and returns a clean, generic message across all four AI-call routes instead of leaking the raw upstream quota-error JSON. Recipe steps carry optional duration, temperature, and free-text notes. The manual category-override editing UI (set and reset) is no longer confined to saved shopping lists — it now works identically on ephemeral previews (build-mode, event-plan preview), which re-run their underlying mutation on a successful correction since preview data isn't a cached query. The one differentiator the competitive intelligence audit found survives scrutiny — `GuestGroup`'s eligible-servings computation — now has a natural-language quick fill in front of it, deliberately kept regex-first with AI only as a fallback rather than reaching for a live model by default.
- **Weaknesses**: Lack of authentication; no cost-estimation feature; RecipeList's pagination doesn't extend to ShoppingListBuilder/EventPlanner's selector views, which stay intentionally unbounded; Practical Scaling v2 covers only the shopping-list-quantity rounding half of the original idea, not the batch-size (serving-count) recommendation half.
- **Maintainability**: Excellent — modular architecture and thorough tests make adding new features straightforward and safe.
