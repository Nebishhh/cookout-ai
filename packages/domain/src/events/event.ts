import { InvalidEventError } from '../errors.js';
import { GuestGroup } from './guestGroup.js';
import { MINUTES_PER_DAY } from './cookSchedule.js';

export interface EventInput {
  id: string;
  name: string;
  guestGroup: GuestGroup;
  recipeIds: string[];
  serveTimeMinutes?: number | null;
}

/**
 * Open Question / Scope Notes:
 * - "Recompute live": Event stores only its inputs (name, guestGroup, recipeIds,
 *   serveTimeMinutes). The plan (included/excluded recipes, eligible servings, shopping list,
 *   cook schedule) is never stored here — it's recomputed fresh from current recipe data every
 *   time the event is read, via planEventShoppingList() and computeCookSchedule(). Editing a
 *   recipe later is reflected retroactively in every event that references it, and a recipeId
 *   that no longer resolves to a Recipe is tolerated (dropped at the persistence boundary, not
 *   a domain-layer concern).
 * - `serveTimeMinutes` is **wall-clock minutes from midnight (0..1439), deliberately not a
 *   Date/DateTime**. "Serve at 6pm" is a wall-clock intent, not an instant on a timeline —
 *   storing an instant would drag timezone conversion into every read for no benefit, since
 *   all cook-schedule arithmetic is relative to the serve time anyway. null means the host
 *   hasn't asked for a schedule.
 * - No eventDate/notes field yet — the options-object constructor leaves room to add one
 *   later without a signature break, matching GuestGroup's precedent.
 */
export class Event {
  readonly id: string;
  readonly name: string;
  readonly guestGroup: GuestGroup;
  readonly recipeIds: readonly string[];
  readonly serveTimeMinutes: number | null;

  constructor(input: EventInput) {
    if (typeof input.id !== 'string' || input.id.trim().length === 0) {
      throw new InvalidEventError(
        `Invalid event id: "${input.id}". id must be a non-empty string.`
      );
    }

    if (typeof input.name !== 'string' || input.name.trim().length === 0) {
      throw new InvalidEventError(
        `Invalid event name: "${input.name}". name must be a non-empty string.`
      );
    }

    if (!(input.guestGroup instanceof GuestGroup)) {
      throw new InvalidEventError('Invalid guestGroup: Must be a valid GuestGroup instance.');
    }

    if (!Array.isArray(input.recipeIds)) {
      throw new InvalidEventError('recipeIds must be an array.');
    }

    for (const recipeId of input.recipeIds) {
      if (typeof recipeId !== 'string' || recipeId.trim().length === 0) {
        throw new InvalidEventError(
          `Invalid recipeId in recipeIds: "${recipeId}". Every recipeId must be a non-empty string.`
        );
      }
    }

    const serveTimeMinutes = input.serveTimeMinutes ?? null;
    if (serveTimeMinutes !== null) {
      if (
        typeof serveTimeMinutes !== 'number' ||
        !Number.isInteger(serveTimeMinutes) ||
        serveTimeMinutes < 0 ||
        serveTimeMinutes >= MINUTES_PER_DAY
      ) {
        throw new InvalidEventError(
          `Invalid serveTimeMinutes: ${input.serveTimeMinutes}. Must be an integer from 0 to ${MINUTES_PER_DAY - 1} (wall-clock minutes from midnight), or null.`
        );
      }
    }

    this.id = input.id;
    this.name = input.name;
    this.guestGroup = input.guestGroup;
    this.recipeIds = Object.freeze([...input.recipeIds]);
    this.serveTimeMinutes = serveTimeMinutes;

    Object.freeze(this);
  }
}
