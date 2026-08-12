import { InvalidEventError } from '../errors.js';
import { GuestGroup } from './guestGroup.js';

export interface EventInput {
  id: string;
  name: string;
  guestGroup: GuestGroup;
  recipeIds: string[];
}

/**
 * Open Question / Scope Notes:
 * - "Recompute live": Event stores only its inputs (name, guestGroup, recipeIds). The plan
 *   (included/excluded recipes, eligible servings, shopping list) is never stored here —
 *   it's recomputed fresh from current recipe data every time the event is read, via
 *   planEventShoppingList(). Editing a recipe later is reflected retroactively in every
 *   event that references it, and a recipeId that no longer resolves to a Recipe is
 *   tolerated (dropped at the persistence boundary, not a domain-layer concern).
 * - No eventDate/notes field yet — the options-object constructor leaves room to add one
 *   later without a signature break, matching GuestGroup's precedent.
 */
export class Event {
  readonly id: string;
  readonly name: string;
  readonly guestGroup: GuestGroup;
  readonly recipeIds: readonly string[];

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

    this.id = input.id;
    this.name = input.name;
    this.guestGroup = input.guestGroup;
    this.recipeIds = Object.freeze([...input.recipeIds]);

    Object.freeze(this);
  }
}
