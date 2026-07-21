# CookOut AI

> Production-grade full-stack application empowering users to plan cookouts, BBQs, block parties, and family gatherings with intelligent recipe scaling, consolidated shopping lists, pantry tracking, cost estimation, and Gemini AI assistance.

---

## Project Vision

Planning outdoor gatherings and large group meals often involves tedious manual arithmetic: scaling ingredients from 4 servings to 35 guests, merging duplicate ingredients across multiple recipes, tracking items already in the pantry, estimating total grocery budgets, and optimizing prep timelines.

**CookOut AI** solves this problem by serving as an end-to-end intelligent event culinary planner. It enables host planners to:

1. **Import & Scale Recipes**: Scale ingredient quantities accurately based on guest counts, dietary preferences, and portion multipliers.
2. **Consolidate Shopping Lists**: Merge unit measurements seamlessly and generate organized grocery checklists.
3. **Pantry & Budget Optimization**: Track available pantry inventory to avoid redundant purchases and estimate total cookout expense.
4. **AI Culinary Assistant**: Leverage Gemini AI for recipe parsing from text/URLs, menu suggestions, prep schedule generation, and diet-swaps.

---

## Architecture

The project is structured as a modern TypeScript monorepo designed for clean separation of concerns, strict type safety, and testability.

```
cookout-ai/
├── apps/
│   ├── api/             # Express.js REST API & Backend application layer
│   └── web/             # React + Vite + Tailwind CSS + shadcn/ui Frontend app
├── packages/
│   └── domain/          # Core domain models, unit conversions & business logic
├── prisma/              # Prisma ORM schema & database migrations (SQLite dev)
├── docs/                # Architecture Decision Records (ADRs) & domain glossary
└── .github/workflows/   # CI/CD pipelines
```

### Key Architectural Principles

- **Domain-Driven Design (DDD)**: Core domain logic (unit conversions, scaling arithmetic, shopping consolidation) resides in `@cookout-ai/domain` free of UI or framework dependencies.
- **Strict TypeScript Project References**: Shared types and domain modules are compiled cleanly with strict type-checking across package boundaries.
- **Clean API Contract**: `apps/api` exposes structured endpoints for clients, interfacing directly with Prisma ORM and the core domain layer.

---

## Technology Stack

| Layer                 | Technologies                                                      |
| :-------------------- | :---------------------------------------------------------------- |
| **Frontend**          | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Lucide Icons |
| **Backend**           | Node.js, Express.js, TypeScript                                   |
| **Database**          | Prisma ORM, SQLite (Development) / PostgreSQL-compatible          |
| **Testing**           | Vitest                                                            |
| **Tooling & Quality** | ESLint, Prettier, Husky, lint-staged, EditorConfig                |
| **CI/CD**             | GitHub Actions                                                    |

---

## Folder Structure

```
cookout-ai/
├── .github/
│   └── workflows/
│       └── ci.yml           # GitHub Actions CI workflow
├── apps/
│   ├── api/                 # Node/Express API application
│   │   ├── src/
│   │   │   ├── app.ts       # Express app setup & route registration
│   │   │   ├── index.ts     # Server entrypoint
│   │   │   └── app.test.ts  # Integration tests
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── web/                 # React SPA
│       ├── src/
│       │   ├── components/  # UI & shadcn/ui components
│       │   ├── lib/         # Utility functions
│       │   ├── App.tsx      # Application layout & pages
│       │   ├── main.tsx     # React DOM mount point
│       │   └── index.css    # Tailwind CSS & design tokens
│       ├── vite.config.ts
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   └── domain/              # Core business domain package
│       ├── src/
│       │   ├── units/       # Measurement unit scaling & conversion
│       │   ├── recipes/     # Recipe models & ingredient scaling
│       │   ├── shopping/    # Shopping list consolidation
│       │   ├── events/      # Cookout event & guest tracking models
│       │   └── ai/          # AI prompt schemas & parser contracts
│       ├── tsconfig.json
│       └── package.json
├── prisma/
│   └── schema.prisma        # Prisma schema
├── docs/
│   ├── adr/                 # Architecture Decision Records
│   └── glossary.md          # Domain vocabulary reference
├── tsconfig.base.json       # Shared base TypeScript configuration
├── tsconfig.json            # Monorepo root TypeScript references
├── eslint.config.mjs        # Flat ESLint 9 configuration
└── package.json             # Root package.json (npm workspaces)
```

---

## Development Commands

All workspace commands can be run from the root directory:

| Command                | Action                                                       |
| :--------------------- | :----------------------------------------------------------- |
| `npm run dev`          | Start development servers for web and api concurrently       |
| `npm run build`        | Build all workspace applications and packages                |
| `npm run typecheck`    | Run TypeScript compiler check across all projects (`tsc -b`) |
| `npm run lint`         | Run ESLint across the codebase                               |
| `npm run lint:fix`     | Automatically fix ESLint warnings and errors                 |
| `npm run test`         | Run Vitest test suites across the monorepo                   |
| `npm run format`       | Format code with Prettier                                    |
| `npm run format:check` | Check code formatting with Prettier                          |

---

## License

MIT
