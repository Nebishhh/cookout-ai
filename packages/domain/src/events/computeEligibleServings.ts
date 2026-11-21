import type { Recipe } from '../recipes/recipe.js';
import type { GuestGroup } from './guestGroup.js';
import { guestCohorts, isRecipeEligibleForCohort } from './guestCohorts.js';

/**
 * Computes the number of guests in a GuestGroup who can eat a recipe, whatever else is on the
 * menu.
 *
 * Eligibility Rules (defined in guestCohorts.ts, which this sums over):
 * - Recipe tagged Vegan (or tagged BOTH Vegetarian and Vegan):
 *   Eligible for ALL guests (totalGuests). Vegan food is safe for vegetarians and omnivores too.
 * - Recipe tagged Vegetarian (and NOT Vegan):
 *   Eligible for everyone EXCEPT vegan guests (totalGuests - veganCount).
 * - Recipe with NO dietary tags (assumed meat-containing):
 *   Eligible ONLY for guests without dietary restrictions (omnivoreCount = totalGuests - vegetarianCount).
 *
 * Expressed as a sum over cohorts so it can never disagree with splitCourseServings(), which
 * shares servings out using the same cohorts.
 *
 * @param recipe The recipe to evaluate
 * @param guestGroup The target guest group and dietary breakdown
 * @returns The integer count of eligible guests (>= 0)
 */
export function computeEligibleServings(recipe: Recipe, guestGroup: GuestGroup): number {
  return guestCohorts(guestGroup)
    .filter((cohort) => isRecipeEligibleForCohort(recipe, cohort.kind))
    .reduce((sum, cohort) => sum + cohort.size, 0);
}
