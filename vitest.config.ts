import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    env: {
      DATABASE_URL: `file:${path.resolve(__dirname, 'prisma/test.db')}`,
    },
  },
});
