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

  describe('Mass and Volume: round UP to a practical amount, never down', () => {
    const roundOne = (quantity: Quantity) => applyPracticalRounding([item('x', 'X', quantity)])[0];

    it('rounds 2.3 cup up to 2 1/3 cup, never down to 2 1/4', () => {
      const result = roundOne(new Quantity(2.3, 'cup'));
      expect(result.quantity.unit).toBe('cup');
      expect(result.quantity.amount).toBeCloseTo(2 + 1 / 3, 12);
      expect(result.quantity.amount).not.toBe(2.25);
      expect(result.quantity.amount).toBeGreaterThanOrEqual(2.3);
      expect(result.wasRoundedForPurchase).toBe(true);
    });

    it('sends an amount just past a step on to the next step, not back to it', () => {
      expect(roundOne(new Quantity(2.26, 'cup')).quantity.amount).toBeCloseTo(2 + 1 / 3, 12);
    });

    it('leaves an amount already on a step untouched', () => {
      const result = roundOne(new Quantity(2.25, 'cup'));
      expect(result.quantity.amount).toBe(2.25);
      expect(result.wasRoundedForPurchase).toBe(false);
    });

    it('rounds past three quarters up to the next whole unit', () => {
      expect(roundOne(new Quantity(2.76, 'cup')).quantity.amount).toBe(3);
    });

    it('rounds a pinch up to a quarter', () => {
      const result = roundOne(new Quantity(0.1, 'tsp'));
      expect([result.quantity.amount, result.quantity.unit]).toEqual([0.25, 'tsp']);
    });

    it('rounds 1.333 cup up to exactly 1 1/3 cup', () => {
      const result = roundOne(new Quantity(1.333, 'cup'));
      expect(result.quantity.amount).toBeCloseTo(4 / 3, 12);
      expect(result.wasRoundedForPurchase).toBe(true);
    });

    it('rounds kilograms and litres up to the next tenth, not to kitchen fractions', () => {
      const exact = roundOne(new Quantity(1.1, 'kg'));
      expect(exact.quantity.amount).toBe(1.1);
      expect(exact.wasRoundedForPurchase).toBe(false);

      expect(roundOne(new Quantity(1.13, 'kg')).quantity.amount).toBe(1.2);
      expect(roundOne(new Quantity(1.6, 'l')).quantity.amount).toBe(1.6);
      expect(roundOne(new Quantity(1.61, 'l')).quantity.amount).toBe(1.7);
      expect(roundOne(new Quantity(0.04, 'l')).quantity.amount).toBe(0.1);
      expect(roundOne(new Quantity(1.13, 'kg')).wasRoundedForPurchase).toBe(true);
    });

    it('keeps a tenth on that tenth when floating point stores it a hair off', () => {
      // 1.1 * 10 is 11.000000000000002 (must not become 1.2); 0.7 + 0.1 is 0.7999999999999999.
      expect(roundOne(new Quantity(1.1, 'kg')).quantity.amount).toBe(1.1);
      expect(roundOne(new Quantity(0.7 + 0.1, 'l')).quantity.amount).toBe(0.8);
    });

    it('rounds grams and millilitres up to a whole number', () => {
      expect(roundOne(new Quantity(158.96, 'ml')).quantity.amount).toBe(159);
      expect(roundOne(new Quantity(158.01, 'g')).quantity.amount).toBe(159);
      expect(roundOne(new Quantity(462.5, 'g')).quantity.amount).toBe(463);
      expect(roundOne(new Quantity(200, 'g')).wasRoundedForPurchase).toBe(false);
    });

    it('does not push a floating-point crumb over a step', () => {
      const crumb = 0.1 * 3 * 10; // 3.0000000000000004, what float arithmetic leaves behind
      expect(crumb).toBeGreaterThan(3);

      const result = roundOne(new Quantity(crumb, 'cup'));
      expect(result.quantity.amount).toBe(3);
      expect(result.wasRoundedForPurchase).toBe(false);

      expect(roundOne(new Quantity(200.00000000000003, 'g')).quantity.amount).toBe(200);
    });

    it('keeps the exact pre-rounding figure in mathematicalQuantity', () => {
      const result = roundOne(new Quantity(2.3, 'cup'));
      expect(result.mathematicalQuantity.amount).toBe(2.3);
      expect(result.mathematicalQuantity.unit).toBe('cup');
    });

    it('never rounds below the exact amount, across every Mass and Volume unit', () => {
      const fractionUnits = ['tsp', 'tbsp', 'cup', 'fl oz', 'oz', 'lb'];
      const tenthUnits = ['kg', 'l'];
      const steps = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4];
      let checked = 0;
      for (const unit of [...fractionUnits, ...tenthUnits, 'g', 'ml']) {
        for (let i = 1; i <= 400; i++) {
          const amount = i * 0.037;
          const result = roundOne(new Quantity(amount, unit));
          const rounded = result.quantity.amount;

          expect(rounded).toBeGreaterThanOrEqual(amount - 1e-9 * Math.max(1, amount));
          expect(result.quantity.unit).toBe(unit);
          if (fractionUnits.includes(unit)) {
            const frac = rounded - Math.floor(rounded);
            expect(steps.some((s) => Math.abs(frac - s) < 1e-9)).toBe(true);
            expect(rounded - amount).toBeLessThan(0.25 + 1e-9); // widest gaps: 0 to 1/4, 3/4 to 1
          } else if (tenthUnits.includes(unit)) {
            const tenths = rounded * 10;
            expect(Math.abs(tenths - Math.round(tenths))).toBeLessThan(1e-9);
            expect(rounded - amount).toBeLessThan(0.1 + 1e-9);
          } else {
            expect(Number.isInteger(rounded)).toBe(true);
            expect(rounded - amount).toBeLessThan(1);
          }
          checked++;
        }
      }
      expect(checked).toBe(4000);
    });
  });

  it('handles a mixed list, rounding each entry up by its own rule', () => {
    const items = [
      item('flour', 'Flour', new Quantity(462.5, 'g')),
      item('egg', 'Eggs', new Quantity(2.25, 'egg')),
      item('milk', 'Milk', new Quantity(1.333, 'cup')),
      item('clove', 'Garlic Cloves', new Quantity(1, 'clove')),
    ];
    const result = applyPracticalRounding(items);
    const byId = Object.fromEntries(result.map((r) => [r.ingredientId, r]));
    expect(byId.flour.quantity.amount).toBe(463);
    expect(byId.flour.wasRoundedForPurchase).toBe(true);
    expect(byId.egg.quantity.amount).toBe(3);
    expect(byId.egg.wasRoundedForPurchase).toBe(true);
    expect(byId.milk.quantity.amount).toBeCloseTo(4 / 3, 12);
    expect(byId.milk.wasRoundedForPurchase).toBe(true);
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
