import type { Quantity } from '../units/quantity.js';
import type { GroceryCategory } from './groceryCategory.js';

/**
 * Open Question / Scope Notes:
 * - Display name reconciliation across recipes (different recipes calling the
 *   same ingredientId by different display text) is not solved — first-seen wins, silently.
 * - Cross-category ingredientId collisions (same id used as Mass in one recipe,
 *   Volume in another) are kept as separate line items rather than merged or flagged.
 * - The consolidated quantity is exact and in a kitchen unit: the user's own unit when every
 *   merged line shares it, otherwise one chosen by pickKitchenUnit(). Rounding to a buyable
 *   amount happens later, in applyPracticalRounding().
 */
export interface ShoppingListItem {
  readonly ingredientId: string;
  readonly displayName: string;
  readonly quantity: Quantity;
  readonly sourceRecipeIds: readonly string[];
  readonly category: GroceryCategory;
}
