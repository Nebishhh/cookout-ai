import { Quantity } from '../units/quantity.js';
import { UnitCategory } from '../units/units.js';
import { differsByMoreThanCrumb, roundUpToPracticalAmount } from '../units/kitchenUnit.js';
import type { ShoppingListItem } from './types.js';

/**
 * A ShoppingListItem-shaped value after practical-purchase rounding has been applied. `quantity`
 * is the rounded, buyable amount; `mathematicalQuantity` preserves the exact pre-rounding total
 * so a caller can still show "needs 2.25, buy 3" rather than silently discarding the precise
 * figure. Generic over `T` (rather than fixed to `ShoppingListItem`) so callers passing the
 * richer `ShoppingListLine` (which additionally carries `id`/`checked`) get those fields back
 * typed on the result too, instead of losing them to the narrower interface.
 */
export type PracticallyRoundedItem<T extends ShoppingListItem = ShoppingListItem> = T & {
  readonly mathematicalQuantity: Quantity;
  readonly wasRoundedForPurchase: boolean;
};

/**
 * Practical Scaling v2 (see docs/ideas/practical-scaling.md), turning exact amounts into ones
 * you can buy and measure. Every rule rounds UP, never down: a mathematically required 0.25 egg
 * or 2.3 cups is real demand that rounding down would silently drop from the list.
 *
 * - **Count** (`count`/`clove`/`egg`/`onion`): up to a whole item, since you can't buy a fraction
 *   of an egg. Atomicity is read off `quantity.category === Count` — reusing a distinction the
 *   domain already models — rather than a per-ingredient dataset keyed by free-form ingredientId,
 *   which would silently miss most real recipes.
 * - **Mass and Volume**, in the same unit: up to the next kitchen fraction (¼, ⅓, ½, ⅔, ¾ or
 *   whole) for tsp, tbsp, cup, fl oz, oz and lb; the next tenth for kg and l; the next whole
 *   number for g and ml. See roundUpToPracticalAmount() in units/kitchenUnit.ts. 2.3 cup becomes
 *   2 1/3 cup (never 2 1/4), and 1.13 kg becomes 1.2 kg.
 *
 * An amount already on a step (including 0) is left untouched, and so is one a floating-point
 * crumb above a step. `wasRoundedForPurchase` is only true when rounding really changed the
 * amount, so a caller can distinguish "no adjustment needed" from "adjusted, here's the exact
 * figure too."
 *
 * Applied downstream of consolidateShoppingList()/subtractPantryStock(), not inside them — those
 * stay exact-math, so pantry subtraction works on the real figure and nothing is rounded twice.
 */
export function applyPracticalRounding<T extends ShoppingListItem>(
  items: readonly T[]
): readonly PracticallyRoundedItem<T>[] {
  return Object.freeze(
    items.map((item) => {
      const rounded =
        item.quantity.category === UnitCategory.Count
          ? new Quantity(Math.ceil(item.quantity.amount), item.quantity.unit)
          : roundUpToPracticalAmount(item.quantity);

      const changed =
        item.quantity.category === UnitCategory.Count
          ? rounded.amount !== item.quantity.amount
          : differsByMoreThanCrumb(rounded.amount, item.quantity.amount);

      // Always hand back the stepped amount (a crumb above 3 cups becomes exactly 3), but only
      // call it "rounded for purchase" when it moved by more than that crumb.
      return Object.freeze({
        ...item,
        quantity: rounded,
        mathematicalQuantity: item.quantity,
        wasRoundedForPurchase: changed,
      });
    })
  );
}
