import { InvalidRecipeError } from '../errors.js';

export type TemperatureUnit = 'F' | 'C';

const VALID_TEMPERATURE_UNITS: readonly TemperatureUnit[] = ['F', 'C'];

/**
 * The temperature stated for a single recipe step (e.g. "bake at 350°F"). Deliberately
 * minimal — captured/displayed only, never summed or converted across a recipe, so no
 * convertTo()/scale() methods exist here.
 */
export class StepTemperature {
  readonly amount: number;
  readonly unit: TemperatureUnit;

  constructor(amount: number, unit: string) {
    if (typeof amount !== 'number' || isNaN(amount) || !Number.isFinite(amount)) {
      throw new InvalidRecipeError(
        `Invalid step temperature amount: ${amount}. Amount must be a finite number.`
      );
    }

    if (!VALID_TEMPERATURE_UNITS.includes(unit as TemperatureUnit)) {
      throw new InvalidRecipeError(
        `Invalid step temperature unit: "${unit}". Must be one of: ${VALID_TEMPERATURE_UNITS.join(', ')}.`
      );
    }

    this.amount = amount;
    this.unit = unit as TemperatureUnit;

    Object.freeze(this);
  }
}
