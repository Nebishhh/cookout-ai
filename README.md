# CookOut AI

> Full-stack TypeScript monorepo empowering hosts to plan outdoor gatherings, cookouts, and family events with intelligent recipe scaling, unit-aware grocery list consolidation, dietary-tag-aware event planning, and AI-assisted recipe import.

---

## Features

- **Recipe Management & Scaling**: Create, edit, delete, and view recipes with custom serving counts. Automatically scale ingredient quantities up or down while keeping measurement units consistent.
- **Consolidated Shopping List Builder**: Select multiple recipes, set target serving counts for each, and generate a unified ingredient shopping list that merges duplicate items and converts compatible units (e.g., combining `tsp`, `tbsp`, `cup`, or `g` and `kg`).
- **Dietary-Aware Event Planner**: Define guest groups by dietary preferences (**Total Guests**, **Vegetarian Count**, **Vegan Count**, and derived **Omnivore Count**). Automatically scale eligible recipes (Omnivore, Vegetarian, Vegan) to guest sub-groups and aggregate a complete event grocery list.
- **AI-Powered Recipe Import (Google Gemini AI)**:
  - **Text Import**: Paste raw, unformatted recipe text to parse into structured recipe drafts.
  - **URL Import**: Import recipes from webpage URLs with built-in SSRF (Server-Side Request Forgery) protection and fallback HTML scraping via Cheerio.
  - **Image Upload**: Upload recipe cards, handwritten notes, or cookbook photos (JPEG, PNG, WebP up to 8MB) with streaming Busboy parsing and magic-byte header sniffing.
  - **Camera Capture**: Fast-path camera capture on mobile devices utilizing native `capture="environment"` attribute controls.
  - **Zero Auto-Persistence**: AI-imported recipes pre-fill form fields for human review and require explicit submission before saving to the database.

---

## Monorepo Architecture

```
cookout-ai/
├── apps/
│   ├── api/                 # Express.js REST API & Gemini AI integration
│   │   ├── src/
│   │   │   ├── __fixtures__/ # Recorded Gemini API response fixtures for E2E testing
│   │   │   ├── app.ts        # Express application & route definitions
│   │   │   ├── geminiClient.ts # Gemini API client & fixture interception logic
│   │   │   ├── imageValidator.ts # Busboy streaming & magic byte sniffer
│   │   │   ├── importImage.ts # Multipart image import endpoint handler
│   │   │   ├── importText.ts  # Text import handler
│   │   │   ├── importUrl.ts   # URL import handler
│   │   │   ├── recipeMapper.ts# Domain <-> Prisma model converters
│   │   │   └── ssrfGuard.ts   # SSRF protection validator for URL fetching
│   │   └── package.json
│   └── web/                 # React 18 SPA (Vite + Tailwind CSS + TanStack Query)
│       ├── e2e/             # Playwright E2E end-to-end test specs
│       ├── src/
│       │   ├── components/  # React UI components (RecipeForm, RecipeList, EventPlanner, ShoppingListBuilder)
│       │   ├── lib/         # API client & TanStack Query hooks
│       │   └── App.tsx      # Main application layout & tab navigation
│       └── package.json
├── packages/
│   └── domain/              # Pure TypeScript business domain engine (zero framework dependencies)
│       ├── src/
│       │   ├── events/      # GuestGroup & EventPlan domain models
│       │   ├── recipes/     # Recipe, IngredientLine & scaling logic
│       │   ├── shopping/    # consolidateShoppingList aggregation math
│       │   └── units/       # Quantity & unit conversion math
│       └── package.json
├── prisma/
│   ├── schema.prisma        # SQLite database schema (Recipe & IngredientLine models)
│   └── dev.db               # Local SQLite database
├── scripts/
│   └── smokeTestLiveGemini.js # Standalone script for live Gemini schema verification
├── .env.example             # Template for local environment variables
├── vitest.config.ts         # Vitest root test configuration
└── package.json             # Root workspace configuration (npm workspaces)
```

---

## Technology Stack

| Layer                 | Technologies & Key Libraries                                                                                                  |
| :-------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**          | React 18, Vite 5, TypeScript, Tailwind CSS, TanStack Query (`@tanstack/react-query`), Radix UI Primitives, Lucide React Icons |
| **Backend**           | Node.js, Express 4, `@google/genai` (Gemini 3.6 Flash), Busboy (streaming file validation), Cheerio (HTML parsing), Supertest |
| **Database**          | Prisma 6 ORM, SQLite                                                                                                          |
| **Domain Package**    | Pure TypeScript (Domain-Driven Design, 0 external dependencies)                                                               |
| **Testing**           | Vitest 3 (Unit & Integration), Playwright (E2E)                                                                               |
| **Tooling & Quality** | TypeScript 5 (Strict), ESLint 9 (Flat Config), Prettier, Husky, lint-staged                                                   |

---

## Setup & Installation

### 1. Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 2. Install Dependencies

Clone the repository and install all monorepo workspace dependencies:

```bash
git clone https://github.com/Nebishhh/cookout-ai.git
cd cookout-ai
npm install
```

### 3. Environment Variables Setup

Copy `.env.example` to create local `.env` configuration files:

```bash
# Copy root environment file
cp .env.example .env

# Copy API environment file
cp .env.example apps/api/.env
```

Edit `apps/api/.env` to supply your Google Gemini API key:

```env
DATABASE_URL="file:./dev.db"
PORT=3001
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

### 4. Database Setup

Initialize and sync the local SQLite database schema:

```bash
npx prisma db push --schema=prisma/schema.prisma
```

### 5. Running the Application locally

Start both the API backend server (port 3001) and web frontend dev server (port 3000) concurrently:

```bash
npm run dev
```

Open your browser to `http://localhost:3000` to access CookOut AI.

To allow testing on mobile devices connected to your local network, start the web dev server with host binding:

```bash
npm --workspace=apps/web run dev -- --host
```

---

## Testing

### Unit & Integration Tests (Vitest)

Run all 172 Vitest unit and integration test suites across `domain`, `api`, and `web`:

```bash
npm test
```

### End-to-End Tests (Playwright)

Run the Playwright E2E test suite covering full-stack recipe lifecycle, event planning math, and AI import flows:

```bash
npx playwright test --config=apps/web/playwright.config.ts
```

#### Deterministic Gemini Interception in E2E (`USE_GEMINI_FIXTURES=true`)

Playwright E2E tests automatically spin up dedicated web and API servers with `USE_GEMINI_FIXTURES=true` and an isolated SQLite test database (`prisma/e2e.db`).

- **No Live API Costs or Rate Limits**: Intercepts outbound calls to Gemini AI and returns recorded, deterministic JSON fixtures for text, URL, image, camera, and error cases.
- **Production Guard Security**: `geminiClient.ts` includes a production guard (`checkProductionGuard()`) that throws a runtime `Error` if `USE_GEMINI_FIXTURES=true` when `NODE_ENV=production`, ensuring fixture data can never be served in production deployments.

#### Manual Live Gemini API Smoke Test

To manually check live Gemini API extraction against fixture schemas to detect schema drift over time (outside CI and automated tests):

```bash
node scripts/smokeTestLiveGemini.js
```

---

## Development Commands

All workspace commands can be run from the root directory:

| Command                | Action                                                     |
| :--------------------- | :--------------------------------------------------------- |
| `npm run dev`          | Start development servers for web and api concurrently     |
| `npm run build`        | Build all workspace packages and applications (`tsc -b`)   |
| `npm run typecheck`    | Run strict TypeScript compiler check across all workspaces |
| `npm run lint`         | Run ESLint across the codebase                             |
| `npm run lint:fix`     | Automatically fix ESLint warnings and errors               |
| `npm test`             | Run Vitest unit & integration test suites                  |
| `npm run format`       | Format code with Prettier                                  |
| `npm run format:check` | Check code formatting with Prettier                        |

---

## License

MIT
