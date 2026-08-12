import { InvalidShoppingListError } from '../errors.js';
import { ShoppingListLine } from './shoppingListLine.js';

export interface ShoppingListInput {
  id: string;
  name: string;
  eventId: string | null;
  items: ShoppingListLine[];
}

/**
 * Open Question / Scope Notes:
 * - A ShoppingList may have zero items — a list saved before it has any checkable lines
 *   (e.g. saved immediately, or every selected recipe had zero eligible ingredients) is a
 *   valid state, matching the "zero eligible guests is data, not an error" precedent
 *   already established by planEventShoppingList.
 * - "Recompute live" vs. "persisted checkable snapshot": this class is always a deliberate,
 *   user-triggered snapshot of currently-computed items — it is never re-derived on read the
 *   way an Event's plan is. Regenerating one (see the API layer) is an explicit action that
 *   replaces items wholesale, discarding prior checked state.
 */
export class ShoppingList {
  readonly id: string;
  readonly name: string;
  readonly eventId: string | null;
  readonly items: readonly ShoppingListLine[];

  constructor(input: ShoppingListInput) {
    if (typeof input.id !== 'string' || input.id.trim().length === 0) {
      throw new InvalidShoppingListError(
        `Invalid shopping list id: "${input.id}". id must be a non-empty string.`
      );
    }

    if (typeof input.name !== 'string' || input.name.trim().length === 0) {
      throw new InvalidShoppingListError(
        `Invalid shopping list name: "${input.name}". name must be a non-empty string.`
      );
    }

    if (input.eventId !== null && typeof input.eventId !== 'string') {
      throw new InvalidShoppingListError('eventId must be a string or exactly null.');
    }

    if (typeof input.eventId === 'string' && input.eventId.trim().length === 0) {
      throw new InvalidShoppingListError('eventId must be a non-empty string when provided.');
    }

    if (!Array.isArray(input.items)) {
      throw new InvalidShoppingListError('items must be an array.');
    }

    for (const item of input.items) {
      if (!(item instanceof ShoppingListLine)) {
        throw new InvalidShoppingListError(
          'All items in items array must be instances of ShoppingListLine.'
        );
      }
    }

    this.id = input.id;
    this.name = input.name;
    this.eventId = input.eventId;
    this.items = Object.freeze([...input.items]);

    Object.freeze(this);
  }
}
