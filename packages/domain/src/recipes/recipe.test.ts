import { describe, expect, it } from 'vitest';
import {
  DietaryTag,
  IngredientLine,
  InvalidQuantityError,
  InvalidRecipeError,
  Quantity,
  Recipe,
  RecipeStep,
  scaleRecipe,
} from '../index.js';

describe('Recipe Domain Model & Scaling', () => {
  const createValidIngredients = (): IngredientLine[] => [
    new IngredientLine('flour', 'All-purpose flour', new Quantity(2, 'cup')),
    new IngredientLine('sugar', 'Granulated sugar', new Quantity(100, 'g')),
    new IngredientLine('egg', 'Large eggs', new Quantity(3, 'egg')),
  ];

  describe('IngredientLine Construction & Validation', () => {
    it('creates a valid IngredientLine', () => {
      const line = new IngredientLine('flour', 'All-purpose flour', new Quantity(2, 'cup'));
      expect(line.ingredientId).toBe('flour');
      expect(line.displayName).toBe('All-purpose flour');
      expect(line.quantity.amount).toBe(2);
      expect(line.quantity.unit).toBe('cup');
    });

    it('rejects empty or whitespace-only ingredientId', () => {
      const q = new Quantity(1, 'cup');
      expect(() => new IngredientLine('', 'Flour', q)).toThrow(InvalidRecipeError);
      expect(() => new IngredientLine('   ', 'Flour', q)).toThrow(InvalidRecipeError);
    });

    it('rejects empty or whitespace-only displayName', () => {
      const q = new Quantity(1, 'cup');
      expect(() => new IngredientLine('flour', '', q)).toThrow(InvalidRecipeError);
      expect(() => new IngredientLine('flour', '   ', q)).toThrow(InvalidRecipeError);
    });

    it('is immutable (frozen)', () => {
      const line = new IngredientLine('flour', 'All-purpose flour', new Quantity(2, 'cup'));
      expect(Object.isFrozen(line)).toBe(true);
    });
  });

  describe('Recipe Construction & Validation', () => {
    it('creates a valid Recipe with dietary tags', () => {
      const recipe = new Recipe('recipe-1', 'Pancakes', 4, createValidIngredients(), [
        DietaryTag.Vegetarian,
      ]);

      expect(recipe.id).toBe('recipe-1');
      expect(recipe.name).toBe('Pancakes');
      expect(recipe.baseServings).toBe(4);
      expect(recipe.ingredients).toHaveLength(3);
      expect(recipe.dietaryTags).toEqual([DietaryTag.Vegetarian]);
    });

    it('creates a valid Recipe with empty dietary tags', () => {
      const recipe = new Recipe('recipe-2', 'BBQ Ribs', 6, createValidIngredients());

      expect(recipe.dietaryTags).toEqual([]);
    });

    it('rejects empty or whitespace-only id', () => {
      expect(() => new Recipe('', 'Pancakes', 4, createValidIngredients())).toThrow(
        InvalidRecipeError
      );

      expect(() => new Recipe('   ', 'Pancakes', 4, createValidIngredients())).toThrow(
        InvalidRecipeError
      );
    });

    it('rejects empty or whitespace-only name', () => {
      expect(() => new Recipe('recipe-1', '', 4, createValidIngredients())).toThrow(
        InvalidRecipeError
      );

      expect(() => new Recipe('recipe-1', '   ', 4, createValidIngredients())).toThrow(
        InvalidRecipeError
      );
    });

    it('rejects non-positive or non-integer baseServings (zero, negative, fractional, NaN, Infinity)', () => {
      const ings = createValidIngredients();
      expect(() => new Recipe('r1', 'Name', 0, ings)).toThrow(InvalidRecipeError);
      expect(() => new Recipe('r1', 'Name', -4, ings)).toThrow(InvalidRecipeError);
      expect(() => new Recipe('r1', 'Name', 2.5, ings)).toThrow(InvalidRecipeError);
      expect(() => new Recipe('r1', 'Name', NaN, ings)).toThrow(InvalidRecipeError);
      expect(() => new Recipe('r1', 'Name', Infinity, ings)).toThrow(InvalidRecipeError);
    });

    it('rejects empty ingredients array', () => {
      expect(() => new Recipe('r1', 'Name', 4, [])).toThrow(InvalidRecipeError);
    });

    it('enforces deep immutability on Recipe and ingredients array', () => {
      const recipe = new Recipe('recipe-1', 'Pancakes', 4, createValidIngredients(), [
        DietaryTag.Vegetarian,
      ]);

      expect(Object.isFrozen(recipe)).toBe(true);
      expect(Object.isFrozen(recipe.ingredients)).toBe(true);
      expect(Object.isFrozen(recipe.dietaryTags)).toBe(true);

      // Attempting to mutate ingredients array fails
      expect(() => {
        // @ts-expect-error mutating readonly array for test
        recipe.ingredients.push(new IngredientLine('butter', 'Butter', new Quantity(1, 'tbsp')));
      }).toThrow();
    });
  });

  describe('steps', () => {
    it('defaults to an empty array when omitted', () => {
      const recipe = new Recipe('recipe-1', 'Pancakes', 4, createValidIngredients());
      expect(recipe.steps).toEqual([]);
    });

    it('accepts a valid array of RecipeStep', () => {
      const steps = [
        new RecipeStep('Mix dry ingredients.'),
        new RecipeStep('Add wet ingredients.'),
      ];
      const recipe = new Recipe('recipe-1', 'Pancakes', 4, createValidIngredients(), [], steps);
      expect(recipe.steps).toHaveLength(2);
      expect(recipe.steps[0].instruction).toBe('Mix dry ingredients.');
    });

    it('rejects a non-array steps value', () => {
      expect(
        () =>
          // @ts-expect-error testing invalid input type
          new Recipe('recipe-1', 'Pancakes', 4, createValidIngredients(), [], 'not-an-array')
      ).toThrow(InvalidRecipeError);
    });

    it('rejects an array containing non-RecipeStep elements', () => {
      expect(
        () =>
          new Recipe(
            'recipe-1',
            'Pancakes',
            4,
            createValidIngredients(),
            [],
            [
              // @ts-expect-error testing invalid element type
              'not-a-recipe-step',
            ]
          )
      ).toThrow(InvalidRecipeError);
    });

    it('is frozen and rejects mutation', () => {
      const steps = [new RecipeStep('Mix dry ingredients.')];
      const recipe = new Recipe('recipe-1', 'Pancakes', 4, createValidIngredients(), [], steps);

      expect(Object.isFrozen(recipe.steps)).toBe(true);
      expect(() => {
        // @ts-expect-error mutating readonly array for test
        recipe.steps.push(new RecipeStep('Extra step.'));
      }).toThrow();
    });
  });

  describe('scaleRecipe()', () => {
    it('returns unchanged quantities when targetServings equals baseServings (factor = 1)', () => {
      const recipe = new Recipe('r1', 'Pancakes', 4, createValidIngredients());
      const scaled = scaleRecipe(recipe, 4);

      expect(scaled.sourceRecipeId).toBe('r1');
      expect(scaled.sourceRecipeName).toBe('Pancakes');
      expect(scaled.targetServings).toBe(4);
      expect(scaled.scaleFactor).toBe(1);
      expect(scaled.ingredients[0].quantity.amount).toBe(2);
      expect(scaled.ingredients[1].quantity.amount).toBe(100);
      expect(scaled.ingredients[2].quantity.amount).toBe(3);
    });

    it('doubles ingredient quantities when targetServings is doubled', () => {
      const recipe = new Recipe('r1', 'Pancakes', 4, createValidIngredients());
      const scaled = scaleRecipe(recipe, 8);

      expect(scaled.targetServings).toBe(8);
      expect(scaled.scaleFactor).toBe(2);
      expect(scaled.ingredients[0].quantity.amount).toBe(4); // 2 cup * 2
      expect(scaled.ingredients[1].quantity.amount).toBe(200); // 100 g * 2
      expect(scaled.ingredients[2].quantity.amount).toBe(6); // 3 egg * 2
    });

    it('rejects non-integer or non-positive targetServings (zero, negative, fractional, NaN, Infinity)', () => {
      const recipe = new Recipe('r1', 'Pancakes', 4, createValidIngredients());

      expect(() => scaleRecipe(recipe, 0)).toThrow(InvalidRecipeError);
      expect(() => scaleRecipe(recipe, -2)).toThrow(InvalidRecipeError);
      expect(() => scaleRecipe(recipe, 2.5)).toThrow(InvalidRecipeError);
      expect(() => scaleRecipe(recipe, NaN)).toThrow(InvalidRecipeError);
      expect(() => scaleRecipe(recipe, Infinity)).toThrow(InvalidRecipeError);
    });

    it('does NOT mutate the original Recipe or its ingredient lines', () => {
      const recipe = new Recipe('r1', 'Pancakes', 4, createValidIngredients());
      const originalFlourAmount = recipe.ingredients[0].quantity.amount;

      scaleRecipe(recipe, 12);

      expect(recipe.ingredients[0].quantity.amount).toBe(originalFlourAmount);
      expect(recipe.baseServings).toBe(4);
    });

    it('carries dietaryTags through unchanged to ScaledRecipe', () => {
      const tags = [DietaryTag.Vegetarian, DietaryTag.Vegan];
      const recipe = new Recipe('r1', 'Pancakes', 4, createValidIngredients(), tags);
      const scaled = scaleRecipe(recipe, 8);

      expect(scaled.dietaryTags).toEqual(tags);
    });

    it('produces fractional result for Count-category ingredients without rounding', () => {
      const recipe = new Recipe('r1', 'Omelette', 2, [
        new IngredientLine('egg', 'Eggs', new Quantity(3, 'egg')),
      ]);

      // Scale from 2 to 3 servings (scaleFactor = 1.5)
      const scaled = scaleRecipe(recipe, 3);
      expect(scaled.scaleFactor).toBe(1.5);
      expect(scaled.ingredients[0].quantity.amount).toBe(4.5); // 3 * 1.5 = 4.5
      expect(scaled.ingredients[0].quantity.unit).toBe('egg');
    });

    it("propagates InvalidQuantityError if an ingredient's quantity.scale() throws", () => {
      const mockQuantity = Object.create(Quantity.prototype);
      mockQuantity.scale = () => {
        throw new InvalidQuantityError('Simulated quantity error');
      };

      const invalidLine = new IngredientLine('flour', 'Flour', mockQuantity);
      const badRecipe = new Recipe('r2', 'Bad Recipe', 4, [invalidLine]);

      expect(() => scaleRecipe(badRecipe, 8)).toThrow(InvalidQuantityError);
    });
  });
});
