import { InvalidShoppingListError } from '../errors.js';
import { Quantity } from '../units/quantity.js';
import { categorizeIngredient, type GroceryCategory } from './groceryCategory.js';

/**
 * Open Question / Scope Notes:
 * - sourceRecipeIds may be an empty array — every line produced by
 *   buildShoppingListLinesFromConsolidated() today will always have at least one, but the
 *   domain layer doesn't force that, leaving room for a future manually-added line with no
 *   recipe source (e.g. "paper towels").
 * - No unit/category migration story if a recipe's ingredient category changes after a
 *   ShoppingList was saved — the saved line keeps whatever Quantity it was created with.
 * - `category` (grocery-aisle grouping, distinct from Quantity's Mass/Volume/Count category)
 *   is derived from ingredientId/displayName in the constructor rather than a passed-in field
 *   — it's a pure function of identity, so every line recomputes it the same way regardless of
 *   when/how it was constructed (fresh from consolidation vs. rehydrated from Prisma), with no
 *   extra constructor param and no persisted column to keep in sync.
 */
export class ShoppingListLine {
  readonly id: string;
  readonly ingredientId: string;
  readonly displayName: string;
  readonly quantity: Quantity;
  readonly sourceRecipeIds: readonly string[];
  readonly checked: boolean;
  readonly category: GroceryCategory;

  constructor(
    id: string,
    ingredientId: string,
    displayName: string,
    quantity: Quantity,
    sourceRecipeIds: string[],
    checked: boolean = false
  ) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new InvalidShoppingListError(
        `Invalid shopping list line id: "${id}". id must be a non-empty string.`
      );
    }

    if (typeof ingredientId !== 'string' || ingredientId.trim().length === 0) {
      throw new InvalidShoppingListError(
        `Invalid ingredientId: "${ingredientId}". ingredientId must be a non-empty string.`
      );
    }

    if (typeof displayName !== 'string' || displayName.trim().length === 0) {
      throw new InvalidShoppingListError(
        `Invalid displayName: "${displayName}". displayName must be a non-empty string.`
      );
    }

    if (!(quantity instanceof Quantity)) {
      throw new InvalidShoppingListError('Invalid quantity: Must be a valid Quantity instance.');
    }

    if (!Array.isArray(sourceRecipeIds)) {
      throw new InvalidShoppingListError('sourceRecipeIds must be an array.');
    }

    for (const recipeId of sourceRecipeIds) {
      if (typeof recipeId !== 'string' || recipeId.trim().length === 0) {
        throw new InvalidShoppingListError(
          `Invalid recipeId in sourceRecipeIds: "${recipeId}". Every entry must be a non-empty string.`
        );
      }
    }

    if (typeof checked !== 'boolean') {
      throw new InvalidShoppingListError('checked must be a boolean.');
    }

    this.id = id;
    this.ingredientId = ingredientId;
    this.displayName = displayName;
    this.quantity = quantity;
    this.sourceRecipeIds = Object.freeze([...sourceRecipeIds]);
    this.checked = checked;
    this.category = categorizeIngredient(ingredientId, displayName);

    Object.freeze(this);
  }
}
