import { DietaryTag } from '../recipes/types.js';
import { scaleRecipe } from '../recipes/scaleRecipe.js';
import { consolidateShoppingList } from '../shopping/consolidateShoppingList.js';
import type { GuestGroup } from './guestGroup.js';
import { computeEligibleServings } from './computeEligibleServings.js';
import { splitCourseServings } from './splitCourseServings.js';
import type { EventPlan, IncludedRecipePlan, ExcludedRecipePlan, PlanDish } from './types.js';

/**
 * Scope & Simplification Notes (Open Questions):
 * - Servings come from splitCourseServings(): one serving per guest per course, split evenly
 *   across the dishes in a course each guest can eat. A dish with no course is its own course,
 *   so an event with no courses assigned plans exactly as it did before courses existed.
 * - Only Vegetarian and Vegan tags are evaluated (matching DietaryTag scope).
 * - A guest cohort left with nothing to eat in a course is reported in `warnings`. A dish nobody
 *   can eat (and that has no override) is excluded with a reason, as before.
 */

export interface PlanEventShoppingListInput {
  readonly dishes: readonly PlanDish[];
  readonly guestGroup: GuestGroup;
}

/**
 * Orchestrates the event planning pipeline for an event's dishes and a target GuestGroup.
 *
 * Steps:
 * 1. Works out each dish's servings via splitCourseServings() (course split, then overrides).
 * 2. Excludes dishes left with 0 servings, recording the human-readable exclusion reason.
 * 3. Scales included recipes to their servings via scaleRecipe().
 * 4. Consolidates ingredient quantities across all included scaled recipes via consolidateShoppingList().
 * 5. Returns an immutable EventPlan object, with course shortfalls and course totals.
 *
 * @returns EventPlan containing included/excluded recipe breakdowns and consolidated shopping list
 */
export function planEventShoppingList({
  dishes,
  guestGroup,
}: PlanEventShoppingListInput): EventPlan {
  const split = splitCourseServings({ dishes, guestGroup });
  const includedRecipes: IncludedRecipePlan[] = [];
  const excludedRecipes: ExcludedRecipePlan[] = [];

  dishes.forEach((dish, index) => {
    const { recipe } = dish;
    const { servings, servingsWereOverridden } = split.dishes[index];

    if (servings <= 0) {
      let reason = 'No eligible guests for this recipe.';
      const tags = recipe.dietaryTags || [];
      if (!tags.includes(DietaryTag.Vegetarian) && !tags.includes(DietaryTag.Vegan)) {
        reason =
          'No eligible guests: recipe has no vegetarian/vegan tags and all guests have dietary restrictions.';
      } else if (tags.includes(DietaryTag.Vegetarian) && !tags.includes(DietaryTag.Vegan)) {
        reason = 'No eligible guests: recipe is vegetarian (not vegan) and all guests are vegan.';
      }

      excludedRecipes.push({ recipe, reason });
      return;
    }

    includedRecipes.push({
      scaledRecipe: scaleRecipe(recipe, servings),
      eligibleServings: computeEligibleServings(recipe, guestGroup),
      servings,
      course: dish.course ?? null,
      servingsWereOverridden,
    });
  });

  const scaledRecipesForShopping = includedRecipes.map((item) => item.scaledRecipe);
  const shoppingList = consolidateShoppingList(scaledRecipesForShopping);

  return Object.freeze({
    guestGroup,
    includedRecipes: Object.freeze(includedRecipes),
    excludedRecipes: Object.freeze(excludedRecipes),
    shoppingList,
    warnings: split.shortfalls,
    courseSummaries: split.courseSummaries,
  });
}
