import { InvalidEventError } from '../errors.js';

/**
 * Normalizes a dish's servings override: absent (undefined or null) means "no override" and
 * becomes null; anything else must be a positive whole number. Shared by the Event constructor
 * (what gets stored) and splitCourseServings (what gets planned), so both reject the same values.
 *
 * Whole numbers only, unlike computed servings, which can be fractional (4.5 of a dish when a
 * course is split): an override is a number a host types, and they cook whole portions.
 *
 * @param context Names the dish in the error message, e.g. `recipe "r1"`.
 */
export function normalizeServingsOverride(value: unknown, context: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new InvalidEventError(
      `Invalid servingsOverride for ${context}: ${String(value)}. It must be a positive whole number, or null for no override.`
    );
  }

  return value;
}
