import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../../');
const schemaPath = path.resolve(rootDir, 'prisma/schema.prisma');
const e2eDbUrl = `file:${path.resolve(rootDir, 'prisma/e2e.db')}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3010',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
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
