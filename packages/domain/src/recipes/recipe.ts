import { InvalidRecipeError } from '../errors.js';
import { IngredientLine } from './ingredientLine.js';
import type { DietaryTag } from './types.js';

/**
 * Open Question / Scope Notes:
 * - Duplicate ingredientId values within a single recipe are not validated against in this milestone.
 *   A recipe accidentally listing "flour" twice as separate lines is not rejected here.
 * - Cross-recipe ingredient consolidation (matching "flour" across two different recipes) is explicitly out of scope.
 * - Dietary tag ENFORCEMENT (e.g. filtering recipes for vegetarian guests) is not implemented here;
 *   tags are stored and carried through scaling without modification or action.
 */
export class Recipe {
  readonly id: string;
  readonly name: string;
  readonly baseServings: number;
  readonly dietaryTags: readonly DietaryTag[];
  readonly ingredients: readonly IngredientLine[];

  constructor(
    id: string,
    name: string,
    baseServings: number,
    ingredients: IngredientLine[],
    dietaryTags: DietaryTag[] = []
  ) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new InvalidRecipeError(`Invalid recipe id: "${id}". id must be a non-empty string.`);
    }

    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new InvalidRecipeError(
        `Invalid recipe name: "${name}". name must be a non-empty string.`
      );
    }

    if (
      typeof baseServings !== 'number' ||
      isNaN(baseServings) ||
      !Number.isFinite(baseServings) ||
      !Number.isInteger(baseServings) ||
      baseServings <= 0
    ) {
      throw new InvalidRecipeError(
        `Invalid baseServings: ${baseServings}. baseServings must be a positive integer.`
      );
    }

    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      throw new InvalidRecipeError(
        'Recipe ingredients must be a non-empty array containing at least one IngredientLine.'
      );
    }

    for (const line of ingredients) {
      if (!(line instanceof IngredientLine)) {
        throw new InvalidRecipeError(
          'All items in ingredients array must be instances of IngredientLine.'
        );
      }
    }

    if (!Array.isArray(dietaryTags)) {
      throw new InvalidRecipeError('dietaryTags must be an array.');
    }

    this.id = id;
    this.name = name;
    this.baseServings = baseServings;
    this.ingredients = Object.freeze([...ingredients]);
    this.dietaryTags = Object.freeze([...dietaryTags]);

    Object.freeze(this);
  }
}
