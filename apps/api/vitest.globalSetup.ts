import { execSync } from 'child_process';
import { rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../..');
const schemaPath = path.resolve(rootDir, 'prisma/schema.prisma');
const testDbPath = path.resolve(rootDir, 'prisma/test.db');
const testDbUrl = `file:${testDbPath}`;

/**
 * Builds prisma/test.db from prisma/migrations before any API test file runs. A fresh clone (or CI
 * runner) has no test.db at all — SQLite would create it empty on first connect and every query
 * would fail with "table does not exist".
 *
 * The file is deleted and rebuilt from the migration history rather than updated in place, because
 * `migrate deploy` refuses a database that already holds tables but no _prisma_migrations history
 * (P3005) — which is exactly what every test.db left behind by the old `prisma db push` setup looks
 * like. Rebuilding from empty also means a stale test.db can never leak rows into a run (see
 * PROJECT_STATE.md §9). Both are safe because test.db is disposable: app.test.ts's beforeEach wipes
 * it anyway. The journal/WAL siblings go too, or SQLite would replay state back into the new file.
 *
 * `migrate reset` would express the same intent in one command, but Prisma 6.19's CLI gates it
 * behind a user-consent environment variable when it detects an AI agent, so it can't be relied on
 * for unattended setup.
 *
 * DATABASE_URL is set explicitly rather than inherited, so this can never point at dev.db.
 */
export default function setup() {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    rmSync(`${testDbPath}${suffix}`, { force: true });
  }

  execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
    cwd: rootDir,
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'pipe',
  });
}
