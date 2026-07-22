import type { Recipe } from '../recipes/recipe.js';
import type { ScaledRecipe } from '../recipes/types.js';
import type { ShoppingListItem } from '../shopping/types.js';
import type { GuestGroup } from './guestGroup.js';

/**
 * Details of a recipe included in an event plan, along with its scaled serving count.
 */
export interface IncludedRecipePlan {
  readonly scaledRecipe: ScaledRecipe;
  readonly eligibleServings: number;
}

/**
 * Details of a recipe excluded from an event plan due to zero eligible guests,
 * along with the human-readable explanation for exclusion.
 */
export interface ExcludedRecipePlan {
  readonly recipe: Recipe;
  readonly reason: string;
}

/**
 * Output result of an event planning calculation (planEventShoppingList).
 */
export interface EventPlan {
  readonly guestGroup: GuestGroup;
  readonly includedRecipes: ReadonlyArray<IncludedRecipePlan>;
  readonly excludedRecipes: ReadonlyArray<ExcludedRecipePlan>;
  readonly shoppingList: ReadonlyArray<ShoppingListItem>;
}
