import { InvalidRecipeError } from '../errors.js';
import { Quantity } from '../units/quantity.js';

/**
 * Open Question / Scope Notes:
 * - ingredientId normalization/slug generation is not implemented here; the caller supplies it directly.
 * - ingredientId uniqueness/normalization across different recipes is NOT enforced or validated here —
 *   that's shopping-list consolidation's job in a later milestone.
 */
export class IngredientLine {
  readonly ingredientId: string;
  readonly displayName: string;
  readonly quantity: Quantity;

  constructor(ingredientId: string, displayName: string, quantity: Quantity) {
    if (typeof ingredientId !== 'string' || ingredientId.trim().length === 0) {
      throw new InvalidRecipeError(
        `Invalid ingredientId: "${ingredientId}". ingredientId must be a non-empty string.`
      );
    }

    if (typeof displayName !== 'string' || displayName.trim().length === 0) {
      throw new InvalidRecipeError(
        `Invalid displayName: "${displayName}". displayName must be a non-empty string.`
      );
    }

    if (!(quantity instanceof Quantity)) {
      throw new InvalidRecipeError('Invalid quantity: Must be a valid Quantity instance.');
    }

    this.ingredientId = ingredientId;
    this.displayName = displayName;
    this.quantity = quantity;

    Object.freeze(this);
  }
}
