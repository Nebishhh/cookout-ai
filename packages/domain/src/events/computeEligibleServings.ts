import type { Recipe } from '../recipes/recipe.js';
import { DietaryTag } from '../recipes/types.js';
import type { GuestGroup } from './guestGroup.js';

/**
 * Computes the number of eligible guests for a given recipe within a GuestGroup.
 *
 * Eligibility Rules:
 * - Recipe tagged Vegan (or tagged BOTH Vegetarian and Vegan):
 *   Eligible for ALL guests (totalGuests). Vegan food is safe for vegetarians and omnivores too.
 * - Recipe tagged Vegetarian (and NOT Vegan):
 *   Eligible for everyone EXCEPT vegan guests (totalGuests - veganCount).
 * - Recipe with NO dietary tags (assumed meat-containing):
 *   Eligible ONLY for guests without dietary restrictions (omnivoreCount = totalGuests - vegetarianCount).
 *
 * @param recipe The recipe to evaluate
 * @param guestGroup The target guest group and dietary breakdown
 * @returns The integer count of eligible guests (>= 0)
 */
export function computeEligibleServings(recipe: Recipe, guestGroup: GuestGroup): number {
  const tags = recipe.dietaryTags || [];
  const isVegan = tags.includes(DietaryTag.Vegan);
  const isVegetarian = tags.includes(DietaryTag.Vegetarian);

  // If a recipe is tagged Vegan (or both Vegetarian & Vegan), it is eligible for everyone
  if (isVegan) {
    return guestGroup.totalGuests;
  }

  // If a recipe is tagged Vegetarian (and not Vegan), it is eligible for everyone except vegans
  if (isVegetarian) {
    return guestGroup.totalGuests - guestGroup.veganCount;
  }

  // Untagged recipes are eligible only for omnivores (totalGuests - vegetarianCount)
  return guestGroup.omnivoreCount;
}
