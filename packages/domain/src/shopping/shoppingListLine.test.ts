import { describe, expect, it } from 'vitest';
import { GroceryCategory, InvalidShoppingListError, Quantity, ShoppingListLine } from '../index.js';

describe('ShoppingListLine Construction & Validation', () => {
  const validQuantity = () => new Quantity(200, 'g');

  it('creates a valid ShoppingListLine with checked defaulting to false', () => {
    const line = new ShoppingListLine('line-1', 'cheese', 'Cheddar', validQuantity(), ['r1']);

    expect(line.id).toBe('line-1');
    expect(line.ingredientId).toBe('cheese');
    expect(line.displayName).toBe('Cheddar');
    expect(line.quantity.amount).toBe(200);
    expect(line.sourceRecipeIds).toEqual(['r1']);
    expect(line.checked).toBe(false);
    expect(line.category).toBe(GroceryCategory.Dairy);
  });

  it('accepts an explicit checked value', () => {
    const line = new ShoppingListLine('line-1', 'cheese', 'Cheddar', validQuantity(), ['r1'], true);
    expect(line.checked).toBe(true);
  });

  it('accepts an empty sourceRecipeIds array', () => {
    const line = new ShoppingListLine('line-1', 'towels', 'Paper Towels', validQuantity(), []);
    expect(line.sourceRecipeIds).toEqual([]);
  });

  it('rejects empty or whitespace-only id', () => {
    expect(() => new ShoppingListLine('', 'cheese', 'Cheddar', validQuantity(), ['r1'])).toThrow(
      InvalidShoppingListError
    );
  });

  it('rejects empty or whitespace-only ingredientId', () => {
    expect(() => new ShoppingListLine('line-1', '', 'Cheddar', validQuantity(), ['r1'])).toThrow(
      InvalidShoppingListError
    );
  });

  it('rejects empty or whitespace-only displayName', () => {
    expect(() => new ShoppingListLine('line-1', 'cheese', '', validQuantity(), ['r1'])).toThrow(
      InvalidShoppingListError
    );
  });

  it('rejects a quantity that is not a Quantity instance', () => {
    expect(
      () =>
        // @ts-expect-error testing invalid input type
        new ShoppingListLine('line-1', 'cheese', 'Cheddar', { amount: 200, unit: 'g' }, ['r1'])
    ).toThrow(InvalidShoppingListError);
  });

  it('rejects a non-array sourceRecipeIds', () => {
    expect(
      () =>
        // @ts-expect-error testing invalid input type
        new ShoppingListLine('line-1', 'cheese', 'Cheddar', validQuantity(), 'not-an-array')
    ).toThrow(InvalidShoppingListError);
  });

  it('rejects sourceRecipeIds containing an empty string', () => {
    expect(
      () => new ShoppingListLine('line-1', 'cheese', 'Cheddar', validQuantity(), ['r1', ''])
    ).toThrow(InvalidShoppingListError);
  });

  it('rejects a non-boolean checked value', () => {
    expect(
      () =>
        // @ts-expect-error testing invalid input type
        new ShoppingListLine('line-1', 'cheese', 'Cheddar', validQuantity(), ['r1'], 'yes')
    ).toThrow(InvalidShoppingListError);
  });

  it('is frozen and rejects mutation of sourceRecipeIds', () => {
    const line = new ShoppingListLine('line-1', 'cheese', 'Cheddar', validQuantity(), ['r1']);

    expect(Object.isFrozen(line)).toBe(true);
    expect(Object.isFrozen(line.sourceRecipeIds)).toBe(true);
    expect(() => {
      // @ts-expect-error mutating readonly array for test
      line.sourceRecipeIds.push('r2');
    }).toThrow();
  });

  it('does not mutate the input sourceRecipeIds array', () => {
    const sourceRecipeIds = ['r1'];
    const line = new ShoppingListLine(
      'line-1',
      'cheese',
      'Cheddar',
      validQuantity(),
      sourceRecipeIds
    );

    sourceRecipeIds.push('r2');
    expect(line.sourceRecipeIds).toEqual(['r1']);
  });
});
