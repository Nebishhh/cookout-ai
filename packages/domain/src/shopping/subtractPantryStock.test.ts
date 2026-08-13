import { describe, expect, it } from 'vitest';
import { subtractPantryStock, GroceryCategory, Quantity } from '../index.js';
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

describe('subtractPantryStock()', () => {
  it('returns items unchanged when pantry stock is empty', () => {
    const items = [item('flour', 'Flour', new Quantity(500, 'g'))];
    const result = subtractPantryStock(items, new Map());
    expect(result).toEqual(items);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('leaves an item untouched when pantry has no entry for its ingredientId', () => {
    const items = [item('flour', 'Flour', new Quantity(500, 'g'))];
    const pantry = new Map([['sugar', new Quantity(100, 'g')]]);
    const result = subtractPantryStock(items, pantry);
    expect(result).toHaveLength(1);
    expect(result[0].quantity.amount).toBe(500);
  });

  it('reduces an item partially covered by pantry stock', () => {
    const items = [item('flour', 'Flour', new Quantity(500, 'g'))];
    const pantry = new Map([['flour', new Quantity(200, 'g')]]);
    const result = subtractPantryStock(items, pantry);
    expect(result).toHaveLength(1);
    expect(result[0].quantity.amount).toBe(300);
    expect(result[0].quantity.unit).toBe('g');
  });

  it('converts cross-unit pantry stock into the item unit before subtracting', () => {
    const items = [item('milk', 'Milk', new Quantity(2, 'l'))];
    const pantry = new Map([['milk', new Quantity(500, 'ml')]]);
    const result = subtractPantryStock(items, pantry);
    expect(result).toHaveLength(1);
    expect(result[0].quantity.amount).toBe(1.5);
    expect(result[0].quantity.unit).toBe('l');
  });

  it('omits an item entirely when pantry stock fully covers it', () => {
    const items = [
      item('flour', 'Flour', new Quantity(200, 'g')),
      item('sugar', 'Sugar', new Quantity(100, 'g')),
    ];
    const pantry = new Map([['flour', new Quantity(500, 'g')]]);
    const result = subtractPantryStock(items, pantry);
    expect(result).toHaveLength(1);
    expect(result[0].ingredientId).toBe('sugar');
  });

  it('omits an item when pantry stock covers it exactly', () => {
    const items = [item('flour', 'Flour', new Quantity(200, 'g'))];
    const pantry = new Map([['flour', new Quantity(200, 'g')]]);
    const result = subtractPantryStock(items, pantry);
    expect(result).toHaveLength(0);
  });

  it('leaves an item untouched when the pantry entry is in an incompatible unit/category', () => {
    const items = [item('butter', 'Butter', new Quantity(200, 'g'))];
    const pantry = new Map([['butter', new Quantity(1, 'cup')]]);
    const result = subtractPantryStock(items, pantry);
    expect(result).toHaveLength(1);
    expect(result[0].quantity.amount).toBe(200);
    expect(result[0].quantity.unit).toBe('g');
  });

  it('leaves a Count item untouched when the pantry entry uses a different Count unit', () => {
    const items = [item('egg', 'Eggs', new Quantity(6, 'egg'))];
    const pantry = new Map([['egg', new Quantity(2, 'count')]]);
    const result = subtractPantryStock(items, pantry);
    expect(result).toHaveLength(1);
    expect(result[0].quantity.amount).toBe(6);
  });

  it('subtracts a matching Count item exactly', () => {
    const items = [item('egg', 'Eggs', new Quantity(6, 'egg'))];
    const pantry = new Map([['egg', new Quantity(4, 'egg')]]);
    const result = subtractPantryStock(items, pantry);
    expect(result).toHaveLength(1);
    expect(result[0].quantity.amount).toBe(2);
  });
});
