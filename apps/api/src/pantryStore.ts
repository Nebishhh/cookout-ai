import { Quantity, InvalidShoppingListError } from '@cookout-ai/domain';
import { prisma } from './prisma.js';

/**
 * Design Note:
 * Pantry stock is a global, ingredientId-keyed standing fact — same shape as
 * categoryOverrides.ts's IngredientCategoryOverride, and for the same reason: "how much of
 * this ingredient do I have on hand" isn't scoped to one recipe or one shopping list, it's a
 * fact about the ingredient itself. Amount/unit validation is delegated to the domain
 * Quantity constructor rather than reimplemented here — an invalid unit or negative amount
 * throws a DomainError (InvalidQuantityError/InvalidUnitError), which the error middleware
 * already maps to 400.
 */

export interface PantryItemResult {
  ingredientId: string;
  displayName: string;
  quantity: Quantity;
}

/** Fetches every pantry row as a Map keyed by ingredientId, for a single lookup pass per request. */
export async function getPantryStockMap(): Promise<Map<string, Quantity>> {
  const rows = await prisma.pantryItem.findMany();
  return new Map(rows.map((row) => [row.ingredientId, new Quantity(row.amount, row.unit)]));
}

/** Fetches every pantry row for the pantry-management UI. */
export async function listPantryItems(): Promise<PantryItemResult[]> {
  const rows = await prisma.pantryItem.findMany();
  return rows.map((row) => ({
    ingredientId: row.ingredientId,
    displayName: row.displayName,
    quantity: new Quantity(row.amount, row.unit),
  }));
}

/** Upserts on-hand stock for an ingredient. Throws a DomainError for a malformed input. */
export async function setPantryItem(
  ingredientId: string,
  displayName: unknown,
  amount: unknown,
  unit: unknown
): Promise<PantryItemResult> {
  if (typeof ingredientId !== 'string' || ingredientId.trim().length === 0) {
    throw new InvalidShoppingListError('ingredientId must be a non-empty string.');
  }

  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    throw new InvalidShoppingListError('displayName must be a non-empty string.');
  }

  // Validates amount/unit via the domain constructor — throws InvalidQuantityError/InvalidUnitError.
  const quantity = new Quantity(amount as number, unit as string);

  const saved = await prisma.pantryItem.upsert({
    where: { ingredientId },
    create: {
      ingredientId,
      displayName: displayName.trim(),
      amount: quantity.amount,
      unit: quantity.unit,
    },
    update: { displayName: displayName.trim(), amount: quantity.amount, unit: quantity.unit },
  });

  return {
    ingredientId: saved.ingredientId,
    displayName: saved.displayName,
    quantity: new Quantity(saved.amount, saved.unit),
  };
}

/** Removes a pantry entry (the ingredient is fully needed again). Idempotent. */
export async function clearPantryItem(ingredientId: string): Promise<void> {
  await prisma.pantryItem.deleteMany({ where: { ingredientId } });
}
