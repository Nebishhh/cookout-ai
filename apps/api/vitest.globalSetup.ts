import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../..');
const schemaPath = path.resolve(rootDir, 'prisma/schema.prisma');
const testDbUrl = `file:${path.resolve(rootDir, 'prisma/test.db')}`;

/**
 * Pushes the current schema into prisma/test.db before any API test file runs. A fresh clone
 * (or CI runner) has no test.db at all — SQLite would create it empty on first connect and every
 * query would fail with "table does not exist". --accept-data-loss (same as the e2e webServer's
 * push) is safe here because test.db is disposable (app.test.ts's beforeEach wipes it anyway),
 * and DATABASE_URL is set explicitly rather than inherited, so this can never point at dev.db.
 */
export default function setup() {
  execSync(`npx prisma db push --schema="${schemaPath}" --accept-data-loss --skip-generate`, {
    cwd: rootDir,
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'pipe',
  });
}
