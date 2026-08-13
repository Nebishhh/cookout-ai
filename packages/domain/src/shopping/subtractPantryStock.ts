import { UnitMismatchError } from '../errors.js';
import type { Quantity } from '../units/quantity.js';
import type { ShoppingListItem } from './types.js';

/**
 * Reduces a consolidated shopping list by whatever's already on hand (a global, standing
 * pantry fact per ingredientId — see apps/api/src/pantryStore.ts). An ingredient fully covered
 * by pantry stock is omitted from the result entirely, not kept at a zero quantity — this is
 * the "shopping trip" use case, where an ingredient you don't need to buy shouldn't appear.
 *
 * A pantry entry recorded in a unit incompatible with how a given item's quantity is measured
 * (cross-category, or a differing Count unit) is tolerated by leaving that item unmodified
 * rather than failing the whole list — the same "don't let one bad reference break everything"
 * precedent as Event's droppedRecipeIds handling for a stale recipe reference.
 */
export function subtractPantryStock(
  items: readonly ShoppingListItem[],
  pantryStock: ReadonlyMap<string, Quantity>
): readonly ShoppingListItem[] {
  const result: ShoppingListItem[] = [];

  for (const item of items) {
    const onHand = pantryStock.get(item.ingredientId);
    if (!onHand) {
      result.push(item);
      continue;
    }

    let reduced: Quantity;
    try {
      reduced = item.quantity.subtract(onHand);
    } catch (err) {
      if (err instanceof UnitMismatchError) {
        result.push(item);
        continue;
      }
      throw err;
    }

    if (reduced.amount === 0) {
      continue;
    }

    result.push(Object.freeze({ ...item, quantity: reduced }));
  }

  return Object.freeze(result);
}
