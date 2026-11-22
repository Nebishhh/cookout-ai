-- CreateTable
CREATE TABLE "EventDish" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "course" TEXT,
    "servingsOverride" INTEGER,
    "position" INTEGER NOT NULL,
    CONSTRAINT "EventDish_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EventDish_eventId_idx" ON "EventDish"("eventId");

-- Backfill (hand-written): one EventDish row per recipe id in each event's recipeIdsJson,
-- keeping the array order as "position". course and servingsOverride stay NULL, so every
-- existing dish is its own standalone course and plans exactly as it did before courses.
-- Ids are random version-4 UUIDs, the same shape as every other id Prisma generates here.
-- A row whose recipeIdsJson isn't valid JSON gets no dishes, matching how the API already
-- loaded it (toDomainEvent fell back to an empty list).
INSERT INTO "EventDish" ("id", "eventId", "recipeId", "course", "servingsOverride", "position")
SELECT
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6))),
    "Event"."id",
    "dish"."value",
    NULL,
    NULL,
    "dish"."key"
FROM "Event", json_each("Event"."recipeIdsJson") AS "dish"
WHERE json_valid("Event"."recipeIdsJson") AND "dish"."type" = 'text';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalGuests" INTEGER NOT NULL,
    "vegetarianCount" INTEGER NOT NULL DEFAULT 0,
    "veganCount" INTEGER NOT NULL DEFAULT 0,
    "serveTimeMinutes" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("createdAt", "id", "name", "serveTimeMinutes", "totalGuests", "userId", "veganCount", "vegetarianCount") SELECT "createdAt", "id", "name", "serveTimeMinutes", "totalGuests", "userId", "veganCount", "vegetarianCount" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE INDEX "Event_userId_idx" ON "Event"("userId");

-- Foreign-key check (hand-written). The rebuild above dropped and renamed a table that EventDish
-- and ShoppingList point at, so prove nothing now points nowhere before switching foreign keys
-- back on. PRAGMA foreign_key_check on its own only returns the offending rows, which
-- `migrate deploy` ignores; counting them into a column with CHECK (= 0) turns any violation
-- into an error, so the migration stops (and the container refuses to start) instead of
-- finishing over broken references.
CREATE TEMP TABLE "_event_dishes_fk_guard" ("violations" INTEGER NOT NULL CHECK ("violations" = 0));
INSERT INTO "_event_dishes_fk_guard" ("violations") SELECT COUNT(*) FROM pragma_foreign_key_check;
DROP TABLE "_event_dishes_fk_guard";

PRAGMA defer_foreign_keys=OFF;
PRAGMA foreign_keys=ON;

