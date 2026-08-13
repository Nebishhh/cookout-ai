import { InvalidRecipeError } from '../errors.js';
import { StepDuration } from './stepDuration.js';
import { StepTemperature } from './stepTemperature.js';

/**
 * Open Question / Scope Notes:
 * - Ordering is not stored on the step itself; it is implicit in array position within
 *   Recipe.steps, exactly like IngredientLine within Recipe.ingredients.
 * - duration/temperature are optional and stored as `| null` (not `undefined`) internally,
 *   matching the ShoppingList.eventId precedent, so JSON serialization is explicit about
 *   "not stated" rather than silently dropping the field.
 */
export class RecipeStep {
  readonly instruction: string;
  readonly duration: StepDuration | null;
  readonly temperature: StepTemperature | null;

  constructor(instruction: string, duration?: StepDuration, temperature?: StepTemperature) {
    if (typeof instruction !== 'string' || instruction.trim().length === 0) {
      throw new InvalidRecipeError(
        `Invalid step instruction: "${instruction}". instruction must be a non-empty string.`
      );
    }

    if (duration !== undefined && !(duration instanceof StepDuration)) {
      throw new InvalidRecipeError('duration must be a StepDuration instance when provided.');
    }

    if (temperature !== undefined && !(temperature instanceof StepTemperature)) {
      throw new InvalidRecipeError('temperature must be a StepTemperature instance when provided.');
    }

    this.instruction = instruction;
    this.duration = duration ?? null;
    this.temperature = temperature ?? null;

    Object.freeze(this);
  }
}
