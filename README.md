# CookOut AI

**Plan one meal for everyone at the table.**

CookOut AI is a full-stack event-planning app for hosts feeding groups with mixed dietary needs. Tell it how many guests are omnivore, vegetarian, or vegan; choose the dishes; and it calculates how many servings each recipe must provide before producing one scaled, consolidated shopping list.

Most recipe apps can filter by dietary tags. CookOut uses them as inputs to the serving calculation.

> Planning dinner for 12 with 8 omnivores, 3 vegetarians, and 1 vegan? An untagged dish is scaled for 8, a vegetarian dish for 11, and a vegan dish for all 12—automatically.

## What it does

- **Plans for mixed-dietary groups.** Enter a guest breakdown manually or write “dinner for 12, 3 vegetarian, 1 vegan.” CookOut determines the eligible serving count for every dish.
- **Scales recipes without losing unit meaning.** Quantities are calculated by a deterministic domain engine, with compatible units consolidated and countable groceries rounded to practical purchase amounts.
- **Builds one useful shopping list.** Merge ingredients across recipes, group them by grocery aisle, subtract pantry stock, correct categories, save the list, and check items off—even through a temporary loss of connectivity.
- **Imports recipes for review.** Gemini can extract a draft from pasted text, a URL, an uploaded image, or a mobile camera capture. Imported recipes are never saved until the user reviews and submits them.
- **Schedules the cooking.** Add step durations and a serving time to work backward to each dish’s start time. Incomplete timing data is clearly marked as an estimate.
- **Keeps plans and data private.** Recipes, events, pantry items, and shopping lists are scoped to individual accounts. A self-deleting guest mode lets someone try the app without creating one.

## Why it is different

CookOut keeps judgment and arithmetic separate:

- Gemini turns unstructured recipe sources into editable drafts.
- The domain package—not an AI model—handles serving eligibility, scaling, unit conversion, pantry subtraction, practical rounding, and cook scheduling.
- Imported data always passes through validation and human review before persistence.

That boundary keeps the convenient parts flexible and the important math deterministic and testable.

## Architecture

```text
packages/domain  ->  apps/api  ->  apps/web
pure TypeScript      Express       React
business rules       Prisma        TanStack Query
zero runtime deps    Gemini        Tailwind CSS
```

The npm-workspaces monorepo has three deliberately separated layers:

- **`packages/domain`** contains immutable value objects and all business rules. It has no framework or runtime dependencies.
- **`apps/api`** exposes the domain through an Express REST API, persists data with Prisma and SQLite, and contains the Gemini integration.
- **`apps/web`** is a responsive React application using TanStack Query and accessible Radix-based UI primitives.

AI sits at the edge of the system. It never performs recipe scaling, dietary eligibility, unit conversion, or scheduling arithmetic.

## Engineering highlights

- Per-user email/password authentication with hashed credentials and database-backed cookie sessions
- Layered authorization, CSRF origin checks, CORS allowlisting, and rate limits on authentication and AI routes
- SSRF protection for recipe URL imports, including private-network and redirect checks
- Streaming image-size enforcement and magic-byte validation for uploads
- Persisted offline recovery for shopping-list checkbox mutations
- Deterministic Gemini fixtures for end-to-end tests, guarded from production use
- Strict TypeScript across all workspaces
- Unit, integration, and browser coverage across the domain, API, authentication boundaries, offline recovery, and primary user journeys

For the exhaustive implementation snapshot and current test breakdown, see [`PROJECT_STATE.md`](./PROJECT_STATE.md).

## Run locally

### Prerequisites

- Node.js 18 or newer
- npm 9 or newer
- A Gemini API key if you want to use live AI import

### Setup

```bash
git clone https://github.com/Nebishhh/cookout-ai.git
cd cookout-ai
npm install
cp .env.example apps/api/.env
npx prisma db push --schema=prisma/schema.prisma
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000). Create an account or choose **Continue as guest**.

To enable live recipe import, set your key in `apps/api/.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

The web app runs on port `3000`; the API runs on port `3001`. See [`.env.example`](./.env.example) for optional model, origin, and deployment settings.

## Quality checks

Run all commands from the repository root:

| Command                | Purpose                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| `npm test`             | Run the Vitest unit and integration suite                                |
| `npm run test:e2e`     | Run Playwright against isolated web/API servers and a dedicated database |
| `npm run typecheck`    | Type-check every workspace                                               |
| `npm run lint`         | Run ESLint across the repository                                         |
| `npm run format:check` | Check formatting with Prettier                                           |
| `npm run build`        | Build all workspaces                                                     |

End-to-end tests use recorded Gemini fixtures, so they are deterministic and incur no API cost. To exercise the real production import path manually:

```bash
npx tsx --env-file=apps/api/.env scripts/smokeTestLiveGemini.ts
```

This live smoke test consumes Gemini quota and is intentionally excluded from CI.

## Deployment

The repository includes a Docker/Caddy deployment path. See [`DEPLOY.md`](./DEPLOY.md) for environment configuration, trusted-origin setup, database persistence, and upgrade notes.

## Project status

CookOut AI is a pre-launch project built to explore reliable event-planning workflows and clean full-stack architecture. The application is functional and extensively tested, but it is not yet operated as a public consumer service.
