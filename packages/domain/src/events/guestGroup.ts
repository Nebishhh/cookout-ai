import { InvalidGuestGroupError } from '../errors.js';

export interface GuestGroupInput {
  totalGuests: number;
  vegetarianCount?: number;
  veganCount?: number;
}

/**
 * Immutable value object representing a group of guests and their dietary breakdown.
 *
 * Dietary Breakdown Model (Subset Hierarchy):
 * - vegetarianCount represents the total number of guests who will not eat meat (inclusive of vegans).
 * - veganCount represents how many of those vegetarians are specifically vegan.
 * - Invariant: 0 <= veganCount <= vegetarianCount <= totalGuests.
 */
export class GuestGroup {
  readonly totalGuests: number;
  readonly vegetarianCount: number;
  readonly veganCount: number;

  constructor(input: GuestGroupInput) {
    const totalGuests = input.totalGuests;
    const vegetarianCount = input.vegetarianCount ?? 0;
    const veganCount = input.veganCount ?? 0;

    if (!Number.isInteger(totalGuests) || totalGuests <= 0) {
      throw new InvalidGuestGroupError(
        `totalGuests must be a positive integer, received ${totalGuests}`
      );
    }

    if (!Number.isInteger(vegetarianCount) || vegetarianCount < 0) {
      throw new InvalidGuestGroupError(
        `vegetarianCount must be a non-negative integer, received ${vegetarianCount}`
      );
    }

    if (!Number.isInteger(veganCount) || veganCount < 0) {
      throw new InvalidGuestGroupError(
        `veganCount must be a non-negative integer, received ${veganCount}`
      );
    }

    if (veganCount > vegetarianCount) {
      throw new InvalidGuestGroupError(
        `veganCount (${veganCount}) cannot exceed vegetarianCount (${vegetarianCount})`
      );
    }

    if (vegetarianCount > totalGuests) {
      throw new InvalidGuestGroupError(
        `vegetarianCount (${vegetarianCount}) cannot exceed totalGuests (${totalGuests})`
      );
    }

    this.totalGuests = totalGuests;
    this.vegetarianCount = vegetarianCount;
    this.veganCount = veganCount;

    Object.freeze(this);
  }

  /**
   * Derived count of guests with no dietary restrictions (omnivores).
   * Computed dynamically as (totalGuests - vegetarianCount) so it never drifts out of sync.
   */
  get omnivoreCount(): number {
    return this.totalGuests - this.vegetarianCount;
  }
}

export type GuestGroupField = 'totalGuests' | 'vegetarianCount' | 'veganCount';

export interface GuestGroupFieldError {
  field: GuestGroupField;
  /** Plain-language message for display next to the field. */
  message: string;
}

/**
 * Checks the same invariants as the GuestGroup constructor, but returns every problem as a
 * plain-language message keyed by field instead of throwing, so a form can show each one next to
 * the input it belongs to. The constructor's own messages stay technical for API clients.
 */
export function validateGuestGroupInput(input: GuestGroupInput): GuestGroupFieldError[] {
  const totalGuests = input.totalGuests;
  const vegetarianCount = input.vegetarianCount ?? 0;
  const veganCount = input.veganCount ?? 0;
  const errors: GuestGroupFieldError[] = [];

  const totalOk = Number.isInteger(totalGuests) && totalGuests > 0;
  const vegetarianOk = Number.isInteger(vegetarianCount) && vegetarianCount >= 0;
  const veganOk = Number.isInteger(veganCount) && veganCount >= 0;

  if (!totalOk) {
    errors.push({ field: 'totalGuests', message: 'Enter at least 1 guest, as a whole number.' });
  }
  if (!vegetarianOk) {
    errors.push({
      field: 'vegetarianCount',
      message: 'Enter 0 or more vegetarian guests, as a whole number.',
    });
  }
  if (!veganOk) {
    errors.push({
      field: 'veganCount',
      message: 'Enter 0 or more vegan guests, as a whole number.',
    });
  }

  if (totalOk && vegetarianOk && vegetarianCount > totalGuests) {
    errors.push({
      field: 'vegetarianCount',
      message: `Vegetarian guests can't be more than the ${totalGuests} total guests.`,
    });
  }
  if (vegetarianOk && veganOk && veganCount > vegetarianCount) {
    errors.push({
      field: 'veganCount',
      message: `Vegan guests count as vegetarian too, so there can't be more than the ${vegetarianCount} vegetarian guests.`,
    });
  }

  return errors;
}
