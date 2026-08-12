import type { Quantity } from '../units/quantity.js';
import type { GroceryCategory } from './groceryCategory.js';

/**
 * Open Question / Scope Notes:
 * - Display name reconciliation across recipes (different recipes calling the
 *   same ingredientId by different display text) is not solved — first-seen wins, silently.
 * - Cross-category ingredientId collisions (same id used as Mass in one recipe,
 *   Volume in another) are kept as separate line items rather than merged or flagged.
 * - No rounding or "nice unit" conversion is applied to the consolidated output
 *   (e.g. 236.588 ml is not converted back to cups or liters) — presentation concerns
 *   belong to later milestones.
 */
export interface ShoppingListItem {
  readonly ingredientId: string;
  readonly displayName: string;
  readonly quantity: Quantity;
  readonly sourceRecipeIds: readonly string[];
  readonly category: GroceryCategory;
}
