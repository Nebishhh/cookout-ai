import { describe, expect, it } from 'vitest';
import { GuestGroup } from './guestGroup.js';
import { computeEligibleServings } from './computeEligibleServings.js';
import { planEventShoppingList } from './planEventShoppingList.js';
import { InvalidGuestGroupError } from '../errors.js';
import { Recipe } from '../recipes/recipe.js';
import { IngredientLine } from '../recipes/ingredientLine.js';
import { Quantity } from '../units/quantity.js';
import { DietaryTag } from '../recipes/types.js';
import type { IncludedRecipePlan } from './types.js';

describe('Events Domain Module', () => {
  describe('GuestGroup Value Object', () => {
    it('constructs a valid GuestGroup and derives omnivoreCount correctly', () => {
      const gg = new GuestGroup({ totalGuests: 10, vegetarianCount: 4, veganCount: 2 });
      expect(gg.totalGuests).toBe(10);
      expect(gg.vegetarianCount).toBe(4);
      expect(gg.veganCount).toBe(2);
      expect(gg.omnivoreCount).toBe(6);
    });

    it('handles edge case where veganCount == vegetarianCount', () => {
      const gg = new GuestGroup({ totalGuests: 5, vegetarianCount: 3, veganCount: 3 });
      expect(gg.vegetarianCount).toBe(3);
      expect(gg.veganCount).toBe(3);
      expect(gg.omnivoreCount).toBe(2);
    });

    it('handles edge case where vegetarianCount == totalGuests', () => {
      const gg = new GuestGroup({ totalGuests: 8, vegetarianCount: 8, veganCount: 2 });
      expect(gg.omnivoreCount).toBe(0);
    });

    it('handles edge case where veganCount == 0', () => {
      const gg = new GuestGroup({ totalGuests: 12, vegetarianCount: 3, veganCount: 0 });
      expect(gg.veganCount).toBe(0);
      expect(gg.omnivoreCount).toBe(9);
    });

    it('rejects invalid totalGuests (zero, negative, fractional, NaN, Infinity)', () => {
      expect(() => new GuestGroup({ totalGuests: 0 })).toThrow(InvalidGuestGroupError);
      expect(() => new GuestGroup({ totalGuests: -5 })).toThrow(InvalidGuestGroupError);
      expect(() => new GuestGroup({ totalGuests: 4.5 })).toThrow(InvalidGuestGroupError);
      expect(() => new GuestGroup({ totalGuests: NaN })).toThrow(InvalidGuestGroupError);
      expect(() => new GuestGroup({ totalGuests: Infinity })).toThrow(InvalidGuestGroupError);
    });

    it('rejects veganCount > vegetarianCount', () => {
      expect(() => new GuestGroup({ totalGuests: 10, vegetarianCount: 2, veganCount: 3 })).toThrow(
        InvalidGuestGroupError
      );
    });

    it('rejects vegetarianCount > totalGuests', () => {
      expect(() => new GuestGroup({ totalGuests: 5, vegetarianCount: 6, veganCount: 1 })).toThrow(
        InvalidGuestGroupError
      );
    });

    it('enforces immutability via Object.isFrozen', () => {
      const gg = new GuestGroup({ totalGuests: 10, vegetarianCount: 2, veganCount: 1 });
      expect(Object.isFrozen(gg)).toBe(true);
    });
  });

  describe('computeEligibleServings', () => {
    // 12 total guests: 3 vegetarians of which 1 is vegan => 9 omnivores, 2 non-vegan vegetarians, 1 vegan
    const mixedGroup = new GuestGroup({ totalGuests: 12, vegetarianCount: 3, veganCount: 1 });

    it('returns totalGuests for a Vegan-tagged recipe regardless of dietary breakdown', () => {
      const veganRecipe = new Recipe(
        'r1',
        'Vegan Salad',
        4,
        [new IngredientLine('lettuce', 'Lettuce', new Quantity(100, 'g'))],
        [DietaryTag.Vegan]
      );

      expect(computeEligibleServings(veganRecipe, mixedGroup)).toBe(12);
    });

    it('returns totalGuests - veganCount for a Vegetarian-tagged (non-vegan) recipe', () => {
      const vegRecipe = new Recipe(
        'r2',
        'Cheese Pizza',
        4,
        [new IngredientLine('cheese', 'Cheese', new Quantity(200, 'g'))],
        [DietaryTag.Vegetarian]
      );

      // 12 total - 1 vegan = 11 eligible guests
      expect(computeEligibleServings(vegRecipe, mixedGroup)).toBe(11);
    });

    it('returns omnivoreCount for an untagged recipe (excludes vegetarians & vegans)', () => {
      const meatRecipe = new Recipe('r3', 'Beef Burger', 4, [
        new IngredientLine('beef', 'Ground Beef', new Quantity(500, 'g')),
      ]);

      // 12 total - 3 vegetarians = 9 omnivores
      expect(computeEligibleServings(meatRecipe, mixedGroup)).toBe(9);
    });

    it('treats a recipe tagged BOTH Vegetarian and Vegan as Vegan (eligible for everyone)', () => {
      const dualRecipe = new Recipe(
        'r4',
        'Dual Tagged Tofu',
        2,
        [new IngredientLine('tofu', 'Tofu', new Quantity(1, 'count'))],
        [DietaryTag.Vegetarian, DietaryTag.Vegan]
      );

      expect(computeEligibleServings(dualRecipe, mixedGroup)).toBe(12);
    });
  });

  describe('planEventShoppingList', () => {
    it('EXCLUDES an untagged recipe when vegetarianCount == totalGuests and records reason', () => {
      const allVegGroup = new GuestGroup({ totalGuests: 10, vegetarianCount: 10, veganCount: 2 });
      const meatRecipe = new Recipe('r-steak', 'Steak', 2, [
        new IngredientLine('beef', 'Steak', new Quantity(2, 'lb')),
      ]);

      const plan = planEventShoppingList([meatRecipe], allVegGroup);

      expect(plan.includedRecipes).toHaveLength(0);
      expect(plan.excludedRecipes).toHaveLength(1);
      expect(plan.excludedRecipes[0].recipe.name).toBe('Steak');
      expect(plan.excludedRecipes[0].reason).toContain('No eligible guests');
      expect(plan.shoppingList).toHaveLength(0);
    });

    it('produces correct eligible servings for each recipe in a realistic mixed scenario', () => {
      // 12 total, 3 veg, 1 vegan (9 omnivores, 2 veg-only, 1 vegan)
      const mixedGroup = new GuestGroup({ totalGuests: 12, vegetarianCount: 3, veganCount: 1 });

      const meatMain = new Recipe('r-beef', 'Beef Roast', 6, [
        new IngredientLine('beef', 'Beef', new Quantity(1, 'kg')),
      ]);

      const vegSide = new Recipe(
        'r-mac',
        'Mac and Cheese',
        4,
        [new IngredientLine('cheese', 'Cheddar', new Quantity(200, 'g'))],
        [DietaryTag.Vegetarian]
      );

      const veganDessert = new Recipe(
        'r-fruit',
        'Fruit Salad',
        6,
        [new IngredientLine('apple', 'Apple', new Quantity(3, 'count'))],
        [DietaryTag.Vegan]
      );

      const plan = planEventShoppingList([meatMain, vegSide, veganDessert], mixedGroup);

      expect(plan.includedRecipes).toHaveLength(3);
      expect(plan.excludedRecipes).toHaveLength(0);

      const meatPlan = plan.includedRecipes.find(
        (r: IncludedRecipePlan) => r.scaledRecipe.sourceRecipeName === 'Beef Roast'
      );
      const vegPlan = plan.includedRecipes.find(
        (r: IncludedRecipePlan) => r.scaledRecipe.sourceRecipeName === 'Mac and Cheese'
      );
      const veganPlan = plan.includedRecipes.find(
        (r: IncludedRecipePlan) => r.scaledRecipe.sourceRecipeName === 'Fruit Salad'
      );

      expect(meatPlan?.eligibleServings).toBe(9); // 9 omnivores
      expect(vegPlan?.eligibleServings).toBe(11); // 12 total - 1 vegan
      expect(veganPlan?.eligibleServings).toBe(12); // 12 total guests
    });

    it('correctly consolidates ingredients across differently-scaled recipes in an event plan', () => {
      // Group: 10 guests (2 vegetarians, 0 vegans) => 8 omnivores, 2 vegetarians
      const group = new GuestGroup({ totalGuests: 10, vegetarianCount: 2, veganCount: 0 });

      // Recipe 1: Meat dish (8 eligible, base 4 => scale 2.0). Needs 500g potatoes (Mass)
      const r1 = new Recipe('r-pie', 'Shepherd Pie', 4, [
        new IngredientLine('potato', 'Russet Potato', new Quantity(500, 'g')),
      ]);

      // Recipe 2: Vegan dish (10 eligible, base 5 => scale 2.0). Needs 1 kg potatoes (Mass)
      const r2 = new Recipe(
        'r-mash',
        'Mashed Potatoes',
        5,
        [new IngredientLine('potato', 'Yukon Potato', new Quantity(1, 'kg'))],
        [DietaryTag.Vegan]
      );

      const plan = planEventShoppingList([r1, r2], group);

      expect(plan.includedRecipes).toHaveLength(2);
      expect(plan.shoppingList).toHaveLength(1);

      const potatoItem = plan.shoppingList[0];
      expect(potatoItem.ingredientId).toBe('potato');
      // 500g * 2.0 = 1000g + (1kg * 2.0 = 2000g) = 3000g = 3000 g
      expect(potatoItem.quantity.amount).toBe(3000);
      expect(potatoItem.quantity.unit).toBe('g');
      expect(potatoItem.sourceRecipeIds).toHaveLength(2);
    });

    it('does not mutate input Recipe array or GuestGroup', () => {
      const group = new GuestGroup({ totalGuests: 10, vegetarianCount: 2, veganCount: 1 });
      const recipe = new Recipe(
        'r-salad',
        'Salad',
        2,
        [new IngredientLine('oil', 'Olive Oil', new Quantity(2, 'tbsp'))],
        [DietaryTag.Vegan]
      );

      const recipesInput = [recipe];
      const plan = planEventShoppingList(recipesInput, group);

      expect(recipesInput[0]).toBe(recipe);
      expect(plan.guestGroup).toBe(group);
      expect(Object.isFrozen(plan)).toBe(true);
    });
  });
});
