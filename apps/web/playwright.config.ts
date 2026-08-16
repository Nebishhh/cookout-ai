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
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    storageState: storageStatePath,
    // Real browser requests already carry a correct Origin; this only matters for specs that
    // hit the API directly via the `request` fixture (bypassing the page), which — unlike a
    // browser — sets no Origin header on its own, and csrfGuard requires one on every
    // state-changing request. Same trusted origin used by globalSetup.ts's own signup call.
    extraHTTPHeaders: { Origin: 'http://localhost:3010' },
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: `npx prisma db push --schema="${schemaPath}" --accept-data-loss && npm run dev --workspace=apps/api`,
      url: 'http://localhost:3011/api/health',
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
