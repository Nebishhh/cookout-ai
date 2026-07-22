# PROJECT HANDOFF: CookOut AI

---

## 1. Executive Summary

- **Project Purpose**: **CookOut AI** is a production-grade full-stack web application designed for culinary event planning, smart recipe management, serving scaling, and consolidated shopping list generation across multiple scaled recipes.
- **Current Milestone**: **Milestone 7 Complete** (UI Polish: shadcn/ui Adoption, Accessibility Linting with `jsx-a11y`, TanStack Query State Management).
- **Overall Completion Estimate**: **~70% Complete** (Core Domain Engine, Persisted REST API, Unit Conversions, Recipe Scaling, Shopping List Merging, and Modern Web UI complete; Recipe editing/deletion, multi-guest event splitting, and Gemini AI import pending).
- **Current Development Status**: Stable, fully tested (**78/78 Vitest tests passing**), zero lint/a11y errors, zero UI anti-patterns (`impeccable detect` clean), and production build succeeding across all workspaces.

---

## 2. Technology Stack

- **Frontend**: React 18.3.1, Vite 6.1.0, Tailwind CSS 3.4.17, Lucide React 0.475.0, **shadcn/ui primitives**, **TanStack React Query 5.101.4**, `clsx`, `tailwind-merge`.
- **Backend**: Node.js, Express 4.21.2, CORS 2.8.5, `tsx` 4.19.2.
- **Database**: SQLite (`prisma/dev.db` for development, `prisma/test.db` for automated tests).
- **ORM**: Prisma ORM 6.3.1 (`@prisma/client`).
- **Styling**: Vanilla Tailwind CSS + shadcn/ui design system tokens.
- **Testing**: Vitest 3.0.5, `@testing-library/react` 16.2.0, `@testing-library/jest-dom` 6.6.3, `jsdom` 26.0.0, `supertest` 7.0.0.
- **Tooling**: TypeScript 5.7.3 (Strict mode), ESLint 9.20.1 (Flat Config) with `eslint-plugin-react`, `eslint-plugin-react-hooks`, and `eslint-plugin-jsx-a11y`, Prettier 3.5.1, Husky 9.1.7, `lint-staged` 15.4.3.
- **AI**: Gemini AI abstraction layer scaffolding in `packages/domain/src/ai` (Roadmap item for structured recipe parsing; UI/API integration not yet implemented).
- **Deployment**: Static web build (`apps/web/dist`) + Node.js API server (`apps/api/dist/index.js`).
- **CI/CD**: GitHub Actions workflow (`.github/workflows/ci.yml`) running format check, linting, typechecking, vitest tests, and production build on `main` push and pull requests.
- **Package Manager**: npm Workspaces (v10+).

---

## 3. Repository Structure

```
cookout-ai/
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI pipeline configuration
├── apps/
│   ├── api/                     # Express REST API & Prisma persistence service
│   │   ├── src/
│   │   │   ├── app.ts           # Express application setup & HTTP route handlers
│   │   │   ├── index.ts         # Server entrypoint listening on port 3001
│   │   │   ├── prisma.ts        # Prisma Client singleton
│   │   │   ├── recipeMapper.ts  # Bidirectional mapping between Prisma models & Domain objects
│   │   │   └── middleware/
│   │   │       └── errorHandler.ts # Global Express error handling middleware
│   │   ├── src/app.test.ts      # HTTP API integration tests running against test.db
│   │   └── package.json
│   └── web/                     # React 18 Single-Page Application (Vite)
│       ├── src/
│       │   ├── components/      # Feature components (RecipeForm, RecipeList, ShoppingListBuilder, Navigation)
│       │   ├── components/ui/   # shadcn/ui primitives (Button, Input, Label, Card, Alert, Checkbox, Select)
│       │   ├── lib/
│       │   │   ├── api.ts       # Shared HTTP API client with typed DTOs & error handling
│       │   │   ├── queries.ts   # TanStack Query custom hooks (useRecipes, useCreateRecipe, useBuildShoppingList)
│       │   │   └── utils.ts     # shadcn cn() classname merger utility
│       │   ├── App.tsx          # Main React App layout & QueryClientProvider setup
│       │   ├── App.test.tsx     # Web UI integration tests with isolated QueryClient instances
│       │   ├── main.tsx         # React DOM root entrypoint
│       │   └── index.css        # Tailwind CSS imports & base styles
│       ├── index.html
│       ├── vite.config.ts       # Vite config with /api proxy to http://localhost:3001
│       └── package.json
├── packages/
│   └── domain/                  # Core Business Domain Package (Pure TypeScript)
│       ├── src/
│       │   ├── units/           # Quantity value object, Unit categories, conversion factors
│       │   ├── recipes/         # DietaryTag, IngredientLine, Recipe, scaleRecipe()
│       │   ├── shopping/        # ShoppingListItem, consolidateShoppingList()
│       │   ├── ai/              # AI import abstractions (Placeholder/Interface)
│       │   ├── events/          # Domain event definitions (Placeholder)
│       │   ├── errors.ts        # Domain-specific Error classes
│       │   └── index.ts         # Public domain exports
│       ├── src/**/*.test.ts     # Domain unit tests
│       └── package.json
├── prisma/
│   ├── schema.prisma            # Prisma schema definition (Recipe, IngredientLine)
│   ├── dev.db                   # Development SQLite database
│   └── test.db                  # Test SQLite database (git-ignored)
├── docs/
│   ├── adr/
│   │   └── 0001-monorepo-architecture.md
│   └── glossary.md
├── eslint.config.mjs            # Monorepo ESLint flat config
├── package.json                 # Monorepo root package.json
├── PROJECT_OVERVIEW.md          # High-level project summary
└── tsconfig.base.json           # Shared TypeScript base configuration
```

---

## 4. Architecture

```
[ Web UI (React + TanStack Query) ]
               │
          HTTP / REST
               ▼
[ API Layer (Express Routes + Mapper) ]
               │
   Domain Boundary Validation
               ▼
[ Pure Domain Layer (@cookout-ai/domain) ]
               │
          Persistence
               ▼
[ Infrastructure Layer (Prisma ORM + SQLite) ]
```

- **Domain Layer (`packages/domain`)**: Pure, framework-agnostic TypeScript package containing core business logic (Quantity arithmetic, Unit conversion, Recipe scaling, Shopping list consolidation). Zero runtime external dependencies.
- **Application Layer (`apps/api/src/recipeMapper.ts`)**: Mappers and orchestrators that validate incoming DTOs against domain constructor rules before executing operations.
- **Infrastructure Layer (`apps/api/src/prisma.ts`)**: Persistence handlers that store and query Prisma database records without leaking ORM models into the domain.
- **UI Layer (`apps/web`)**: Client-side single-page app utilizing TanStack Query for server state management and shadcn primitives for rendering.

---

## 5. Domain Model

- **`Quantity`**: Immutable value object representing a numerical amount and a string unit (e.g. `2.5 cups`). Holds category validation, conversion logic (`convertTo`), scaling (`scale`), and float-tolerant comparison (`equals`).
- **`UnitCategory`**: Enum/Type representing unit classifications: `Mass` (g, kg, oz, lb), `Volume` (ml, l, tsp, tbsp, cup, fl oz), and `Count` (count, clove, egg, onion, etc.).
- **`IngredientLine`**: Immutable domain entity representing a single ingredient entry within a recipe. Consists of `ingredientId`, `displayName`, and a `Quantity` object.
- **`Recipe`**: Immutable domain aggregate representing a complete recipe with `id`, `name`, `baseServings` (positive integer), `dietaryTags` (`Vegetarian`, `Vegan`), and `ingredients` (`IngredientLine[]`).
- **`ScaledRecipe`**: Immutable result of scaling a `Recipe` to a target serving count. Contains `sourceRecipeId`, `sourceRecipeName`, `targetServings`, `scaleFactor`, `ingredients`, and `dietaryTags`.
- **`ShoppingListItem`**: Consolidated item containing `ingredientId`, `displayName`, merged `Quantity`, and `sourceRecipeIds[]`.
- **Unimplemented Entities**: `Event`, `Pantry`, `Budget`, and `Guest` are explicitly **not implemented** in the current code base.

---

## 6. Business Rules

1. **Quantity Non-Negativity**: Amount must be strictly non-negative (`amount >= 0`). Attempting to instantiate a negative Quantity throws `InvalidQuantityError`.
2. **Category Isolation**: Unit conversions between different categories (e.g. `g` to `ml`) throw `UnitCategoryMismatchError` unless explicit density factor is supplied.
3. **Floating Point Tolerance**: Quantity equality uses an epsilon threshold (`Math.abs(a - b) < 1e-6`) to handle JS floating-point inaccuracies.
4. **Base Servings Minimum**: `baseServings` must be an integer `>= 1`. Otherwise `InvalidRecipeError` is thrown.
5. **Ingredient Line Uniqueness**: A Recipe cannot contain duplicate `ingredientId`s.
6. **Immutable Recipe Scaling**: `scaleRecipe(recipe, targetServings)` calculates `scaleFactor = targetServings / baseServings` and calls `Quantity.scale(scaleFactor)` on each ingredient line without mutating the input `Recipe`.
7. **Shopping List Grouping**: `consolidateShoppingList(scaledRecipes)` groups ingredients by `(ingredientId, UnitCategory)`. Ingredients sharing an ID but differing in category are kept as separate line items.
8. **Base Unit Merging**: Compatible units within the same category (e.g. `2 cups` + `100 ml`) are converted to the category base unit (`ml`) before summing.
9. **Unimplemented Rules**: Pantry inventory subtraction, budget calculations, and guest dietary split logic are explicitly **not implemented**.

---

## 7. Database

### Complete Prisma Schema (`prisma/schema.prisma`)

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Recipe {
  id              String           @id @default(uuid())
  name            String
  baseServings    Int
  dietaryTagsJson String           @default("[]")
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  ingredients     IngredientLine[]

  @@map("recipes")
}

model IngredientLine {
  id           String   @id @default(uuid())
  recipeId     String
  ingredientId String
  displayName  String
  amount       Float
  unit         String
  position     Int      @default(0)
  recipe       Recipe   @relation(fields: [recipeId], references: [id], onDelete: Cascade)

  @@index([recipeId])
  @@map("ingredient_lines")
}
```

---

## 8. API Endpoints

- **`GET /api/health`**
  - Response: `{ status: "ok", app: "CookOut AI Backend API", timestamp: "..." }`

- **`POST /api/recipes`**
  - Request: `{ name: string, baseServings: number, dietaryTags?: string[], ingredients: [{ ingredientId: string, displayName: string, amount: number, unit: string }] }`
  - Response (201): Saved Recipe JSON DTO.
  - Errors (400): Domain validation error message (`InvalidQuantityError`, `InvalidRecipeError`).

- **`GET /api/recipes`**
  - Response (200): Array of all Recipe JSON DTOs ordered by `createdAt desc`.

- **`GET /api/recipes/:id`**
  - Response (200): Single Recipe DTO.
  - Errors (404): `{ error: "NotFound", message: "Recipe with id ... not found." }`

- **`POST /api/shopping-list`**
  - Request: `[{ recipeId: string, targetServings: number }]`
  - Response (200): `{ shoppingList: ShoppingListItemDto[], scaledRecipes: ScaledRecipeDto[] }`
  - Errors (400/404): Validation or recipe missing errors.

---

## 9. Frontend Architecture

- **Pages / Views**:
  - `/recipes` view (`#recipes` hash): Contains `RecipeForm` (recipe creation) and `RecipeList` (saved recipes grid).
  - `/shopping-list` view (`#shopping-list` hash): Contains `ShoppingListBuilder` (recipe selection, target servings input, consolidated shopping list display, and per-recipe scaled breakdown).
- **Components & Primitives**: Built using shadcn/ui primitives (`Button`, `Input`, `Label`, `Card`, `Alert`, `Checkbox`, `Select`) located in `apps/web/src/components/ui/`.
- **Routing**: Client-side tab switching synchronized with window location hash (`#recipes` vs `#shopping-list`).
- **State Management & Data Fetching**: TanStack React Query (`@tanstack/react-query`). Shared `useRecipes()` hook caches `GET /api/recipes` for 5 minutes (`staleTime: 300000`), eliminating duplicate network requests during tab switching. `useCreateRecipe()` invalidates the query cache on mutation success.

---

## 10. AI (Gemini) Integration

- **Current Status**: Abstract interface definitions exist in `packages/domain/src/ai` as a roadmap placeholder for structured natural language recipe parsing.
- **UI/API Status**: Gemini API keys and LLM execution endpoints are **not implemented** in the current production UI/API flow.

---

## 11. Testing Strategy & Coverage

- **Domain Unit Tests**: 45 tests covering Quantity arithmetic, Unit conversions, Recipe validation, `scaleRecipe()`, and `consolidateShoppingList()`.
- **API Integration Tests**: 9 tests in `apps/api/src/app.test.ts` executing HTTP requests against an isolated `prisma/test.db` database.
- **Web UI Integration Tests**: 6 tests in `apps/web/src/App.test.tsx` testing component rendering, form submit payloads, 400/404 error alert banners, and React Query shared cache deduplication.
- **Total Test Count**: **78 / 78 Vitest tests passing cleanly**.

---

## 12. Current Features Completed

- **Milestone 1**: Immutable `Quantity` value object, category classification, scaling.
- **Milestone 2**: Unit conversion factor tables (`Mass`, `Volume`, `Count`) and epsilon comparisons.
- **Milestone 3**: `Recipe` domain object and immutable `scaleRecipe()` implementation.
- **Milestone 4**: Multi-recipe `consolidateShoppingList()` algorithm.
- **Milestone 5**: Prisma SQLite schema, mapping layer, and REST API endpoints.
- **Milestone 6**: Two-view Web UI (`/recipes` and `/shopping-list`) with proxy setup.
- **Milestone 7**: shadcn/ui adoption, `eslint-plugin-jsx-a11y` accessibility rules, and TanStack Query state caching.

---

## 13. Deferred Features

- Recipe editing or deleting (`PATCH` / `DELETE /api/recipes/:id`).
- Event management & multi-guest count / dietary split calculator.
- Pantry ingredient subtraction.
- Gemini AI recipe import feature.
- User authentication and multi-tenant authorization.

---

## 14. Technical Debt & Compromises

- `DATABASE_URL` in `apps/api/vitest.config.ts` explicitly points to `file:../../prisma/test.db` to prevent test runs from wiping `prisma/dev.db`.
- Unit conversion table is static; dynamic ingredient-specific density conversions (e.g. grams of flour to cups) require density metadata parameters.

---

## 15. Performance Optimizations

- **Query Caching**: TanStack Query caches `GET /api/recipes` for 5 minutes (`staleTime`), avoiding redundant HTTP requests on view switches.
- **Vite Production Bundling**: Code splitting and tree shaking generate a ~244 kB production JS bundle.
- **Database Indexing**: Index added on `IngredientLine(recipeId)` in Prisma schema.

---

## 16. Accessibility (a11y)

- Configured `eslint-plugin-jsx-a11y` recommended rules across `apps/web`.
- All form inputs have associated `<Label htmlFor="...">` elements.
- Custom controls and buttons include explicit `aria-label` and `aria-expanded` attributes.
- Error and success alerts render with `role="alert"`.

---

## 17. Security

- Input validation enforced at domain boundaries before DB persistence.
- CORS enabled on Express backend.
- Authentication/Authorization currently omitted (single-user / open API scope).

---

## 18. Development Workflow

- `npm run dev`: Launches API server (`:3001`) and Vite web server (`:3000`).
- `npm run test`: Runs all 78 Vitest tests.
- `npm run lint`: Runs ESLint with `jsx-a11y` rules.
- `npm run typecheck`: Runs TypeScript `tsc -b`.
- `npm run build`: Builds all monorepo workspaces.

---

## 19. ADR Summary

- **ADR 0001: Monorepo Architecture**: Selected npm Workspaces monorepo structure with `@cookout-ai/domain` (pure TypeScript), `@cookout-ai/api` (Express + Prisma), and `@cookout-ai/web` (Vite + React) for strict separation of concerns and reusability.

---

## 20. Current Milestone Status

- **Milestone 7**: **100% Complete & Verified**.
- All 78 tests passing, linting clean, typechecking clean, and production build succeeded.

---

## 21. Next Recommended Milestone: Milestone 8 — Recipe Editing, Deletion & Confirmation Dialogs

### Proposed Features:

1. `DELETE /api/recipes/:id`: Endpoint to remove a recipe and cascade delete its ingredient lines.
2. `PUT /api/recipes/:id`: Endpoint to update an existing recipe's name, servings, tags, or ingredients.
3. Web UI updates: Add "Edit Recipe" and "Delete Recipe" buttons with shadcn confirmation dialogs.

---

## 22. Lessons Learned & Tradeoffs

- **Domain Purity**: Keeping `@cookout-ai/domain` free of external ORM/framework dependencies simplified testing and prevented business logic leaks.
- **Test Database Isolation**: Setting explicit `process.env.DATABASE_URL` in API vitest config avoided accidental corruption of `dev.db`.
- **Query Cache Sharing**: Centralizing data fetching in TanStack Query custom hooks provided instant tab switching while maintaining accurate cache invalidation.
