/**
 * One-time upgrade step for the multi-tenancy migration: creates a single ordinary User
 * account (no special role/privilege — just the owner-of-record for rows that predate
 * per-user accounts) and backfills every existing Recipe/Event/ShoppingList/
 * IngredientCategoryOverride/PantryItem row onto it.
 *
 * Run this AFTER pushing the schema with userId columns as nullable, and BEFORE
 * flipping them to required + running `prisma db push` again (see PROJECT_STATE.md /
 * the auth migration plan for the full two-step sequence).
 *
 * HOW TO RUN (from the repo root — DATABASE_URL is resolved relative to
 * prisma/schema.prisma's directory, not the process's working directory, matching how
 * apps/api/.env's own DATABASE_URL="file:./dev.db" already points at prisma/dev.db):
 * -----------
 *   BOOTSTRAP_OWNER_EMAIL="you@example.com" BOOTSTRAP_OWNER_PASSWORD="..." \
 *     DATABASE_URL="file:./dev.db" node scripts/backfillOwnerUser.js
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const email = process.env.BOOTSTRAP_OWNER_EMAIL;
const password = process.env.BOOTSTRAP_OWNER_PASSWORD;

if (!email || !email.includes('@')) {
  console.error('BOOTSTRAP_OWNER_EMAIL must be set to a valid email address.');
  process.exit(1);
}
if (!password || password.length < 8) {
  console.error('BOOTSTRAP_OWNER_PASSWORD must be set and at least 8 characters.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set to the database being backfilled.');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const normalizedEmail = email.trim().toLowerCase();

  let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    const passwordHash = await bcrypt.hash(password, 10);
    user = await prisma.user.create({ data: { email: normalizedEmail, passwordHash } });
    console.log(`Created bootstrap owner account: ${user.email} (${user.id})`);
  } else {
    console.log(`Bootstrap owner account already exists: ${user.email} (${user.id})`);
  }

  const results = await prisma.$transaction([
    prisma.recipe.updateMany({ where: { userId: null }, data: { userId: user.id } }),
    prisma.event.updateMany({ where: { userId: null }, data: { userId: user.id } }),
    prisma.shoppingList.updateMany({ where: { userId: null }, data: { userId: user.id } }),
    prisma.ingredientCategoryOverride.updateMany({
      where: { userId: null },
      data: { userId: user.id },
    }),
    prisma.pantryItem.updateMany({ where: { userId: null }, data: { userId: user.id } }),
  ]);

  const [recipes, events, shoppingLists, categoryOverrides, pantryItems] = results;
  console.log('Backfilled ownerless rows onto the bootstrap owner:');
  console.log(`  Recipe: ${recipes.count}`);
  console.log(`  Event: ${events.count}`);
  console.log(`  ShoppingList: ${shoppingLists.count}`);
  console.log(`  IngredientCategoryOverride: ${categoryOverrides.count}`);
  console.log(`  PantryItem: ${pantryItems.count}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
