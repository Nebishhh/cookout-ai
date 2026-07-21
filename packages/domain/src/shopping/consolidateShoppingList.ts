import type { ScaledRecipe } from '../recipes/types.js';
import { BASE_UNITS, UnitCategory } from '../units/units.js';
import { Quantity } from '../units/quantity.js';
import type { ShoppingListItem } from './types.js';

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
 * 2. Mass & Volume groups are converted to their base units (g for Mass, ml for Volume) using Quantity.convertTo() and summed.
 * 3. Count groups are further subdivided by exact unit (e.g., 'egg' vs 'count'), and summed within matching units without conversion.
 * 4. First-encountered displayName is preserved for each item.
 * 5. Unique sourceRecipeIds are preserved in encounter order.
 *
 * Open Questions / Scope Notes:
 * - Cross-category ingredientId collisions (e.g. "butter" as Mass vs Volume) produce separate line items.
 * - Display name reconciliation across recipes is not solved (first-seen wins).
 * - No presentation-layer unit rounding or "nice unit" conversions are applied.
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
      const baseUnit = BASE_UNITS[category];
      let totalAmount = 0;
      const sourceRecipeIds: string[] = [];

      for (const entry of entries) {
        const converted = entry.quantity.convertTo(baseUnit);
        totalAmount += converted.amount;
        if (!sourceRecipeIds.includes(entry.sourceRecipeId)) {
          sourceRecipeIds.push(entry.sourceRecipeId);
        }
      }

      result.push(
        Object.freeze({
          ingredientId,
          displayName: firstDisplayName,
          quantity: new Quantity(totalAmount, baseUnit),
          sourceRecipeIds: Object.freeze(sourceRecipeIds),
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
          })
        );
      }
    }
  }

  return Object.freeze(result);
}
