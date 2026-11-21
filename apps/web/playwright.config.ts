import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../../');
const schemaPath = path.resolve(rootDir, 'prisma/schema.prisma');
const e2eDbUrl = `file:${path.resolve(rootDir, 'prisma/e2e.db')}`;
// Kept as a literal, matching globalSetup.ts's own STORAGE_STATE_PATH, rather than imported
// from it — avoids depending on Playwright's config-file TS loader resolving a same-directory
// `.js`-referring-to-`.ts` import the way the app's own NodeNext build does.
const storageStatePath = path.resolve(__dirname, 'e2e/.auth/storageState.json');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  globalSetup: path.resolve(__dirname, 'e2e/globalSetup.ts'),
  use: {
    baseURL: 'http://localhost:3010',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    storageState: storageStatePath,
    // Real browser requests already carry a correct Origin; this only matters for specs that
    // hit the API directly via the `request` fixture (bypassing the page), which — unlike a
    // browser — sets no Origin header on its own, and csrfGuard requires one on every
    // state-changing request. Same trusted origin used by globalSetup.ts's own signup call.
    extraHTTPHeaders: { Origin: 'http://localhost:3010' },
  },
  // Every spec runs on desktop Chrome except mobile-nav.spec.ts, which runs only at phone width.
  // The phone project uses Chromium (Pixel 7 profile, sized to a 390px-wide iPhone screen)
  // because CI installs only Chromium; the iPhone device presets need WebKit.
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile-nav\.spec\.ts/,
    },
    {
      name: 'phone',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
      testMatch: /mobile-nav\.spec\.ts/,
    },
  ],
  webServer: [
    {
      // start:e2e, not dev: no --env-file, so the run is hermetic — it never reads a developer's
      // apps/api/.env (which doesn't exist on a CI runner) and gets all its config from `env` below.
      // The schema comes from prisma/migrations, not a push. `migrate deploy` needs e2e.db to be
      // either absent or already baselined (it refuses a pushed database with no history, P3005),
      // which is why the root `test:e2e` script deletes the file first — run E2E through that
      // script rather than calling Playwright directly.
      command: `npx prisma migrate deploy --schema="${schemaPath}" && npm run start:e2e --workspace=apps/api`,
      url: 'http://localhost:3011/api/health',
      // Covers slow Prisma CLI starts on a loaded Windows machine.
      timeout: 180_000,
      reuseExistingServer: false,
      cwd: rootDir,
      env: {
        PORT: '3011',
        DATABASE_URL: e2eDbUrl,
        USE_GEMINI_FIXTURES: 'true',
        ALLOWED_ORIGINS: 'http://localhost:3010',
      },
    },
    {
      command: 'npx vite --port 3010',
      url: 'http://localhost:3010',
      reuseExistingServer: false,
      cwd: path.resolve(rootDir, 'apps/web'),
      env: {
        VITE_API_TARGET: 'http://localhost:3011',
      },
    },
  ],
});
