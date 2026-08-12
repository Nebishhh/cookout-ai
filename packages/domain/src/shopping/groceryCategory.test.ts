import { describe, expect, it } from 'vitest';
import { categorizeIngredient, GROCERY_CATEGORY_ORDER, GroceryCategory } from '../index.js';

describe('categorizeIngredient()', () => {
  it('categorizes produce', () => {
    expect(categorizeIngredient('onion', 'Yellow Onion')).toBe(GroceryCategory.Produce);
    expect(categorizeIngredient('bell-pepper', 'Bell Pepper')).toBe(GroceryCategory.Produce);
  });

  it('categorizes meat', () => {
    expect(categorizeIngredient('chicken-breast', 'Chicken Breast')).toBe(GroceryCategory.Meat);
  });

  it('categorizes seafood', () => {
    expect(categorizeIngredient('salmon', 'Salmon Fillet')).toBe(GroceryCategory.Seafood);
  });

  it('categorizes dairy, including eggs', () => {
    expect(categorizeIngredient('cheddar', 'Cheddar Cheese')).toBe(GroceryCategory.Dairy);
    expect(categorizeIngredient('egg', 'Large Eggs')).toBe(GroceryCategory.Dairy);
  });

  it('categorizes bakery', () => {
    expect(categorizeIngredient('bread', 'Sourdough Bread')).toBe(GroceryCategory.Bakery);
  });

  it('categorizes frozen', () => {
    expect(categorizeIngredient('frozen-peas', 'Frozen Peas')).toBe(GroceryCategory.Frozen);
  });

  it('categorizes beverages', () => {
    expect(categorizeIngredient('oj', 'Orange Juice')).toBe(GroceryCategory.Beverages);
  });

  it('categorizes spices & condiments', () => {
    expect(categorizeIngredient('salt', 'Sea Salt')).toBe(GroceryCategory.SpicesAndCondiments);
    expect(categorizeIngredient('olive-oil', 'Olive Oil')).toBe(
      GroceryCategory.SpicesAndCondiments
    );
  });

  it('categorizes pantry staples', () => {
    expect(categorizeIngredient('flour', 'All-Purpose Flour')).toBe(GroceryCategory.PantryStaples);
    expect(categorizeIngredient('rice', 'Jasmine Rice')).toBe(GroceryCategory.PantryStaples);
  });

  it('falls back to Other for unrecognized ingredients', () => {
    expect(categorizeIngredient('mystery-item', 'Mystery Item')).toBe(GroceryCategory.Other);
  });

  it('is case-insensitive', () => {
    expect(categorizeIngredient('CHICKEN', 'CHICKEN BREAST')).toBe(GroceryCategory.Meat);
  });

  it('matches on ingredientId even when displayName is unrelated', () => {
    expect(categorizeIngredient('salmon', 'Item #42')).toBe(GroceryCategory.Seafood);
  });

  it('GROCERY_CATEGORY_ORDER contains every GroceryCategory value exactly once', () => {
    const allCategories = Object.values(GroceryCategory);
    expect(GROCERY_CATEGORY_ORDER).toHaveLength(allCategories.length);
    expect(new Set(GROCERY_CATEGORY_ORDER)).toEqual(new Set(allCategories));
  });
});
