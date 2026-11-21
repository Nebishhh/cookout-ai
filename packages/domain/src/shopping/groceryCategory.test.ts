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

  describe('whole-word matching (no substring false matches)', () => {
    // Each of these was miscategorized by substring matching ("egg" in eggplant, "ham" in graham,
    // "corn" in cornstarch, "oil" in foil, ...) or by a single word beating a more specific phrase.
    it.each([
      ['eggplant', 'Eggplant', GroceryCategory.Produce],
      ['graham-crackers', 'Graham Crackers', GroceryCategory.PantryStaples],
      ['ricotta', 'Ricotta', GroceryCategory.Dairy],
      ['mozzarella', 'Fresh Mozzarella', GroceryCategory.Dairy],
      ['goat', 'Goat Shoulder', GroceryCategory.Meat],
      ['champagne', 'Champagne', GroceryCategory.Beverages],
      ['oats', 'Rolled Oats', GroceryCategory.PantryStaples],
      ['cornstarch', 'Cornstarch', GroceryCategory.PantryStaples],
      ['cornmeal', 'Yellow Cornmeal', GroceryCategory.PantryStaples],
      ['peppercorns', 'Black Peppercorns', GroceryCategory.SpicesAndCondiments],
      ['pearl-barley', 'Pearl Barley', GroceryCategory.PantryStaples],
      ['grapeseed-oil', 'Grapeseed Oil', GroceryCategory.SpicesAndCondiments],
      ['foil', 'Aluminum Foil', GroceryCategory.Other],
      ['butternut-squash', 'Butternut Squash', GroceryCategory.Produce],
      ['watercress', 'Watercress', GroceryCategory.Produce],
      ['ice-cream', 'Vanilla Ice Cream', GroceryCategory.Frozen],
      ['baking-soda', 'Baking Soda', GroceryCategory.PantryStaples],
      ['red-wine-vinegar', 'Red Wine Vinegar', GroceryCategory.SpicesAndCondiments],
      ['apple-cider-vinegar', 'Apple Cider Vinegar', GroceryCategory.SpicesAndCondiments],
      ['peanut-butter', 'Peanut Butter', GroceryCategory.PantryStaples],
      ['cream-of-tartar', 'Cream of Tartar', GroceryCategory.SpicesAndCondiments],
      ['garlic-powder', 'Garlic Powder', GroceryCategory.SpicesAndCondiments],
      ['steak', 'Flank Steak', GroceryCategory.Meat],
    ])('%s (%s) → %s', (id, name, expected) => {
      expect(categorizeIngredient(id, name)).toBe(expected);
    });
  });

  describe('keeps categorizing plurals, compound words, and id formats', () => {
    it.each([
      ['egg', 'Large Eggs', GroceryCategory.Dairy],
      ['tomato', 'Roma Tomatoes', GroceryCategory.Produce],
      ['potato', 'Potatoes', GroceryCategory.Produce],
      ['berries', 'Mixed Berries', GroceryCategory.Produce],
      ['blueberry', 'Blueberries', GroceryCategory.Produce],
      ['strawberry', 'Strawberries', GroceryCategory.Produce],
      ['pineapple', 'Pineapple', GroceryCategory.Produce],
      ['buttermilk', 'Buttermilk', GroceryCategory.Dairy],
      ['walnut', 'Walnuts', GroceryCategory.PantryStaples],
      ['peanut', 'Roasted Peanuts', GroceryCategory.PantryStaples],
      ['breadcrumbs', 'Panko Breadcrumbs', GroceryCategory.PantryStaples],
      ['chicken-thigh', 'Chicken Thighs', GroceryCategory.Meat],
      ['chicken_broth', 'Chicken Broth', GroceryCategory.Meat],
      ['jalapeno', 'Jalapeños', GroceryCategory.Produce],
      ['dinner-rolls', 'Dinner Rolls', GroceryCategory.Bakery],
      ['lemon-juice', 'Lemon Juice', GroceryCategory.Produce],
      ['sparkling-water', 'Sparkling Water', GroceryCategory.Beverages],
      ['goat-cheese', 'Goat Cheese', GroceryCategory.Dairy],
      ['champagne-vinegar', 'Champagne Vinegar', GroceryCategory.SpicesAndCondiments],
      ['grapefruit', 'Grapefruit', GroceryCategory.Produce],
      ['lemongrass', 'Lemongrass', GroceryCategory.Produce],
      ['mayonnaise', 'Mayonnaise', GroceryCategory.SpicesAndCondiments],
      ['applesauce', 'Applesauce', GroceryCategory.PantryStaples],
      ['cornflakes', 'Cornflakes', GroceryCategory.PantryStaples],
    ])('%s (%s) → %s', (id, name, expected) => {
      expect(categorizeIngredient(id, name)).toBe(expected);
    });
  });

  it('GROCERY_CATEGORY_ORDER contains every GroceryCategory value exactly once', () => {
    const allCategories = Object.values(GroceryCategory);
    expect(GROCERY_CATEGORY_ORDER).toHaveLength(allCategories.length);
    expect(new Set(GROCERY_CATEGORY_ORDER)).toEqual(new Set(allCategories));
  });
});
