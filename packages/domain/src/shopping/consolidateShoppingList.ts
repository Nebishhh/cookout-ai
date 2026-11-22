import type { ScaledRecipe } from '../recipes/types.js';
import { BASE_UNITS, UnitCategory } from '../units/units.js';
import { Quantity } from '../units/quantity.js';
import { largestShareSystem, pickKitchenUnit } from '../units/kitchenUnit.js';
import type { ShoppingListItem } from './types.js';
import { categorizeIngredient } from './groceryCategory.js';

interface RawItemEntry {
  displayName: string;
  quantity: Quantity;
  sourceRecipeId: string;
}

/**
 * Consolidates ingredient lines across multiple already-scaled recipes into a single shopping list.
 *
 * Grouping rules:
 * 1. Ingredients are grouped by (ingredientId, UnitCategory).
 * 2. A Mass or Volume group whose entries all share one unit is summed in that unit and keeps it:
 *    2 tbsp stays 2 tbsp, the way the user wrote it.
 * 3. A Mass or Volume group mixing units is converted to its base unit (g or ml) with
 *    Quantity.convertTo(), summed, and then expressed in a kitchen unit via pickKitchenUnit():
 *    the largest unit, in the system (metric or US) contributing the larger share of the total,
 *    that keeps the amount at 1 or more. 2 cups + 100 ml comes back as 2.42 cup, and
 *    2 tbsp + 500 ml as 529.57 ml, whichever line comes first.
 * 4. Count groups are further subdivided by exact unit (e.g., 'egg' vs 'count'), and summed within matching units without conversion.
 * 5. First-encountered displayName is preserved for each item.
 * 6. Unique sourceRecipeIds are preserved in encounter order.
 *
 * Open Questions / Scope Notes:
 * - Cross-category ingredientId collisions (e.g. "butter" as Mass vs Volume) produce separate line items.
 * - Display name reconciliation across recipes is not solved (first-seen wins).
 * - Amounts stay exact. Rounding to something buyable is applyPracticalRounding()'s job, run
 *   after pantry subtraction, so nothing here throws precision away.
 *
 * @param scaledRecipes Array of scaled recipes to consolidate.
 * @returns Readonly array of consolidated ShoppingListItem entries.
 */
export function consolidateShoppingList(
  scaledRecipes: readonly ScaledRecipe[]
): readonly ShoppingListItem[] {
  if (!scaledRecipes || scaledRecipes.length === 0) {
    return Object.freeze([]);
  }

  // Group by `${ingredientId}::${category}`
  const categoryGroups = new Map<
    string,
    { ingredientId: string; category: UnitCategory; entries: RawItemEntry[] }
  >();

  for (const recipe of scaledRecipes) {
    for (const line of recipe.ingredients) {
      const key = `${line.ingredientId}::${line.quantity.category}`;
      let group = categoryGroups.get(key);
      if (!group) {
        group = {
          ingredientId: line.ingredientId,
          category: line.quantity.category,
          entries: [],
        };
        categoryGroups.set(key, group);
      }
      group.entries.push({
        displayName: line.displayName,
        quantity: line.quantity,
        sourceRecipeId: recipe.sourceRecipeId,
      });
    }
  }

  const result: ShoppingListItem[] = [];

  for (const group of categoryGroups.values()) {
    const { ingredientId, category, entries } = group;
    const firstDisplayName = entries[0].displayName;

    if (category === UnitCategory.Mass || category === UnitCategory.Volume) {
      const sourceRecipeIds: string[] = [];
      for (const entry of entries) {
        if (!sourceRecipeIds.includes(entry.sourceRecipeId)) {
          sourceRecipeIds.push(entry.sourceRecipeId);
        }
      }

      const firstUnit = entries[0].quantity.unit;
      let quantity: Quantity;
      if (entries.every((entry) => entry.quantity.unit === firstUnit)) {
        // One unit throughout: sum as written, no conversion.
        const total = entries.reduce((sum, entry) => sum + entry.quantity.amount, 0);
        quantity = new Quantity(total, firstUnit);
      } else {
        // Mixed units: convert to base, sum, then answer in a kitchen unit of whichever system
        // contributes the larger share of that total.
        const baseUnit = BASE_UNITS[category];
        const totalInBase = entries.reduce(
          (sum, entry) => sum + entry.quantity.convertTo(baseUnit).amount,
          0
        );
        const system = largestShareSystem(entries.map((entry) => entry.quantity));
        const kitchenUnit = pickKitchenUnit(totalInBase, category, system);
        quantity = new Quantity(totalInBase, baseUnit).convertTo(kitchenUnit);
      }

      result.push(
        Object.freeze({
          ingredientId,
          displayName: firstDisplayName,
          quantity,
          sourceRecipeIds: Object.freeze(sourceRecipeIds),
          category: categorizeIngredient(ingredientId, firstDisplayName),
        })
      );
    } else if (category === UnitCategory.Count) {
      // Subdivide Count category by exact unit
      const unitSubgroups = new Map<string, RawItemEntry[]>();
      for (const entry of entries) {
        const unitKey = entry.quantity.unit;
        let subList = unitSubgroups.get(unitKey);
        if (!subList) {
          subList = [];
          unitSubgroups.set(unitKey, subList);
        }
        subList.push(entry);
      }

      for (const [unit, subEntries] of unitSubgroups.entries()) {
        const subFirstDisplayName = subEntries[0].displayName;
        const subSourceRecipeIds: string[] = [];
        let totalAmount = 0;

        for (const entry of subEntries) {
          totalAmount += entry.quantity.amount;
          if (!subSourceRecipeIds.includes(entry.sourceRecipeId)) {
            subSourceRecipeIds.push(entry.sourceRecipeId);
          }
        }

        result.push(
          Object.freeze({
            ingredientId,
            displayName: subFirstDisplayName,
            quantity: new Quantity(totalAmount, unit),
            sourceRecipeIds: Object.freeze(subSourceRecipeIds),
            category: categorizeIngredient(ingredientId, subFirstDisplayName),
          })
        );
      }
    }
  }

  return Object.freeze(result);
}
