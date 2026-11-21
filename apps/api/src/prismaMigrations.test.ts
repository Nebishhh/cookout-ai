import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../../..');
const migrationsDir = path.resolve(rootDir, 'prisma/migrations');

/** Every model in prisma/schema.prisma; the baseline migration has to create all of them. */
const EXPECTED_TABLES = [
  'User',
  'Session',
  'Recipe',
  'IngredientLine',
  'RecipeStep',
  'Event',
  'ShoppingList',
  'ShoppingListItem',
  'IngredientCategoryOverride',
  'PantryItem',
];

/**
 * The schema reaches every database through prisma/migrations now rather than `prisma db push`, so
 * two facts have to keep holding for dev, tests, E2E and the deployed container alike: the history
 * exists, and it still describes schema.prisma exactly.
 *
 * The drift check runs as a test, not only as a CI step, so editing schema.prisma without writing
 * a migration fails on the machine that made the edit instead of in CI minutes later.
 */
describe('prisma migration history', () => {
  it('has a committed sqlite baseline that creates every model', () => {
    const lockPath = path.resolve(migrationsDir, 'migration_lock.toml');
    expect(existsSync(lockPath), `${lockPath} is missing`).toBe(true);
    expect(readFileSync(lockPath, 'utf8')).toContain('sqlite');

    const baselinePath = path.resolve(migrationsDir, '0_init/migration.sql');
    expect(existsSync(baselinePath), `${baselinePath} is missing`).toBe(true);

    const sql = readFileSync(baselinePath, 'utf8');
    for (const table of EXPECTED_TABLES) {
      expect(sql, `baseline does not create ${table}`).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it('still describes schema.prisma with no drift', () => {
    // Read the command out of package.json rather than restating it, so the check a developer runs
    // by hand and the one this test enforces can never be two different commands.
    const pkg = JSON.parse(readFileSync(path.resolve(rootDir, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const command = pkg.scripts['db:check'];
    expect(command, 'package.json must define a db:check script').toBeTruthy();

    // `migrate diff --exit-code` exits non-zero when the history and the schema have diverged, and
    // prints the SQL that would reconcile them — exactly what the failure message should carry.
    let diff = '';
    try {
      execSync(command, { cwd: rootDir, stdio: 'pipe' });
    } catch (err) {
      const e = err as { stdout?: Buffer; stderr?: Buffer };
      diff = `${String(e.stdout ?? '')}${String(e.stderr ?? '')}`.trim() || 'db:check failed';
    }

    expect(diff, 'prisma/migrations no longer matches prisma/schema.prisma').toBe('');
  }, 120_000);
});
