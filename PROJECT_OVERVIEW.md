# CookOut AI — Project Documentation

**CookOut AI** is a production-grade full-stack web application designed for culinary event planning, smart recipe management, serving scaling, and consolidated shopping list generation.

---

## 🛠️ Technology Stack

| Layer                                     | Technologies & Libraries                                                                                                                 |
| :---------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| **Language**                              | TypeScript (Strict mode across monorepo)                                                                                                 |
| **Domain Package (`@cookout-ai/domain`)** | Pure TypeScript, Immutable Value Objects, Zero external runtime dependencies                                                             |
| **Backend API (`@cookout-ai/api`)**       | Node.js, Express, Prisma ORM (v6), SQLite (`prisma/dev.db` & `prisma/test.db`), CORS                                                     |
| **Frontend Web (`@cookout-ai/web`)**      | React 18, Vite, Tailwind CSS, Lucide React, **shadcn/ui primitives**, **TanStack React Query (v5)**                                      |
| **Testing & Quality Assurance**           | Vitest, `@testing-library/react`, `jsdom`, ESLint (v9 flat config) with `jsx-a11y` accessibility rules, Prettier, Impeccable UI detector |
| **Monorepo Tools**                        | npm Workspaces, `tsx`, Husky, `lint-staged`                                                                                              |

---

## 🏗️ Architecture & Monorepo Layout

```
cookout-ai/
├── apps/
│   ├── api/                     # Express REST API & Prisma persistence
│   │   ├── src/
│   │   │   ├── app.ts           # Route definitions & request handlers
│   │   │   ├── recipeMapper.ts  # Mappers between Prisma records & Domain models
│   │   │   ├── middleware/      # Express error handler & custom errors
│   │   │   └── prisma.ts        # Prisma Client instantiation
│   │   └── src/app.test.ts      # Integration HTTP API tests against test.db
│   │
│   └── web/                     # Vite + React single-page application
│       ├── src/
│       │   ├── components/      # RecipeForm, RecipeList, ShoppingListBuilder, Navigation
│       │   ├── components/ui/   # shadcn/ui primitives (Button, Input, Label, Card, Alert, Checkbox, Select)
│       │   ├── lib/api.ts       # Shared HTTP API client with typed DTOs & error handling
│       │   ├── lib/queries.ts   # TanStack Query custom hooks (useRecipes, useCreateRecipe, useBuildShoppingList)
│       │   ├── App.tsx          # Main application & QueryClientProvider setup
│       │   └── App.test.tsx     # Integration tests with QueryClient isolation
│       └── vite.config.ts       # Vite configuration & /api proxy to http://localhost:3001
│
├── packages/
│   └── domain/                  # Pure domain logic (Quantity, Recipe, Shopping List)
│       ├── src/
│       │   ├── units/           # Unit categories, conversion factors, Quantity value object
│       │   ├── recipes/         # DietaryTag enum, IngredientLine, Recipe, scaleRecipe()
│       │   └── shopping/        # ShoppingListItem, consolidateShoppingList()
│       └── src/**/*.test.ts     # Domain unit tests
│
├── prisma/
│   ├── schema.prisma            # Prisma database schema (Recipe, IngredientLine)
│   ├── dev.db                   # SQLite database for development
│   └── test.db                  # Isolated SQLite database for automated testing
│
└── eslint.config.mjs            # Project-wide ESLint flat configuration with jsx-a11y rules
```

---

## 🌟 Core Features & Domain Rules

### 1. Immutable Quantity & Unit Conversion System

- **Unit Categories**: Supported categories:
  - **Mass**: `g`, `kg`, `oz`, `lb` (Base unit: `g`)
  - **Volume**: `ml`, `l`, `tsp`, `tbsp`, `cup`, `fl oz` (Base unit: `ml`)
  - **Count**: `count`, `clove`, `egg`, `onion`, etc. (Base unit: `count`)
- **Category Isolation**: Conversions between different categories (e.g. Mass to Volume) throw `UnitCategoryMismatchError` unless explicit density mapping is provided.
- **Precision Floating Point Comparisons**: Includes epsilon-based `equals()` tolerance logic to handle floating-point arithmetic cleanly.

### 2. Recipe Domain Model & Serving Scaling (`scaleRecipe`)

- **Immutable Domain Objects**: `Recipe` and `IngredientLine` domain objects are strictly immutable.
- **Math Reuse**: Scaling a recipe recalculates ingredient amounts by calling `Quantity.scale(scaleFactor)` where `scaleFactor = targetServings / baseServings`.
- **Dietary Tags**: Supports `Vegetarian` and `Vegan` tags.

### 3. Shopping List Consolidation (`consolidateShoppingList`)

- **Group Key**: Groups ingredient lines by `(ingredientId, UnitCategory)`.
- **Cross-Unit Summing**: Ingredient lines in different units within the same category (e.g. `2 cups` + `250 ml` of milk) are converted to base units (`ml`) and summed accurately.
- **Category Mismatch Protection**: Ingredients with the same ID but different categories remain separate items in the consolidated output.

### 4. Persisted REST API (`apps/api`)

- `POST /api/recipes`: Validates recipe data through the domain layer, then persists to SQLite via Prisma. Returns `201 Created`.
- `GET /api/recipes`: Retrieves all recipes ordered by creation date.
- `GET /api/recipes/:id`: Retrieves a single recipe by ID.
- `POST /api/shopping-list`: Accepts array of `{ recipeId, targetServings }`, fetches recipes from SQLite, scales each via `scaleRecipe()`, and consolidates them via `consolidateShoppingList()`.

### 5. Modern Web UI (`apps/web`)

- **Responsive Dark-Mode Aesthetic**: High-contrast, sleek interface with customizable views (`#recipes` and `#shopping-list`).
- **shadcn/ui Primitives**: Form inputs, buttons, checkboxes, dropdowns, alerts, and cards implemented using shadcn primitives built on Tailwind CSS.
- **TanStack Query State Management**: Shared query cache (`useRecipes()`) with 5-minute stale time to eliminate redundant network requests during navigation tab switches.
- **Accessibility (`jsx-a11y`)**: Strict ARIA attributes, semantic HTML elements, and explicit label associations across all forms.

---

## 🚦 Developer Commands Guide

### Running Locally

To launch both the API backend and Web frontend dev servers:

```bash
# Start API on http://localhost:3001 and Web UI on http://localhost:3000
npm run dev
```

### Running Tests

To run the Vitest test suite across all packages (78 unit & integration tests):

```bash
npm run test
```

### Code Quality & Building

```bash
# Run ESLint (including jsx-a11y accessibility rules)
npm run lint

# Run Prettier code formatting
npm run format

# Run TypeScript typecheck across all workspaces
npm run typecheck

# Build production bundles
npm run build
```

---

## 📌 Testing & Quality Guarantees

- **78 / 78 Vitest Unit & Integration Tests** passing cleanly.
- **Dedicated Test Database**: API tests run against an isolated `prisma/test.db` to prevent touching `prisma/dev.db`.
- **0 Anti-patterns**: Audited against `impeccable detect` for visual UI quality.
