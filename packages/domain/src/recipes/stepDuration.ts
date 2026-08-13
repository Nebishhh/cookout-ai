import { InvalidRecipeError } from '../errors.js';

export type DurationUnit = 'minutes' | 'hours';

const VALID_DURATION_UNITS: readonly DurationUnit[] = ['minutes', 'hours'];

/**
 * How long a single recipe step takes (e.g. "bake for 25 minutes"). Deliberately minimal —
 * captured/displayed only, never summed or converted across a recipe the way ingredient
 * Quantity is, so no convertTo()/scale() methods exist here.
 */
export class StepDuration {
  readonly amount: number;
  readonly unit: DurationUnit;

  constructor(amount: number, unit: string) {
    if (typeof amount !== 'number' || isNaN(amount) || !Number.isFinite(amount) || amount < 0) {
      throw new InvalidRecipeError(
        `Invalid step duration amount: ${amount}. Amount must be a non-negative finite number.`
      );
    }

    if (!VALID_DURATION_UNITS.includes(unit as DurationUnit)) {
      throw new InvalidRecipeError(
        `Invalid step duration unit: "${unit}". Must be one of: ${VALID_DURATION_UNITS.join(', ')}.`
      );
    }

    this.amount = amount;
    this.unit = unit as DurationUnit;

    Object.freeze(this);
  }
}
