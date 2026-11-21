import { InvalidRecipeError } from '../errors.js';
import { IngredientLine } from './ingredientLine.js';
import type { Recipe } from './recipe.js';
import type { ScaledRecipe } from './types.js';

/**
 * Scales a Recipe to a target number of servings.
 *
 * Fractional targets are valid: an event course split can ask for 4.5 servings of a dish (9
 * guests sharing two mains), and the ingredients scale exactly. Callers that take servings from a
 * person typing whole portions (the shopping-list builder) enforce whole numbers themselves.
 *
 * @param recipe The source Recipe domain object to scale.
 * @param targetServings The desired target number of servings (must be a positive, finite number).
 * @returns A ScaledRecipe object containing scaled ingredient quantities.
 * @throws InvalidRecipeError if targetServings is invalid (non-positive, NaN, infinite, or not a number).
 */
export function scaleRecipe(recipe: Recipe, targetServings: number): ScaledRecipe {
  if (
    typeof targetServings !== 'number' ||
    isNaN(targetServings) ||
    !Number.isFinite(targetServings) ||
    targetServings <= 0
  ) {
    throw new InvalidRecipeError(
      `Invalid targetServings: ${targetServings}. targetServings must be a positive number.`
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
