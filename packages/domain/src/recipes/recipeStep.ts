import { InvalidRecipeError } from '../errors.js';

/**
 * Open Question / Scope Notes:
 * - RecipeStep deliberately holds only instruction text (no duration, temperature, or notes yet)
 *   so those fields can be added later without a schema change — mirrors IngredientLine's precedent
 *   of a lean, extensible line-item shape.
 * - Ordering is not stored on the step itself; it is implicit in array position within
 *   Recipe.steps, exactly like IngredientLine within Recipe.ingredients.
 */
export class RecipeStep {
  readonly instruction: string;

  constructor(instruction: string) {
    if (typeof instruction !== 'string' || instruction.trim().length === 0) {
      throw new InvalidRecipeError(
        `Invalid step instruction: "${instruction}". instruction must be a non-empty string.`
      );
    }

    this.instruction = instruction;

    Object.freeze(this);
  }
}
