import { Quantity } from '../units/quantity.js';
import { UnitCategory } from '../units/units.js';
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
 * Practical Scaling v2 (see docs/ideas/practical-scaling.md) — deliberately narrower than that
 * doc's original "curated 80-100 ingredient dataset keyed by ingredientId" proposal. ingredientId
 * is free-form text chosen by a user or extracted by AI import, not a controlled vocabulary, so a
 * dataset keyed by it would silently miss most real recipes. The Count unit registry
 * (`count`/`clove`/`egg`/`onion` — see units.ts's own note on this), by contrast, is already a
 * small, controlled set, and every unit in it is inherently atomic: you cannot buy a fraction of
 * an egg, a clove, an onion, or a generic countable item. So rather than a separate
 * ingredient-behavior lookup, atomicity is read directly off `quantity.category === Count` —
 * reusing a distinction the domain already models, rather than inventing a second one.
 *
 * Mass and Volume quantities are genuinely continuous (grams, milliliters) and are never rounded
 * here — that's still a real, unaddressed part of the original idea doc (e.g. "buy whole heads of
 * garlic" for a Mass/Volume-adjacent case) and remains out of scope.
 *
 * Rounds up, never down: a mathematically-required 0.25 egg is real demand that a floor-rounded
 * "0 eggs" would silently drop from the shopping list. An already-whole amount (including 0) is
 * left untouched — `wasRoundedForPurchase` is only ever true when rounding actually changed the
 * amount, so a caller can distinguish "no adjustment needed" from "adjusted, here's the exact
 * figure too."
 *
 * Applied downstream of consolidateShoppingList()/subtractPantryStock(), not inside them — those
 * stay exact-math, matching their own documented "no rounding is applied" scope note. A caller
 * that wants both the raw mathematical total and the practical purchase recommendation can call
 * this as a separate, final step.
 */
export function applyPracticalRounding<T extends ShoppingListItem>(
  items: readonly T[]
): readonly PracticallyRoundedItem<T>[] {
  return Object.freeze(
    items.map((item) => {
      if (item.quantity.category !== UnitCategory.Count) {
        return Object.freeze({
          ...item,
          mathematicalQuantity: item.quantity,
          wasRoundedForPurchase: false,
        });
      }

      const roundedAmount = Math.ceil(item.quantity.amount);
      if (roundedAmount === item.quantity.amount) {
        return Object.freeze({
          ...item,
          mathematicalQuantity: item.quantity,
          wasRoundedForPurchase: false,
        });
      }

      return Object.freeze({
        ...item,
        quantity: new Quantity(roundedAmount, item.quantity.unit),
        mathematicalQuantity: item.quantity,
        wasRoundedForPurchase: true,
      });
    })
  );
}
