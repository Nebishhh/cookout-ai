import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from './app.js';
import { prisma } from './prisma.js';

/**
 * Testing Architecture & Database Isolation Note:
 * - We use `supertest` with Vitest to perform HTTP integration tests against the Express app.
 * - A dedicated SQLite database file `prisma/test.db` is specified via process.env.DATABASE_URL in `vitest.config.ts` during test execution.
 * - Before tests run, we clear `test.db` tables before each test for complete test isolation without touching `dev.db`.
 */

describe('CookOut AI API Endpoints', () => {
  beforeAll(async () => {
    // Ensure test database has schema applied
    try {
      await prisma.$executeRawUnsafe('DELETE FROM IngredientLine');
      await prisma.$executeRawUnsafe('DELETE FROM Recipe');
    } catch {
      // Table creation handled by initial migration/db push
    }
  });

  beforeEach(async () => {
    // Clean database before each test
    await prisma.ingredientLine.deleteMany();
    await prisma.recipe.deleteMany();
  });

  describe('GET /api/health', () => {
    it('returns health status', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('app', 'CookOut AI Backend API');
      expect(response.body).toHaveProperty('domainPackage', '@cookout-ai/domain');
    });
  });

  describe('POST /api/recipes & GET /api/recipes', () => {
    it('creates a valid recipe (201) and retrieves it via GET /api/recipes/:id', async () => {
      const newRecipe = {
        name: 'Classic Pancakes',
        baseServings: 4,
        dietaryTags: ['Vegetarian'],
        ingredients: [
          { ingredientId: 'flour', displayName: 'All-Purpose Flour', amount: 2, unit: 'cup' },
          { ingredientId: 'milk', displayName: 'Whole Milk', amount: 200, unit: 'ml' },
        ],
      };

      const createRes = await request(app).post('/api/recipes').send(newRecipe);
      expect(createRes.status).toBe(201);
      expect(createRes.body).toHaveProperty('id');
      expect(createRes.body.name).toBe('Classic Pancakes');
      expect(createRes.body.baseServings).toBe(4);
      expect(createRes.body.dietaryTags).toEqual(['Vegetarian']);
      expect(createRes.body.ingredients).toHaveLength(2);

      const recipeId = createRes.body.id;

      // GET /api/recipes/:id
      const getRes = await request(app).get(`/api/recipes/${recipeId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.id).toBe(recipeId);
      expect(getRes.body.name).toBe('Classic Pancakes');
      expect(getRes.body.ingredients[0].ingredientId).toBe('flour');
    });

    it('rejects POST /api/recipes with invalid data (400) and persists nothing to database', async () => {
      // Invalid baseServings: 0
      const invalidRecipe = {
        name: 'Invalid Servings Recipe',
        baseServings: 0,
        ingredients: [{ ingredientId: 'flour', displayName: 'Flour', amount: 2, unit: 'cup' }],
      };

      const res0 = await request(app).post('/api/recipes').send(invalidRecipe);
      expect(res0.status).toBe(400);
      expect(res0.body).toHaveProperty('error', 'InvalidRecipeError');

      // Invalid unit
      const invalidUnitRecipe = {
        name: 'Invalid Unit Recipe',
        baseServings: 2,
        ingredients: [
          { ingredientId: 'flour', displayName: 'Flour', amount: 2, unit: 'unsupported_unit' },
        ],
      };

      const resUnit = await request(app).post('/api/recipes').send(invalidUnitRecipe);
      expect(resUnit.status).toBe(400);
      expect(resUnit.body).toHaveProperty('error', 'InvalidUnitError');

      // Verify no recipe was created in database
      const listRes = await request(app).get('/api/recipes');
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(0);
    });

    it('GET /api/recipes returns all created recipes', async () => {
      const r1 = {
        name: 'Recipe 1',
        baseServings: 2,
        ingredients: [{ ingredientId: 'egg', displayName: 'Eggs', amount: 2, unit: 'egg' }],
      };
      const r2 = {
        name: 'Recipe 2',
        baseServings: 4,
        ingredients: [{ ingredientId: 'milk', displayName: 'Milk', amount: 1, unit: 'cup' }],
      };

      await request(app).post('/api/recipes').send(r1);
      await request(app).post('/api/recipes').send(r2);

      const listRes = await request(app).get('/api/recipes');
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(2);
    });

    it('GET /api/recipes/:id with a nonexistent id returns 404', async () => {
      const res = await request(app).get('/api/recipes/non-existent-id-123');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'NotFound');
    });

    it('round-trips dietaryTags correctly through JSON serialization workaround', async () => {
      const recipeWithTags = {
        name: 'Vegan Salad',
        baseServings: 2,
        dietaryTags: ['Vegetarian', 'Vegan'],
        ingredients: [
          { ingredientId: 'lettuce', displayName: 'Romaine Lettuce', amount: 1, unit: 'count' },
        ],
      };

      const createRes = await request(app).post('/api/recipes').send(recipeWithTags);
      expect(createRes.status).toBe(201);
      const id = createRes.body.id;

      const getRes = await request(app).get(`/api/recipes/${id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.dietaryTags).toEqual(['Vegetarian', 'Vegan']);
    });
  });

  describe('POST /api/shopping-list', () => {
    it('returns a scaled and consolidated shopping list for multiple real recipes', async () => {
      // Recipe 1: 4 servings, needs 2 cups milk (Volume)
      const r1Res = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Pancakes',
          baseServings: 4,
          ingredients: [
            { ingredientId: 'milk', displayName: 'Whole Milk', amount: 2, unit: 'cup' },
            { ingredientId: 'sugar', displayName: 'White Sugar', amount: 100, unit: 'g' },
          ],
        });

      // Recipe 2: 2 servings, needs 100 ml milk (Volume)
      const r2Res = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Sauce',
          baseServings: 2,
          ingredients: [
            { ingredientId: 'milk', displayName: 'Fresh Milk', amount: 100, unit: 'ml' },
            { ingredientId: 'sugar', displayName: 'Fine Sugar', amount: 50, unit: 'g' },
          ],
        });

      const r1Id = r1Res.body.id;
      const r2Id = r2Res.body.id;

      // Request shopping list: Recipe 1 for 4 servings (factor 1), Recipe 2 for 2 servings (factor 1)
      const shoppingReq = [
        { recipeId: r1Id, targetServings: 4 },
        { recipeId: r2Id, targetServings: 2 },
      ];

      const res = await request(app).post('/api/shopping-list').send(shoppingReq);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('shoppingList');
      expect(res.body).toHaveProperty('scaledRecipes');

      const milkItem = res.body.shoppingList.find(
        (i: { ingredientId: string }) => i.ingredientId === 'milk'
      );
      const sugarItem = res.body.shoppingList.find(
        (i: { ingredientId: string }) => i.ingredientId === 'sugar'
      );

      expect(milkItem).toBeDefined();
      expect(milkItem.displayName).toBe('Whole Milk'); // First seen wins
      expect(milkItem.quantity.unit).toBe('ml');
      // 2 cups = ~473.176 ml + 100 ml = ~573.176 ml
      expect(milkItem.quantity.amount).toBeCloseTo(573.176, 3);
      expect(milkItem.sourceRecipeIds).toEqual([r1Id, r2Id]);

      expect(sugarItem).toBeDefined();
      expect(sugarItem.quantity.amount).toBe(150); // 100g + 50g
      expect(sugarItem.quantity.unit).toBe('g');
    });

    it('returns 404 naming the missing recipeId when recipeId does not exist', async () => {
      const r1Res = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Pancakes',
          baseServings: 4,
          ingredients: [{ ingredientId: 'milk', displayName: 'Milk', amount: 1, unit: 'cup' }],
        });

      const missingId = 'non-existent-recipe-999';
      const shoppingReq = [
        { recipeId: r1Res.body.id, targetServings: 4 },
        { recipeId: missingId, targetServings: 2 },
      ];

      const res = await request(app).post('/api/shopping-list').send(shoppingReq);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'NotFound');
      expect(res.body.message).toContain(missingId);
    });

    it('returns 400 when targetServings is invalid (0 or negative)', async () => {
      const r1Res = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Pancakes',
          baseServings: 4,
          ingredients: [{ ingredientId: 'milk', displayName: 'Milk', amount: 1, unit: 'cup' }],
        });

      const res0 = await request(app)
        .post('/api/shopping-list')
        .send([{ recipeId: r1Res.body.id, targetServings: 0 }]);
      expect(res0.status).toBe(400);
      expect(res0.body).toHaveProperty('error', 'InvalidRecipeError');

      const resNeg = await request(app)
        .post('/api/shopping-list')
        .send([{ recipeId: r1Res.body.id, targetServings: -3 }]);
      expect(resNeg.status).toBe(400);
      expect(resNeg.body).toHaveProperty('error', 'InvalidRecipeError');
    });
  });

  describe('PUT /api/recipes/:id & DELETE /api/recipes/:id', () => {
    it('PUT /api/recipes/:id with valid data updates the recipe; GET afterward reflects new values & new ingredient list', async () => {
      const initialRecipe = {
        name: 'Old Pancakes',
        baseServings: 2,
        dietaryTags: ['Vegetarian'],
        ingredients: [{ ingredientId: 'flour', displayName: 'Flour', amount: 1, unit: 'cup' }],
      };

      const createRes = await request(app).post('/api/recipes').send(initialRecipe);
      expect(createRes.status).toBe(201);
      const recipeId = createRes.body.id;

      const updatedPayload = {
        name: 'New Fluffy Waffles',
        baseServings: 6,
        dietaryTags: ['Vegan'],
        ingredients: [
          { ingredientId: 'waffle-mix', displayName: 'Waffle Mix', amount: 500, unit: 'g' },
          { ingredientId: 'water', displayName: 'Water', amount: 300, unit: 'ml' },
          { ingredientId: 'oil', displayName: 'Vegetable Oil', amount: 2, unit: 'tbsp' },
        ],
      };

      const putRes = await request(app).put(`/api/recipes/${recipeId}`).send(updatedPayload);
      expect(putRes.status).toBe(200);
      expect(putRes.body.id).toBe(recipeId);
      expect(putRes.body.name).toBe('New Fluffy Waffles');
      expect(putRes.body.baseServings).toBe(6);
      expect(putRes.body.dietaryTags).toEqual(['Vegan']);
      expect(putRes.body.ingredients).toHaveLength(3);

      const getRes = await request(app).get(`/api/recipes/${recipeId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.name).toBe('New Fluffy Waffles');
      expect(getRes.body.ingredients[0].ingredientId).toBe('waffle-mix');
    });

    it('PUT /api/recipes/:id with invalid data (baseServings: 0) returns 400 AND the original recipe is unchanged', async () => {
      const originalRecipe = {
        name: 'Original Safe Recipe',
        baseServings: 4,
        dietaryTags: ['Vegetarian'],
        ingredients: [{ ingredientId: 'milk', displayName: 'Milk', amount: 2, unit: 'cup' }],
      };

      const createRes = await request(app).post('/api/recipes').send(originalRecipe);
      expect(createRes.status).toBe(201);
      const recipeId = createRes.body.id;

      const invalidPayload = {
        name: 'Corrupted Attempt',
        baseServings: 0, // Invalid!
        ingredients: [{ ingredientId: 'milk', displayName: 'Milk', amount: 10, unit: 'cup' }],
      };

      const putRes = await request(app).put(`/api/recipes/${recipeId}`).send(invalidPayload);
      expect(putRes.status).toBe(400);
      expect(putRes.body).toHaveProperty('error', 'InvalidRecipeError');

      // Verify original recipe in DB is completely UNCHANGED
      const getRes = await request(app).get(`/api/recipes/${recipeId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.name).toBe('Original Safe Recipe');
      expect(getRes.body.baseServings).toBe(4);
      expect(getRes.body.ingredients).toHaveLength(1);
      expect(getRes.body.ingredients[0].amount).toBe(2);
    });

    it('PUT /api/recipes/:id for a nonexistent id returns 404', async () => {
      const res = await request(app)
        .put('/api/recipes/non-existent-id-404')
        .send({
          name: 'Ghosts',
          baseServings: 2,
          ingredients: [{ ingredientId: 'air', displayName: 'Air', amount: 1, unit: 'count' }],
        });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'NotFound');
    });

    it('DELETE /api/recipes/:id removes the recipe; subsequent GET returns 404', async () => {
      const recipe = {
        name: 'To Be Deleted',
        baseServings: 2,
        ingredients: [{ ingredientId: 'egg', displayName: 'Egg', amount: 1, unit: 'egg' }],
      };

      const createRes = await request(app).post('/api/recipes').send(recipe);
      const id = createRes.body.id;

      const deleteRes = await request(app).delete(`/api/recipes/${id}`);
      expect(deleteRes.status).toBe(204);

      const getRes = await request(app).get(`/api/recipes/${id}`);
      expect(getRes.status).toBe(404);
    });

    it('DELETE /api/recipes/:id also removes its IngredientLine rows directly in Prisma', async () => {
      const recipe = {
        name: 'Cascade Delete Test Recipe',
        baseServings: 4,
        ingredients: [
          { ingredientId: 'salt', displayName: 'Salt', amount: 1, unit: 'tsp' },
          { ingredientId: 'pepper', displayName: 'Pepper', amount: 1, unit: 'tsp' },
        ],
      };

      const createRes = await request(app).post('/api/recipes').send(recipe);
      const id = createRes.body.id;

      // Verify ingredient lines exist in Prisma DB before delete
      const linesBefore = await prisma.ingredientLine.findMany({ where: { recipeId: id } });
      expect(linesBefore).toHaveLength(2);

      await request(app).delete(`/api/recipes/${id}`);

      // Verify ingredient lines were cascade deleted in Prisma DB
      const linesAfter = await prisma.ingredientLine.findMany({ where: { recipeId: id } });
      expect(linesAfter).toHaveLength(0);
    });

    it('DELETE /api/recipes/:id for a nonexistent id returns 404', async () => {
      const res = await request(app).delete('/api/recipes/non-existent-id-404');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'NotFound');
    });
  });

  describe('POST /api/events/plan', () => {
    it('POST /api/events/plan with a valid guest group and a mix of real created recipes returns 200 with correct eligible servings for EACH recipe', async () => {
      // 1. Create 3 real recipes via POST /api/recipes
      const meatRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Beef Roast',
          baseServings: 6,
          ingredients: [{ ingredientId: 'beef', displayName: 'Beef', amount: 1, unit: 'kg' }],
        });

      const vegRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Mac and Cheese',
          baseServings: 4,
          dietaryTags: ['Vegetarian'],
          ingredients: [{ ingredientId: 'cheese', displayName: 'Cheddar', amount: 200, unit: 'g' }],
        });

      const veganRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Fruit Salad',
          baseServings: 6,
          dietaryTags: ['Vegan'],
          ingredients: [{ ingredientId: 'apple', displayName: 'Apple', amount: 3, unit: 'count' }],
        });

      const meatId = meatRes.body.id;
      const vegId = vegRes.body.id;
      const veganId = veganRes.body.id;

      // 2. Call POST /api/events/plan with 12 total, 3 veg, 1 vegan (9 omnivores, 2 veg-only, 1 vegan)
      const planReq = {
        recipeIds: [meatId, vegId, veganId],
        guestGroup: {
          totalGuests: 12,
          vegetarianCount: 3,
          veganCount: 1,
        },
      };

      const res = await request(app).post('/api/events/plan').send(planReq);

      expect(res.status).toBe(200);
      expect(res.body.guestGroup).toEqual({
        totalGuests: 12,
        vegetarianCount: 3,
        veganCount: 1,
        omnivoreCount: 9,
      });

      expect(res.body.includedRecipes).toHaveLength(3);
      expect(res.body.excludedRecipes).toHaveLength(0);

      const meatPlan = res.body.includedRecipes.find(
        (r: { recipeName: string }) => r.recipeName === 'Beef Roast'
      );
      const vegPlan = res.body.includedRecipes.find(
        (r: { recipeName: string }) => r.recipeName === 'Mac and Cheese'
      );
      const veganPlan = res.body.includedRecipes.find(
        (r: { recipeName: string }) => r.recipeName === 'Fruit Salad'
      );

      expect(meatPlan?.eligibleServings).toBe(9); // 9 omnivores
      expect(vegPlan?.eligibleServings).toBe(11); // 12 total - 1 vegan
      expect(veganPlan?.eligibleServings).toBe(12); // 12 total guests
    });

    it('POST /api/events/plan with an invalid guestGroup returns 400 with error name InvalidGuestGroupError', async () => {
      const meatRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Beef Roast',
          baseServings: 6,
          ingredients: [{ ingredientId: 'beef', displayName: 'Beef', amount: 1, unit: 'kg' }],
        });

      const invalidReq = {
        recipeIds: [meatRes.body.id],
        guestGroup: {
          totalGuests: 10,
          vegetarianCount: 2,
          veganCount: 5, // Invalid! veganCount > vegetarianCount
        },
      };

      const res = await request(app).post('/api/events/plan').send(invalidReq);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'InvalidGuestGroupError');
    });

    it('POST /api/events/plan with a nonexistent recipeId returns 404 naming the missing id', async () => {
      const realRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Beef Roast',
          baseServings: 6,
          ingredients: [{ ingredientId: 'beef', displayName: 'Beef', amount: 1, unit: 'kg' }],
        });

      const missingId = 'non-existent-recipe-id-999';
      const planReq = {
        recipeIds: [realRes.body.id, missingId],
        guestGroup: {
          totalGuests: 10,
          vegetarianCount: 2,
          veganCount: 1,
        },
      };

      const res = await request(app).post('/api/events/plan').send(planReq);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'NotFound');
      expect(res.body.message).toContain(missingId);
    });

    it('POST /api/events/plan with an empty recipeIds array returns 400', async () => {
      const emptyReq = {
        recipeIds: [],
        guestGroup: {
          totalGuests: 10,
          vegetarianCount: 2,
          veganCount: 1,
        },
      };

      const res = await request(app).post('/api/events/plan').send(emptyReq);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'InvalidRecipeError');
    });

    it('POST /api/events/plan correctly excludes a recipe with 0 eligible guests and includes the reason in the response', async () => {
      const meatRes = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Steak Dinner',
          baseServings: 2,
          ingredients: [{ ingredientId: 'beef', displayName: 'Steak', amount: 2, unit: 'lb' }],
        });

      const allVegReq = {
        recipeIds: [meatRes.body.id],
        guestGroup: {
          totalGuests: 10,
          vegetarianCount: 10, // 100% vegetarian guests
          veganCount: 2,
        },
      };

      const res = await request(app).post('/api/events/plan').send(allVegReq);

      expect(res.status).toBe(200);
      expect(res.body.includedRecipes).toHaveLength(0);
      expect(res.body.excludedRecipes).toHaveLength(1);
      expect(res.body.excludedRecipes[0].recipeName).toBe('Steak Dinner');
      expect(res.body.excludedRecipes[0].reason).toContain('No eligible guests');
      expect(res.body.shoppingList).toHaveLength(0);
    });

    it('POST /api/events/plan shoppingList correctly consolidates ingredients across multiple included recipes', async () => {
      // Group: 10 guests (2 vegetarians, 0 vegans) => 8 omnivores, 2 vegetarians
      // Recipe 1: Meat dish (8 eligible, base 4 => scale 2.0). Needs 500g potatoes
      const r1Res = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Shepherd Pie',
          baseServings: 4,
          ingredients: [
            { ingredientId: 'potato', displayName: 'Russet Potato', amount: 500, unit: 'g' },
          ],
        });

      // Recipe 2: Vegan dish (10 eligible, base 5 => scale 2.0). Needs 1 kg potatoes
      const r2Res = await request(app)
        .post('/api/recipes')
        .send({
          name: 'Mashed Potatoes',
          baseServings: 5,
          dietaryTags: ['Vegan'],
          ingredients: [
            { ingredientId: 'potato', displayName: 'Yukon Potato', amount: 1, unit: 'kg' },
          ],
        });

      const r1Id = r1Res.body.id;
      const r2Id = r2Res.body.id;

      const planReq = {
        recipeIds: [r1Id, r2Id],
        guestGroup: {
          totalGuests: 10,
          vegetarianCount: 2,
          veganCount: 0,
        },
      };

      const res = await request(app).post('/api/events/plan').send(planReq);

      expect(res.status).toBe(200);
      expect(res.body.includedRecipes).toHaveLength(2);
      expect(res.body.shoppingList).toHaveLength(1);

      const potatoItem = res.body.shoppingList[0];
      expect(potatoItem.ingredientId).toBe('potato');
      // 500g * 2.0 = 1000g + (1kg * 2.0 = 2000g) = 3000g
      expect(potatoItem.quantity.amount).toBe(3000);
      expect(potatoItem.quantity.unit).toBe('g');
      expect(potatoItem.sourceRecipeIds).toEqual([r1Id, r2Id]);
    });
  });
});
