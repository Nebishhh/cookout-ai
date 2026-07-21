import { describe, expect, it } from 'vitest';
import {
  consolidateShoppingList,
  IngredientLine,
  Quantity,
  Recipe,
  scaleRecipe,
  UnitCategory,
} from '../index.js';

describe('consolidateShoppingList()', () => {
  it('returns an empty array when given an empty input array', () => {
    const result = consolidateShoppingList([]);
    expect(result).toEqual([]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('consolidates two recipes with the same ingredientId and same unit correctly', () => {
    const recipe1 = new Recipe('r1', 'Cake', 4, [
      new IngredientLine('sugar', 'Granulated Sugar', new Quantity(200, 'g')),
    ]);
    const recipe2 = new Recipe('r2', 'Cookies', 6, [
      new IngredientLine('sugar', 'White Sugar', new Quantity(150, 'g')),
    ]);

    const scaled1 = scaleRecipe(recipe1, 4);
    const scaled2 = scaleRecipe(recipe2, 6);

    const list = consolidateShoppingList([scaled1, scaled2]);

    expect(list).toHaveLength(1);
    expect(list[0].ingredientId).toBe('sugar');
    expect(list[0].displayName).toBe('Granulated Sugar'); // First seen wins
    expect(list[0].quantity.amount).toBe(350); // 200 + 150
    expect(list[0].quantity.unit).toBe('g');
    expect(list[0].quantity.category).toBe(UnitCategory.Mass);
    expect(list[0].sourceRecipeIds).toEqual(['r1', 'r2']);
  });

  it('consolidates same-category ingredients with DIFFERENT units by converting to base unit and summing', () => {
    // 2 cups milk + 100 ml milk (Volume base unit: ml)
    const recipe1 = new Recipe('r1', 'Pancakes', 4, [
      new IngredientLine('milk', 'Whole Milk', new Quantity(2, 'cup')),
    ]);
    const recipe2 = new Recipe('r2', 'Sauce', 2, [
      new IngredientLine('milk', 'Fresh Milk', new Quantity(100, 'ml')),
    ]);

    const scaled1 = scaleRecipe(recipe1, 4);
    const scaled2 = scaleRecipe(recipe2, 2);

    const list = consolidateShoppingList([scaled1, scaled2]);

    expect(list).toHaveLength(1);
    expect(list[0].ingredientId).toBe('milk');
    expect(list[0].displayName).toBe('Whole Milk');
    expect(list[0].quantity.unit).toBe('ml');
    // 2 cups = 2 * 236.5882365 = 473.176473 ml; + 100 ml = 573.176473 ml
    expect(list[0].quantity.amount).toBeCloseTo(573.176473, 4);
    expect(list[0].sourceRecipeIds).toEqual(['r1', 'r2']);
  });

  it('keeps same ingredientId with DIFFERENT categories as SEPARATE ShoppingListItem entries', () => {
    // "butter" used as Mass (g) in one recipe, Volume (tbsp) in another
    const recipe1 = new Recipe('r1', 'Baking', 4, [
      new IngredientLine('butter', 'Unsalted Butter', new Quantity(100, 'g')),
    ]);
    const recipe2 = new Recipe('r2', 'Frying', 2, [
      new IngredientLine('butter', 'Melted Butter', new Quantity(2, 'tbsp')),
    ]);

    const scaled1 = scaleRecipe(recipe1, 4);
    const scaled2 = scaleRecipe(recipe2, 2);

    const list = consolidateShoppingList([scaled1, scaled2]);

    expect(list).toHaveLength(2);

    const massItem = list.find((item) => item.quantity.category === UnitCategory.Mass);
    const volumeItem = list.find((item) => item.quantity.category === UnitCategory.Volume);

    expect(massItem).toBeDefined();
    expect(massItem?.ingredientId).toBe('butter');
    expect(massItem?.displayName).toBe('Unsalted Butter');
    expect(massItem?.quantity.amount).toBe(100);
    expect(massItem?.quantity.unit).toBe('g');
    expect(massItem?.sourceRecipeIds).toEqual(['r1']);

    expect(volumeItem).toBeDefined();
    expect(volumeItem?.ingredientId).toBe('butter');
    expect(volumeItem?.displayName).toBe('Melted Butter');
    expect(volumeItem?.quantity.unit).toBe('ml'); // Converted to volume base unit
    expect(volumeItem?.sourceRecipeIds).toEqual(['r2']);
  });

  it('keeps Count-category ingredients with DIFFERENT exact units as SEPARATE entries', () => {
    const recipe1 = new Recipe('r1', 'Cake', 4, [
      new IngredientLine('egg', 'Eggs', new Quantity(3, 'egg')),
    ]);
    const recipe2 = new Recipe('r2', 'Omelette', 2, [
      new IngredientLine('egg', 'Large Eggs', new Quantity(2, 'count')),
    ]);

    const scaled1 = scaleRecipe(recipe1, 4);
    const scaled2 = scaleRecipe(recipe2, 2);

    const list = consolidateShoppingList([scaled1, scaled2]);

    expect(list).toHaveLength(2);

    const eggItem = list.find((item) => item.quantity.unit === 'egg');
    const countItem = list.find((item) => item.quantity.unit === 'count');

    expect(eggItem).toBeDefined();
    expect(eggItem?.quantity.amount).toBe(3);
    expect(eggItem?.sourceRecipeIds).toEqual(['r1']);

    expect(countItem).toBeDefined();
    expect(countItem?.quantity.amount).toBe(2);
    expect(countItem?.sourceRecipeIds).toEqual(['r2']);
  });

  it('sums Count-category ingredients with SAME exact unit across recipes correctly', () => {
    const recipe1 = new Recipe('r1', 'Cake', 4, [
      new IngredientLine('egg', 'Eggs', new Quantity(3, 'egg')),
    ]);
    const recipe2 = new Recipe('r2', 'Cookies', 6, [
      new IngredientLine('egg', 'Farm Eggs', new Quantity(2, 'egg')),
    ]);

    const scaled1 = scaleRecipe(recipe1, 4);
    const scaled2 = scaleRecipe(recipe2, 6);

    const list = consolidateShoppingList([scaled1, scaled2]);

    expect(list).toHaveLength(1);
    expect(list[0].ingredientId).toBe('egg');
    expect(list[0].displayName).toBe('Eggs'); // First seen wins
    expect(list[0].quantity.amount).toBe(5);
    expect(list[0].quantity.unit).toBe('egg');
    expect(list[0].sourceRecipeIds).toEqual(['r1', 'r2']);
  });

  it('lists sourceRecipeIds in encounter order without duplicates', () => {
    const recipe1 = new Recipe('r1', 'Soup A', 2, [
      new IngredientLine('salt', 'Salt', new Quantity(5, 'g')),
      new IngredientLine('salt', 'Sea Salt', new Quantity(2, 'g')), // Same recipe duplicate line
    ]);
    const recipe2 = new Recipe('r2', 'Soup B', 4, [
      new IngredientLine('salt', 'Fine Salt', new Quantity(3, 'g')),
    ]);

    const scaled1 = scaleRecipe(recipe1, 2);
    const scaled2 = scaleRecipe(recipe2, 4);

    const list = consolidateShoppingList([scaled1, scaled2]);

    expect(list).toHaveLength(1);
    expect(list[0].quantity.amount).toBe(10); // 5 + 2 + 3
    expect(list[0].sourceRecipeIds).toEqual(['r1', 'r2']);
  });

  it('uses the first-encountered displayName when recipes differ', () => {
    const recipe1 = new Recipe('r1', 'Recipe 1', 2, [
      new IngredientLine('flour', 'All-Purpose Flour', new Quantity(100, 'g')),
    ]);
    const recipe2 = new Recipe('r2', 'Recipe 2', 4, [
      new IngredientLine('flour', 'Sifted Flour', new Quantity(200, 'g')),
    ]);

    const scaled1 = scaleRecipe(recipe1, 2);
    const scaled2 = scaleRecipe(recipe2, 4);

    const list = consolidateShoppingList([scaled1, scaled2]);

    expect(list[0].displayName).toBe('All-Purpose Flour');
  });

  it('does NOT mutate any input ScaledRecipe or its ingredients', () => {
    const recipe = new Recipe('r1', 'Stew', 4, [
      new IngredientLine('beef', 'Beef Chuck', new Quantity(500, 'g')),
    ]);
    const scaled = scaleRecipe(recipe, 8); // 1000g beef

    const originalAmount = scaled.ingredients[0].quantity.amount;

    consolidateShoppingList([scaled]);

    expect(scaled.ingredients[0].quantity.amount).toBe(originalAmount);
    expect(scaled.ingredients[0].quantity.amount).toBe(1000);
  });

  it('works correctly as a degenerate one-recipe case', () => {
    const recipe = new Recipe('r1', 'Salad', 2, [
      new IngredientLine('lettuce', 'Romaine Lettuce', new Quantity(1, 'count')),
      new IngredientLine('oil', 'Olive Oil', new Quantity(2, 'tbsp')),
    ]);

    const scaled = scaleRecipe(recipe, 2);
    const list = consolidateShoppingList([scaled]);

    expect(list).toHaveLength(2);

    const countItem = list.find((item) => item.ingredientId === 'lettuce');
    const oilItem = list.find((item) => item.ingredientId === 'oil');

    expect(countItem?.quantity.amount).toBe(1);
    expect(countItem?.quantity.unit).toBe('count');
    expect(countItem?.sourceRecipeIds).toEqual(['r1']);

    expect(oilItem?.quantity.unit).toBe('ml'); // Converted to volume base unit
    expect(oilItem?.quantity.amount).toBeCloseTo(29.5735, 3); // 2 tbsp = ~29.5735 ml
    expect(oilItem?.sourceRecipeIds).toEqual(['r1']);
  });
});
