import { InvalidRecipeError } from '../errors.js';

export type DurationUnit = 'minutes' | 'hours';

const VALID_DURATION_UNITS: readonly DurationUnit[] = ['minutes', 'hours'];

/**
 * How long a single recipe step takes (e.g. "bake for 25 minutes").
 *
 * Open Question / Scope Notes:
 * - `toMinutes()` normalizes to a single comparable unit so step durations can be summed
 *   across a recipe by computeCookSchedule() (see events/cookSchedule.ts). This reverses an
 *   earlier scope note here that said durations are "captured/displayed only, never summed or
 *   converted" — backward cook scheduling made that summing a real requirement.
 * - Still deliberately NO scale() — unlike ingredient Quantity, a duration does not scale with
 *   serving count. Doubling a recipe doesn't double its bake time, and pretending otherwise
 *   would produce confidently wrong schedules.
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

  /** Normalized to minutes, the single unit cook scheduling compares and sums in. */
  toMinutes(): number {
    return this.unit === 'hours' ? this.amount * 60 : this.amount;
  }
}
