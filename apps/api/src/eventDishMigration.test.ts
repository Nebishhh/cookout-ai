import { execSync } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../../..');
const schemaPath = path.resolve(rootDir, 'prisma/schema.prisma');
const migrationsDir = path.resolve(rootDir, 'prisma/migrations');
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function prismaCli(args: string, url: string, input?: string) {
  return execSync(`npx prisma ${args}`, {
    cwd: rootDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
    input,
  });
}

/**
 * A scratch database in exactly the state a pre-course database is in: the 0_init schema,
 * baselined, ready for old-shape rows. Tests then apply the rest of the history with
 * `prisma migrate deploy`, the same command the container and the test setup run. The real deploy
 * path matters: the Event table rebuild in that migration has to leave rows that point at Event
 * (EventDish, ShoppingList) in place, and only the real path proves it does.
 */
function preCourseDatabase(dir: string, name: string): string {
  const url = `file:${path.join(dir, name).replace(/\\/g, '/')}`;
  prismaCli(
    `db execute --file "${path.resolve(migrationsDir, '0_init/migration.sql')}" --url "${url}"`,
    url
  );
  prismaCli(`migrate resolve --applied 0_init --schema="${schemaPath}"`, url);
  return url;
}

const now = new Date().toISOString();
const insertUser = `INSERT INTO "User" ("id", "email", "isGuest", "createdAt", "updatedAt") VALUES ('u1', 'a@example.com', false, '${now}', '${now}')`;
const insertEvent = (id: string, name: string, json: string) =>
  `INSERT INTO "Event" ("id", "userId", "name", "totalGuests", "vegetarianCount", "veganCount", "recipeIdsJson", "createdAt") VALUES ('${id}', 'u1', '${name}', 12, 3, 1, '${json}', '${now}')`;

describe('event dishes migration (backfill from Event.recipeIdsJson)', () => {
  let tmpDir: string;

  beforeAll(() => {
    expect(readdirSync(migrationsDir).some((name) => name.endsWith('_event_dishes'))).toBe(true);
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'cookout-event-dishes-'));
  });

  afterAll(() => {
    if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('turns every saved event into ordered EventDish rows with UUID ids, losing nothing', async () => {
    const dbUrl = preCourseDatabase(tmpDir, 'pre-course.db');
    const client = new PrismaClient({ datasourceUrl: dbUrl });
    try {
      await client.$executeRawUnsafe(insertUser);
      await client.$executeRawUnsafe(insertEvent('e-dinner', 'Dinner', '["r-b","r-a","r-c"]'));
      await client.$executeRawUnsafe(insertEvent('e-empty', 'Menu later', '[]'));
      await client.$executeRawUnsafe(insertEvent('e-broken', 'Corrupt row', 'not json'));
      // A shopping list saved from an event points at Event with ON DELETE CASCADE, so a
      // careless table rebuild would delete it. It has to come through untouched.
      await client.$executeRawUnsafe(
        `INSERT INTO "ShoppingList" ("id", "userId", "name", "eventId", "createdAt") VALUES ('sl-1', 'u1', 'Dinner list', 'e-dinner', '${now}')`
      );
      await client.$executeRawUnsafe(
        `INSERT INTO "ShoppingListItem" ("id", "shoppingListId", "ingredientId", "displayName", "amount", "unit", "sourceRecipeIdsJson", "checked", "position") VALUES ('sli-1', 'sl-1', 'rice', 'Rice', 500, 'g', '["r-a"]', true, 0)`
      );

      // Release the client's connection so the CLI process can rebuild the Event table.
      await client.$disconnect();
      prismaCli(`migrate deploy --schema="${schemaPath}"`, dbUrl);

      const rows = await client.$queryRawUnsafe<
        Array<{
          id: string;
          eventId: string;
          recipeId: string;
          course: string | null;
          servingsOverride: number | null;
          position: number | bigint;
        }>
      >('SELECT * FROM "EventDish" ORDER BY "eventId", "position"');

      expect(rows.map((r) => [r.eventId, r.recipeId, Number(r.position)])).toEqual([
        ['e-dinner', 'r-b', 0],
        ['e-dinner', 'r-a', 1],
        ['e-dinner', 'r-c', 2],
      ]);
      expect(rows.every((r) => r.course === null && r.servingsOverride === null)).toBe(true);
      expect(rows.every((r) => UUID_V4.test(r.id))).toBe(true);
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);

      // Every event survives the rebuild, including the one with corrupt JSON (it loads with no
      // dishes, as it did before), with its other columns intact.
      const kept = await client.$queryRawUnsafe<
        Array<{ id: string; name: string; totalGuests: number | bigint }>
      >('SELECT "id", "name", "totalGuests" FROM "Event" ORDER BY "id"');
      expect(kept.map((e) => [e.id, e.name, Number(e.totalGuests)])).toEqual([
        ['e-broken', 'Corrupt row', 12],
        ['e-dinner', 'Dinner', 12],
        ['e-empty', 'Menu later', 12],
      ]);

      const lists = await client.$queryRawUnsafe<Array<{ id: string; eventId: string }>>(
        'SELECT "id", "eventId" FROM "ShoppingList"'
      );
      expect(lists).toEqual([{ id: 'sl-1', eventId: 'e-dinner' }]);
      const items = await client.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT "id" FROM "ShoppingListItem"'
      );
      expect(items).toEqual([{ id: 'sli-1' }]);

      const columns = await client.$queryRawUnsafe<Array<{ name: string }>>(
        `PRAGMA table_info("Event")`
      );
      expect(columns.map((c) => c.name)).not.toContain('recipeIdsJson');

      const violations = await client.$queryRawUnsafe<unknown[]>('PRAGMA foreign_key_check');
      expect(violations).toEqual([]);
    } finally {
      await client.$disconnect();
    }
  }, 120_000);

  it('stops with an error instead of finishing over a broken foreign key', async () => {
    const dbUrl = preCourseDatabase(tmpDir, 'broken-reference.db');
    // A list item pointing at a list that doesn't exist. Foreign keys are switched off for this
    // one script only, the way a hand edit or an old bug could have left a row.
    prismaCli(
      `db execute --stdin --url "${dbUrl}"`,
      dbUrl,
      `PRAGMA foreign_keys=OFF;
       ${insertUser};
       INSERT INTO "ShoppingListItem" ("id", "shoppingListId", "ingredientId", "displayName", "amount", "unit", "sourceRecipeIdsJson", "checked", "position") VALUES ('orphan', 'no-such-list', 'rice', 'Rice', 1, 'g', '[]', false, 0);`
    );

    let failure = '';
    try {
      prismaCli(`migrate deploy --schema="${schemaPath}"`, dbUrl);
    } catch (err) {
      const e = err as { stdout?: Buffer; stderr?: Buffer };
      failure = `${String(e.stdout ?? '')}${String(e.stderr ?? '')}`;
    }

    expect(failure, 'migrate deploy should have failed').not.toBe('');
    expect(failure).toMatch(/CHECK constraint failed/i);
  }, 120_000);
});
