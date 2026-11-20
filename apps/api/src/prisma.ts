import { PrismaClient } from '@prisma/client';

// No fallback database: a missing DATABASE_URL used to point the client at prisma/dev.db, so a
// hand-run `start:e2e` or `node dist/index.js` could quietly write test data into the dev
// database. Every supported entry point sets it: `npm run dev` loads apps/api/.env, both Vitest
// configs inject prisma/test.db, Playwright injects prisma/e2e.db, and docker-compose sets it.
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. For local dev, copy apps/api/.env.example to apps/api/.env ' +
      '(npm run dev loads it). Tests and E2E set it themselves.'
  );
}

export const prisma = new PrismaClient();
