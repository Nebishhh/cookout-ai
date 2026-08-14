import { describe, expect, it } from 'vitest';
import { applyPracticalRounding, GroceryCategory, Quantity } from '../index.js';
import type { ShoppingListItem } from './types.js';

function item(
  ingredientId: string,
  displayName: string,
  quantity: Quantity,
  sourceRecipeIds: string[] = ['r1']
): ShoppingListItem {
  return Object.freeze({
    ingredientId,
    displayName,
    quantity,
    sourceRecipeIds: Object.freeze(sourceRecipeIds),
    category: GroceryCategory.PantryStaples,
  });
}

describe('applyPracticalRounding()', () => {
  it('rounds a fractional Count quantity up to the nearest whole unit', () => {
    const items = [item('egg', 'Eggs', new Quantity(0.25, 'egg'))];
    const result = applyPracticalRounding(items);
    expect(result).toHaveLength(1);
    expect(result[0].quantity.amount).toBe(1);
    expect(result[0].quantity.unit).toBe('egg');
    expect(result[0].wasRoundedForPurchase).toBe(true);
    expect(result[0].mathematicalQuantity.amount).toBe(0.25);
  });

  it('rounds up rather than to the nearest whole number (2.1 eggs needs 3, not 2)', () => {
    const items = [item('egg', 'Eggs', new Quantity(2.1, 'egg'))];
    const result = applyPracticalRounding(items);
    expect(result[0].quantity.amount).toBe(3);
    expect(result[0].wasRoundedForPurchase).toBe(true);
  });

  it('leaves an already-whole Count quantity untouched', () => {
    const items = [item('onion', 'Onions', new Quantity(3, 'onion'))];
    const result = applyPracticalRounding(items);
    expect(result[0].quantity.amount).toBe(3);
    expect(result[0].wasRoundedForPurchase).toBe(false);
    expect(result[0].mathematicalQuantity.amount).toBe(3);
  });

  it('leaves a zero Count quantity untouched (still "no eggs needed", not rounded up to 1)', () => {
    const items = [item('egg', 'Eggs', new Quantity(0, 'egg'))];
    const result = applyPracticalRounding(items);
    expect(result[0].quantity.amount).toBe(0);
    expect(result[0].wasRoundedForPurchase).toBe(false);
  });

  it('applies the same rounding to the generic "count" unit, not just egg/clove/onion', () => {
    const items = [item('tortilla', 'Tortillas', new Quantity(7.5, 'count'))];
    const result = applyPracticalRounding(items);
    expect(result[0].quantity.amount).toBe(8);
    expect(result[0].quantity.unit).toBe('count');
    expect(result[0].wasRoundedForPurchase).toBe(true);
  });

  it('never rounds Mass quantities', () => {
    const items = [item('flour', 'Flour', new Quantity(462.5, 'g'))];
    const result = applyPracticalRounding(items);
    expect(result[0].quantity.amount).toBe(462.5);
    expect(result[0].wasRoundedForPurchase).toBe(false);
    expect(result[0].mathematicalQuantity.amount).toBe(462.5);
  });

  it('never rounds Volume quantities', () => {
    const items = [item('milk', 'Milk', new Quantity(1.333, 'cup'))];
    const result = applyPracticalRounding(items);
    expect(result[0].quantity.amount).toBe(1.333);
    expect(result[0].wasRoundedForPurchase).toBe(false);
  });

  it('handles a mixed list, rounding only the Count entries', () => {
    const items = [
      item('flour', 'Flour', new Quantity(462.5, 'g')),
      item('egg', 'Eggs', new Quantity(2.25, 'egg')),
      item('milk', 'Milk', new Quantity(1.333, 'cup')),
      item('clove', 'Garlic Cloves', new Quantity(1, 'clove')),
    ];
    const result = applyPracticalRounding(items);
    const byId = Object.fromEntries(result.map((r) => [r.ingredientId, r]));
    expect(byId.flour.wasRoundedForPurchase).toBe(false);
    expect(byId.egg.quantity.amount).toBe(3);
    expect(byId.egg.wasRoundedForPurchase).toBe(true);
    expect(byId.milk.wasRoundedForPurchase).toBe(false);
    expect(byId.clove.wasRoundedForPurchase).toBe(false);
  });

  it('returns an empty, frozen array for an empty input', () => {
    const result = applyPracticalRounding([]);
    expect(result).toHaveLength(0);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('returns frozen items and preserves all other ShoppingListItem fields', () => {
    const items = [item('egg', 'Eggs', new Quantity(0.5, 'egg'), ['r1', 'r2'])];
    const result = applyPracticalRounding(items);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(result[0].ingredientId).toBe('egg');
    expect(result[0].displayName).toBe('Eggs');
    expect(result[0].sourceRecipeIds).toEqual(['r1', 'r2']);
    expect(result[0].category).toBe(GroceryCategory.PantryStaples);
  });
});
