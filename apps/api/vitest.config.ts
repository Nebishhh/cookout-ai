import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  // Resolve @cookout-ai/domain to its TypeScript source (see the package's exports map) so tests
  // always run against current domain code, never a stale or missing dist/.
  ssr: {
    resolve: {
      conditions: ['@cookout-ai/source', ...defaultServerConditions],
    },
  },
  test: {
    globals: true,
    environment: 'node',
    // All test files in this workspace share one physical SQLite file (below), so
    // run them serially — parallel workers racing inserts/deletes against the same
    // file produces cross-file test pollution (see PROJECT_STATE.md §9).
    fileParallelism: false,
    globalSetup: path.resolve(__dirname, 'vitest.globalSetup.ts'),
    env: {
      DATABASE_URL: `file:${path.resolve(__dirname, '../../prisma/test.db')}`,
    },
  },
});
