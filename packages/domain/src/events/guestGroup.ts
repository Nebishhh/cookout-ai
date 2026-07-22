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
