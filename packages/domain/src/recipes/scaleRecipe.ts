import { InvalidRecipeError } from '../errors.js';
import { IngredientLine } from './ingredientLine.js';
import type { Recipe } from './recipe.js';
import type { ScaledRecipe } from './types.js';

/**
 * Scales a Recipe to a target number of servings.
 *
 * @param recipe The source Recipe domain object to scale.
 * @param targetServings The desired target number of servings (must be a positive integer).
 * @returns A ScaledRecipe object containing scaled ingredient quantities.
 * @throws InvalidRecipeError if targetServings is invalid (non-positive, non-integer, NaN, or infinite).
 */
export function scaleRecipe(recipe: Recipe, targetServings: number): ScaledRecipe {
  if (
    typeof targetServings !== 'number' ||
    isNaN(targetServings) ||
    !Number.isFinite(targetServings) ||
    !Number.isInteger(targetServings) ||
    targetServings <= 0
  ) {
    throw new InvalidRecipeError(
      `Invalid targetServings: ${targetServings}. targetServings must be a positive integer.`
    );
  }

  const scaleFactor = targetServings / recipe.baseServings;

  const scaledIngredients = recipe.ingredients.map((line) => {
    const scaledQuantity = line.quantity.scale(scaleFactor);
    return new IngredientLine(line.ingredientId, line.displayName, scaledQuantity);
  });

  return Object.freeze({
    sourceRecipeId: recipe.id,
    sourceRecipeName: recipe.name,
    targetServings,
    scaleFactor,
    ingredients: Object.freeze(scaledIngredients),
    dietaryTags: recipe.dietaryTags,
  });
}
