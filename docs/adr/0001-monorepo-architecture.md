# ADR 0001: TypeScript Monorepo Architecture with Shared Domain Core

- **Status**: Accepted
- **Date**: 2026-07-21
- **Authors**: CookOut AI Engineering Team

---

## Context

CookOut AI requires a web application interface (`apps/web`) for event host interaction, a backend API (`apps/api`) for data persistence and AI orchestration, and shared business logic (unit conversion, recipe scaling arithmetic, shopping list consolidation).

Duplicating domain logic across backend and frontend services leads to drift, inconsistent scaling calculations, and increased maintenance burden.

## Decision

We adopt a **TypeScript monorepo** architecture using **npm workspaces**.

1. **`apps/web`**: React + Vite application handling rendering and user interaction.
2. **`apps/api`**: Express.js REST API service for data access and server logic.
3. **`packages/domain`**: Pure TypeScript core library holding domain models, unit scaling, ingredient consolidation logic, and AI prompt schemas. Contains zero UI or web framework dependencies.
4. **`prisma/`**: Centralized database ORM configuration using SQLite for development.

## Consequences

### Positive

- **Single Source of Truth**: Domain calculations (unit conversions, scaling math) are defined once in `@cookout-ai/domain` and shared across frontend and backend.
- **Strict Type Safety**: End-to-end type safety using TypeScript project references (`tsc -b`).
- **Independent Application Deployment**: Applications remain decoupled in `apps/` while sharing the domain core in `packages/`.
- **Fast Local Feedback**: Vitest and Vite provide fast build and test cycles across all workspace packages.

### Negative

- Monorepo tooling setup requires explicit configuration for TypeScript project references and ESLint workspaces.
