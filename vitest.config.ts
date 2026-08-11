import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    // apps/api's test files share one physical SQLite file (DATABASE_URL below), and a
    // per-project `fileParallelism: false` in apps/api/vitest.config.ts is not honored by
    // this root `projects` orchestrator's shared worker pool — it must be set here, globally,
    // to actually serialize file execution and avoid cross-file DB races (see PROJECT_STATE.md §9).
    fileParallelism: false,
    env: {
      DATABASE_URL: `file:${path.resolve(__dirname, 'prisma/test.db')}`,
    },
  },
});
