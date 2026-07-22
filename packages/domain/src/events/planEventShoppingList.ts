import type { Recipe } from '../recipes/recipe.js';
import { DietaryTag } from '../recipes/types.js';
import { scaleRecipe } from '../recipes/scaleRecipe.js';
import { consolidateShoppingList } from '../shopping/consolidateShoppingList.js';
import type { GuestGroup } from './guestGroup.js';
import { computeEligibleServings } from './computeEligibleServings.js';
import type { EventPlan, IncludedRecipePlan, ExcludedRecipePlan } from './types.js';

/**
 * Scope & Simplification Notes (Open Questions):
 * - Every eligible recipe is scaled as if ALL its eligible guests are having that dish.
 *   There is no splitting of guests between dishes with identical eligibility (e.g. 2 vegetarian mains both scale to full vegetarian count).
 * - Only Vegetarian and Vegan tags are evaluated (matching DietaryTag scope).
 * - If all recipes are excluded for a guest category, the EventPlan records the exclusion reason
 *   without throwing errors or generating food shortage warnings (handled at UI/UX layer).
 */

/**
 * Orchestrates the event planning pipeline for a collection of recipes and a target GuestGroup.
 *
 * Steps:
 * 1. Computes eligible servings for each recipe via computeEligibleServings().
 * 2. Excludes recipes with 0 eligible guests, recording the human-readable exclusion reason.
 * 3. Scales included recipes to their eligible serving count via scaleRecipe().
 * 4. Consolidates ingredient quantities across all included scaled recipes via consolidateShoppingList().
 * 5. Returns an immutable EventPlan object.
 *
 * @param recipes Array of recipes to evaluate
 * @param guestGroup The target guest group and dietary breakdown
 * @returns EventPlan containing included/excluded recipe breakdowns and consolidated shopping list
 */
export function planEventShoppingList(recipes: Recipe[], guestGroup: GuestGroup): EventPlan {
  const includedRecipes: IncludedRecipePlan[] = [];
  const excludedRecipes: ExcludedRecipePlan[] = [];

  for (const recipe of recipes) {
    const eligibleServings = computeEligibleServings(recipe, guestGroup);

    if (eligibleServings <= 0) {
      let reason = 'No eligible guests for this recipe.';
      const tags = recipe.dietaryTags || [];
      if (!tags.includes(DietaryTag.Vegetarian) && !tags.includes(DietaryTag.Vegan)) {
        reason =
          'No eligible guests: recipe has no vegetarian/vegan tags and all guests have dietary restrictions.';
      } else if (tags.includes(DietaryTag.Vegetarian) && !tags.includes(DietaryTag.Vegan)) {
        reason = 'No eligible guests: recipe is vegetarian (not vegan) and all guests are vegan.';
      }

      excludedRecipes.push({
        recipe,
        reason,
      });
    } else {
      const scaledRecipe = scaleRecipe(recipe, eligibleServings);
      includedRecipes.push({
        scaledRecipe,
        eligibleServings,
      });
    }
  }

  const scaledRecipesForShopping = includedRecipes.map((item) => item.scaledRecipe);
  const shoppingList = consolidateShoppingList(scaledRecipesForShopping);

  return Object.freeze({
    guestGroup,
    includedRecipes: Object.freeze(includedRecipes),
    excludedRecipes: Object.freeze(excludedRecipes),
    shoppingList,
  });
}
