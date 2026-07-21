import type { IngredientLine } from './ingredientLine.js';

/**
 * Dietary tags supported by CookOut AI.
 */
export enum DietaryTag {
  Vegetarian = 'Vegetarian',
  Vegan = 'Vegan',
}

/**
 * Open Question / Scope Notes:
 * - Dietary tag ENFORCEMENT (e.g. excluding a recipe for a vegetarian guest,
 *   or substituting ingredients) is not implemented here. This milestone only
 *   stores and carries the tags through scaling — it does not act on them.
 */
export interface ScaledRecipe {
  readonly sourceRecipeId: string;
  readonly sourceRecipeName: string;
  readonly targetServings: number;
  readonly scaleFactor: number;
  readonly ingredients: readonly IngredientLine[];
  readonly dietaryTags: readonly DietaryTag[];
}
