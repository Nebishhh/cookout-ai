import { GroceryCategory, InvalidShoppingListError } from '@cookout-ai/domain';
import { prisma } from './prisma.js';

/**
 * Design Note:
 * A manual category correction is a global, ingredientId-keyed fact — matching how
 * categorizeIngredient() already treats category as a pure function of ingredient identity,
 * not something scoped to one recipe or saved list. The domain layer (ShoppingListLine,
 * ShoppingListItem, consolidateShoppingList) stays untouched and keeps producing its
 * heuristic-only category; overrides are resolved at this application boundary and applied
 * when building JSON responses, the same way AI import stays scoped to apps/api and never
 * reaches into domain arithmetic.
 */

const VALID_CATEGORIES = new Set<string>(Object.values(GroceryCategory));

export function isValidGroceryCategory(value: unknown): value is GroceryCategory {
  return typeof value === 'string' && VALID_CATEGORIES.has(value);
}

/** Fetches every stored override as a Map, for a single lookup pass per request. */
export async function getCategoryOverridesMap(): Promise<Map<string, GroceryCategory>> {
  const rows = await prisma.ingredientCategoryOverride.findMany();
  return new Map(rows.map((row) => [row.ingredientId, row.category as GroceryCategory]));
}

/** Applies a resolved override (if any) on top of a heuristic-derived category. */
export function resolveCategory(
  ingredientId: string,
  fallbackCategory: string,
  overrides: ReadonlyMap<string, GroceryCategory>
): string {
  return overrides.get(ingredientId) ?? fallbackCategory;
}

export interface CategoryOverrideResult {
  ingredientId: string;
  category: GroceryCategory;
}

/** Upserts a manual override. Throws InvalidShoppingListError for a malformed ingredientId/category. */
export async function setCategoryOverride(
  ingredientId: string,
  category: unknown
): Promise<CategoryOverrideResult> {
  if (typeof ingredientId !== 'string' || ingredientId.trim().length === 0) {
    throw new InvalidShoppingListError('ingredientId must be a non-empty string.');
  }

  if (!isValidGroceryCategory(category)) {
    throw new InvalidShoppingListError(
      `Invalid category: "${category}". Must be one of: ${[...VALID_CATEGORIES].join(', ')}.`
    );
  }

  const saved = await prisma.ingredientCategoryOverride.upsert({
    where: { ingredientId },
    create: { ingredientId, category },
    update: { category },
  });

  return { ingredientId: saved.ingredientId, category: saved.category as GroceryCategory };
}

/** Clears a manual override, reverting that ingredient to the keyword heuristic. Idempotent. */
export async function clearCategoryOverride(ingredientId: string): Promise<void> {
  await prisma.ingredientCategoryOverride.deleteMany({ where: { ingredientId } });
}
